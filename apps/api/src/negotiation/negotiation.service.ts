import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { QuotationStatus } from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DealStateMachine } from '../quotations/deal-state-machine';

type Actor = { id?: string; name?: string };

@Injectable()
export class NegotiationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: DealStateMachine,
    private readonly audit: AuditService,
  ) {}

  /** Ensure a negotiation + portal token exist for a quote and return the shareable token. */
  async createPortalLink(quotationId: string, actor: Actor) {
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { negotiation: { include: { token: true } } },
    });
    if (!quote) throw new NotFoundException(`Quotation ${quotationId} not found`);

    let negotiation = quote.negotiation;
    if (!negotiation) {
      negotiation = await this.prisma.negotiation.create({
        data: { quotationId, status: 'OPEN' },
        include: { token: true },
      });
    }

    let token = negotiation.token;
    if (!token || token.revoked || token.expiresAt < new Date()) {
      const value = randomBytes(24).toString('hex');
      token = await this.prisma.portalToken.upsert({
        where: { negotiationId: negotiation.id },
        create: {
          negotiationId: negotiation.id,
          token: value,
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
        update: { token: value, revoked: false, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
      });
    }

    // Move the deal into NEGOTIATION when the lifecycle allows it.
    if (this.stateMachine.canTransition(quote.status as QuotationStatus, QuotationStatus.NEGOTIATION)) {
      await this.prisma.quotation.update({ where: { id: quotationId }, data: { status: QuotationStatus.NEGOTIATION } });
    }

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Quotation',
      entityId: quotationId,
      action: 'NEGOTIATION_STARTED',
      message: `${quote.number}: portal link shared with customer`,
    });

    return { token: token.token, expiresAt: token.expiresAt };
  }

  /** Internal view of the negotiation thread. */
  async internalThread(quotationId: string) {
    const negotiation = await this.prisma.negotiation.findUnique({
      where: { quotationId },
      include: { messages: { orderBy: { createdAt: 'asc' } }, token: true },
    });
    return negotiation;
  }

  private async resolveToken(token: string) {
    const pt = await this.prisma.portalToken.findUnique({
      where: { token },
      include: { negotiation: { include: { quotation: true } } },
    });
    if (!pt || pt.revoked || pt.expiresAt < new Date()) {
      throw new NotFoundException('This link is invalid or has expired');
    }
    return pt;
  }

  /** Customer-facing projection — NO internal fields (margin, notes, salesperson, cost). */
  async publicView(token: string) {
    const pt = await this.resolveToken(token);
    const quote = await this.prisma.quotation.findUnique({
      where: { id: pt.negotiation.quotationId },
      include: {
        customer: { select: { name: true } },
        lines: { include: { product: { select: { sku: true, name: true } } } },
        negotiation: { include: { messages: { orderBy: { createdAt: 'asc' } } } },
      },
    });
    if (!quote) throw new NotFoundException('Proposal not found');

    return {
      quoteNumber: quote.number,
      customer: quote.customer?.name,
      status: quote.status,
      negotiationStatus: quote.negotiation?.status ?? 'OPEN',
      validUntil: quote.expiresAt,
      lines: quote.lines.map((l) => ({
        product: l.product.name,
        sku: l.product.sku,
        qty: l.qty,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        lineTotal: l.lineTotal,
      })),
      subtotal: quote.subtotal,
      discountPct: quote.discountPct,
      discountTotal: quote.discountTotal,
      taxTotal: quote.taxTotal,
      total: quote.total,
      messages: (quote.negotiation?.messages ?? []).map((m) => ({
        author: m.author,
        body: m.body,
        at: m.createdAt,
      })),
    };
  }

  /** Customer responds. A change request is a MATERIAL change → forces re-approval. */
  async respond(
    token: string,
    action: 'accept' | 'reject' | 'request-change',
    body?: string,
    requestedDiscountPct?: number,
  ) {
    const pt = await this.resolveToken(token);
    const negotiationId = pt.negotiationId;
    const quotationId = pt.negotiation.quotationId;
    const quote = pt.negotiation.quotation;

    if (action === 'request-change') {
      await this.prisma.negotiationMessage.create({
        data: {
          negotiationId,
          author: 'CUSTOMER',
          body: body ?? 'Customer requested changes',
          requestedDiscountPct: requestedDiscountPct ?? null,
        },
      });
      await this.prisma.negotiation.update({ where: { id: negotiationId }, data: { status: 'CUSTOMER_RESPONDED' } });

      // Material change: the deal must re-enter negotiation/revision. If it was APPROVED,
      // this deliberately unwinds the approval so it cannot be fulfilled without re-approval.
      if (this.stateMachine.canTransition(quote.status as QuotationStatus, QuotationStatus.NEGOTIATION)) {
        await this.prisma.quotation.update({ where: { id: quotationId }, data: { status: QuotationStatus.NEGOTIATION } });
      }
      await this.audit.record({
        entityType: 'Quotation',
        entityId: quotationId,
        actorName: 'Customer',
        action: 'CUSTOMER_REQUESTED_CHANGE',
        message: `${quote.number}: customer requested change${requestedDiscountPct != null ? ` (discount ${requestedDiscountPct}%)` : ''} — re-approval required`,
      });
      return { ok: true, status: 'CUSTOMER_RESPONDED', reapprovalRequired: true };
    }

    if (action === 'accept') {
      if (body) await this.prisma.negotiationMessage.create({ data: { negotiationId, author: 'CUSTOMER', body } });
      await this.prisma.negotiation.update({ where: { id: negotiationId }, data: { status: 'ACCEPTED' } });
      await this.audit.record({ entityType: 'Quotation', entityId: quotationId, actorName: 'Customer', action: 'CUSTOMER_ACCEPTED', message: `${quote.number}: customer accepted the proposal` });
      return { ok: true, status: 'ACCEPTED' };
    }

    // reject
    if (body) await this.prisma.negotiationMessage.create({ data: { negotiationId, author: 'CUSTOMER', body } });
    await this.prisma.negotiation.update({ where: { id: negotiationId }, data: { status: 'REJECTED' } });
    await this.audit.record({ entityType: 'Quotation', entityId: quotationId, actorName: 'Customer', action: 'CUSTOMER_REJECTED', message: `${quote.number}: customer rejected the proposal` });
    return { ok: true, status: 'REJECTED' };
  }
}
