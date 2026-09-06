import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Permission, QuotationStatus, UserRole } from '@dealflow/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DealStateMachine } from '../quotations/deal-state-machine';
import { AppSettingsService } from '../config/app-settings.service';

type Actor = { id?: string; name?: string };

export interface InvoiceViewer {
  id?: string;
  email?: string;
  role?: string;
  permissions?: string[];
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: DealStateMachine,
    private readonly audit: AuditService,
    private readonly appSettings: AppSettingsService,
  ) {}

  list(viewer?: InvoiceViewer) {
    const isCustomer = viewer?.role === UserRole.CUSTOMER;
    const isTeamOrFinance =
      viewer?.role === UserRole.ADMIN ||
      viewer?.role === UserRole.FINANCE ||
      (viewer?.permissions ?? []).includes(Permission.FINANCE_DATA_VIEW) ||
      (viewer?.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM);

    let whereClause: Prisma.InvoiceWhereInput | undefined;
    if (isCustomer && viewer?.email) {
      whereClause = { customer: { contactEmail: viewer.email } };
    } else if (!isTeamOrFinance && viewer?.id) {
      whereClause = {
        quotation: {
          OR: [{ createdById: viewer.id }, { salespersonId: viewer.id }],
        },
      };
    }

    return this.prisma.invoice.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: { customer: true, quotation: { select: { id: true, number: true, createdById: true, salespersonId: true } } },
    });
  }

  async get(id: string, viewer?: InvoiceViewer) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: { select: { id: true, number: true, createdById: true, salespersonId: true } },
        lines: true,
        payments: { orderBy: { receivedAt: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);

    if (viewer?.role === UserRole.CUSTOMER) {
      if (!invoice.customer?.contactEmail || invoice.customer.contactEmail !== viewer.email) {
        throw new ForbiddenException('You do not have access to this invoice');
      }
    } else if (viewer) {
      const isTeamOrFinance =
        viewer.role === UserRole.ADMIN ||
        viewer.role === UserRole.FINANCE ||
        (viewer.permissions ?? []).includes(Permission.FINANCE_DATA_VIEW) ||
        (viewer.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM);

      if (!isTeamOrFinance && viewer.id) {
        const isOwner =
          invoice.quotation?.createdById === viewer.id ||
          invoice.quotation?.salespersonId === viewer.id;
        if (!isOwner) {
          throw new ForbiddenException('You do not have access to this invoice');
        }
      }
    }

    return invoice;
  }

  private async nextNumber(): Promise<string> {
    const latest = await this.prisma.invoice.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    });
    let seq = 3001;
    if (latest?.number) {
      const match = latest.number.match(/(\d+)/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    const prefix = await this.appSettings.get('invoice_prefix', 'INV-');
    return `${prefix}${seq}`;
  }

  /** Generate an invoice from a fulfilled quotation (GST/INR). Idempotent per quotation for active invoices. */
  async generateFromQuotation(quotationId: string, actor: Actor) {
    const quote = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { lines: { include: { product: true } }, invoices: true },
    });
    if (!quote) throw new NotFoundException(`Quotation ${quotationId} not found`);
    const activeInvoices = quote.invoices.filter((inv) => inv.status !== InvoiceStatus.CANCELLED);
    if (activeInvoices.length > 0) return this.get(activeInvoices[0].id); // idempotent

    const billable: QuotationStatus[] = [
      QuotationStatus.FULFILLED,
      QuotationStatus.PARTIALLY_FULFILLED,
    ];
    if (!billable.includes(quote.status as QuotationStatus)) {
      throw new ConflictException('Only fulfilled deals can be invoiced');
    }

    const netSubtotal = Number(quote.subtotal) - Number(quote.discountTotal);
    const number = await this.nextNumber();
    const paymentDays = await this.appSettings.getNumber('default_payment_terms_days', 30);
    const paymentTerms = await this.appSettings.get('default_payment_terms', `Net ${paymentDays}`);
    const dueDate = new Date(Date.now() + paymentDays * 24 * 60 * 60 * 1000);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          number,
          customerId: quote.customerId,
          quotationId,
          status: InvoiceStatus.ISSUED,
          issueDate: new Date(),
          dueDate,
          paymentTerms,
          subtotal: netSubtotal,
          gstTotal: quote.taxTotal,
          total: quote.total,
          lines: {
            create: quote.lines.map((l) => ({
              description: l.product.name,
              qty: l.qty,
              unitPrice: l.unitPrice,
              gstRate: l.taxRate,
              lineTotal: l.lineTotal,
            })),
          },
        },
      });

      // Lifecycle: FULFILLED → BILLING → INVOICED
      let status = quote.status as QuotationStatus;
      if (this.stateMachine.canTransition(status, QuotationStatus.BILLING)) {
        await tx.quotation.update({ where: { id: quotationId }, data: { status: QuotationStatus.BILLING } });
        status = QuotationStatus.BILLING;
      }
      if (this.stateMachine.canTransition(status, QuotationStatus.INVOICED)) {
        await tx.quotation.update({ where: { id: quotationId }, data: { status: QuotationStatus.INVOICED } });
      }
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Invoice',
      entityId: invoice.id,
      action: 'INVOICE_GENERATED',
      message: `${number} generated from ${quote.number}`,
    });
    return this.get(invoice.id);
  }

  /** Record a payment; updates status and, when fully paid, completes the deal. */
  async recordPayment(
    invoiceId: string,
    input: { amount: number; method?: string; reference?: string },
    actor: Actor,
  ) {
    if (input.amount <= 0) throw new BadRequestException('Payment amount must be greater than zero');

    return this.prisma.$transaction(async (tx) => {
      // Lock invoice row to prevent concurrent payment race conditions
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;

      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: true,
          quotation: { select: { id: true, number: true, createdById: true, salespersonId: true } },
          lines: true,
          payments: { orderBy: { receivedAt: 'desc' } },
        },
      });
      if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
      if (invoice.status === InvoiceStatus.CANCELLED) throw new ConflictException('Invoice is cancelled');
      if (invoice.status === InvoiceStatus.PAID) throw new ConflictException('Invoice is already paid');

      const currentPaid = Number(invoice.paidAmount);
      const total = Number(invoice.total);
      const newPaid = currentPaid + input.amount;

      if (newPaid > total + 0.01) {
        throw new BadRequestException(
          `Payment exceeds outstanding balance (₹${(total - currentPaid).toFixed(2)})`,
        );
      }
      const fullyPaid = newPaid >= total - 0.01;

      await tx.payment.create({
        data: {
          invoiceId,
          amount: input.amount,
          method: input.method ?? 'UPI',
          reference: input.reference,
        },
      });

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaid,
          status: fullyPaid ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID,
        },
        include: {
          customer: true,
          quotation: { select: { id: true, number: true, createdById: true, salespersonId: true } },
          lines: true,
          payments: { orderBy: { receivedAt: 'desc' } },
        },
      });

      if (fullyPaid && invoice.quotationId) {
        const q = await tx.quotation.findUnique({ where: { id: invoice.quotationId } });
        if (q) {
          let status = q.status as QuotationStatus;
          if (this.stateMachine.canTransition(status, QuotationStatus.PAID)) {
            await tx.quotation.update({ where: { id: q.id }, data: { status: QuotationStatus.PAID } });
            status = QuotationStatus.PAID;
          }
          if (this.stateMachine.canTransition(status, QuotationStatus.COMPLETED)) {
            await tx.quotation.update({ where: { id: q.id }, data: { status: QuotationStatus.COMPLETED } });
          }
        }
      }

      await this.audit.record({
        actorId: actor.id,
        actorName: actor.name,
        entityType: 'Invoice',
        entityId: invoiceId,
        action: 'PAYMENT_RECORDED',
        message: `₹${input.amount} recorded on ${invoice.number}${fullyPaid ? ' (paid in full)' : ''}`,
      });

      return updated;
    });
  }

  async cancel(invoiceId: string, actor: Actor) {
    const invoice = await this.get(invoiceId);
    if (invoice.status === InvoiceStatus.PAID) throw new ConflictException('Cannot cancel a paid invoice');

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.CANCELLED } });
      if (invoice.quotationId) {
        const q = await tx.quotation.findUnique({ where: { id: invoice.quotationId } });
        if (q && [QuotationStatus.INVOICED, QuotationStatus.BILLING].includes(q.status as QuotationStatus)) {
          await tx.quotation.update({
            where: { id: invoice.quotationId },
            data: { status: QuotationStatus.FULFILLED },
          });
        }
      }
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Invoice',
      entityId: invoiceId,
      action: 'INVOICE_CANCELLED',
      message: `${invoice.number} cancelled`,
    });
    return this.get(invoiceId);
  }
}
