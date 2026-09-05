import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BackorderStatus,
  FulfillmentStatus,
  Permission,
  QuotationStatus,
  ReservationStatus,
  UserRole,
} from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DealStateMachine } from './deal-state-machine';

/** Minimal viewer context for ownership/visibility checks. */
export interface Viewer {
  id: string;
  email?: string;
  role: string;
  permissions: string[];
}

export interface QuotationLineInput {
  productId: string;
  qty: number;
  unitPrice?: number;
  discountPct?: number;
}

export interface CreateQuotationInput {
  customerId: string;
  salespersonId?: string;
  createdById?: string;
  discountPct?: number;
  expiresAt?: string;
  lines: QuotationLineInput[];
}

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: DealStateMachine,
    private readonly audit: AuditService,
  ) { }

  /** Validates and applies a lifecycle transition, recording an audit event. */
  async transition(
    id: string,
    to: QuotationStatus,
    actor: { id?: string; name?: string },
    action: string,
  ) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw new NotFoundException(`Quotation ${id} not found`);

    this.stateMachine.assertTransition(quotation.status as QuotationStatus, to);

    // Release any active inventory reservations if quotation is cancelled
    if (to === QuotationStatus.CANCELLED) {
      const fulfillment = await this.prisma.fulfillment.findUnique({
        where: { quotationId: id },
        include: { lines: { include: { reservations: { where: { status: ReservationStatus.ACTIVE } } } } },
      });
      if (fulfillment) {
        for (const line of fulfillment.lines) {
          for (const res of line.reservations) {
            await this.prisma.inventory.update({
              where: { id: res.inventoryId },
              data: { reserved: { decrement: res.quantity } },
            });
            await this.prisma.reservation.update({
              where: { id: res.id },
              data: { status: ReservationStatus.RELEASED, releasedAt: new Date() },
            });
          }
          await this.prisma.fulfillmentLine.update({
            where: { id: line.id },
            data: { status: FulfillmentStatus.FAILED },
          });
        }
        await this.prisma.fulfillment.update({
          where: { id: fulfillment.id },
          data: { status: FulfillmentStatus.FAILED },
        });
        await this.prisma.backorder.updateMany({
          where: {
            fulfillmentLine: { fulfillmentId: fulfillment.id },
            status: { in: [BackorderStatus.OPEN, BackorderStatus.PARTIALLY_ALLOCATED] },
          },
          data: { status: BackorderStatus.CANCELLED },
        });
      }
    }

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: to },
    });
    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Quotation',
      entityId: id,
      action,
      message: `${quotation.number}: ${quotation.status} → ${to}`,
    });
    return updated;
  }

  submit(id: string, actor: { id?: string; name?: string }) {
    // Submitting routes the deal to approval; the Approvals module will attach the
    // required approval chain on top of this transition.
    return this.transition(id, QuotationStatus.PENDING_APPROVAL, actor, 'QUOTATION_SUBMITTED');
  }

  cancel(id: string, actor: { id?: string; name?: string }) {
    return this.transition(id, QuotationStatus.CANCELLED, actor, 'QUOTATION_CANCELLED');
  }

  revise(id: string, actor: { id?: string; name?: string }) {
    return this.transition(id, QuotationStatus.DRAFT, actor, 'QUOTATION_REVISED');
  }

  /** Team-wide visibility (managers/finance/admin) vs. own-only (plain users). */
  private canViewAll(viewer?: Viewer): boolean {
    if (!viewer) return false;
    return viewer.role === UserRole.ADMIN || (viewer.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM);
  }

  /** Lists deals scoped to the viewer: own only unless they can view the team; customer gets their company's quotes. */
  async list(viewer?: Viewer) {
    const isCustomer = viewer?.role === UserRole.CUSTOMER;
    let whereClause: Record<string, unknown> | undefined;

    if (this.canViewAll(viewer)) {
      whereClause = undefined;
    } else if (isCustomer && viewer?.email) {
      whereClause = { customer: { contactEmail: viewer.email } };
    } else {
      whereClause = { createdById: viewer?.id ?? '__none__' };
    }

    const quotes = await this.prisma.quotation.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: { customer: true, salesperson: { select: { id: true, name: true } } },
    });

    // ADR-0014: Never expose internal margin percentage to customer personas
    if (isCustomer) {
      return quotes.map((q) => ({
        ...q,
        marginPct: 0 as unknown as typeof q.marginPct,
      }));
    }

    return quotes;
  }

  async get(id: string, viewer?: Viewer) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        salesperson: { select: { id: true, name: true } },
        lines: { include: { product: true } },
        invoices: true,
      },
    });
    if (!quotation) throw new NotFoundException(`Quotation ${id} not found`);

    const isCustomer = viewer?.role === UserRole.CUSTOMER;

    // Ownership check: customer can only view deals addressed to their company email
    if (isCustomer) {
      if (!quotation.customer?.contactEmail || quotation.customer.contactEmail !== viewer?.email) {
        throw new ForbiddenException('You do not have access to this proposal');
      }
      // ADR-0014: Redact margin from customer view
      return {
        ...quotation,
        marginPct: 0 as unknown as typeof quotation.marginPct,
      };
    }

    // Plain internal user may only view their own deals.
    if (!this.canViewAll(viewer) && quotation.createdById && quotation.createdById !== viewer?.id) {
      throw new ForbiddenException('You do not have access to this deal');
    }

    return quotation;
  }

  private async nextNumber(): Promise<string> {
    const count = await this.prisma.quotation.count();
    return `Q-${1000 + count + 1}`;
  }

  /**
   * Creates a quotation, computing line totals and quotation-level pricing.
   * Cost is estimated at 70% of base price to derive a demonstrable margin.
   */
  async create(input: CreateQuotationInput) {
    if (!input.lines?.length) {
      throw new BadRequestException('Quotation must contain at least one line');
    }

    // Verify customer exists
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new NotFoundException(`Customer ${input.customerId} not found`);

    if (input.discountPct !== undefined && (input.discountPct < 0 || input.discountPct > 100)) {
      throw new BadRequestException('Header discount percentage must be between 0 and 100');
    }

    const productIds = input.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let taxTotal = 0;
    let estimatedCost = 0;
    const headerDiscount = input.discountPct ?? 0;

    const lineData = input.lines.map((line) => {
      const product = byId.get(line.productId);
      if (!product) throw new BadRequestException(`Product ${line.productId} not found`);
      if (line.qty <= 0) throw new BadRequestException('Line quantity must be greater than zero');
      if (line.unitPrice !== undefined && line.unitPrice < 0) {
        throw new BadRequestException('Unit price cannot be negative');
      }
      if (line.discountPct !== undefined && (line.discountPct < 0 || line.discountPct > 100)) {
        throw new BadRequestException('Line discount percentage must be between 0 and 100');
      }

      const unitPrice = line.unitPrice ?? Number(product.basePrice);
      const lineDiscount = line.discountPct ?? 0;
      const gross = unitPrice * line.qty;
      const afterLineDiscount = gross * (1 - lineDiscount / 100);
      const taxRate = Number(product.taxRate);

      subtotal += afterLineDiscount;
      estimatedCost += Number(product.basePrice) * line.qty * 0.7;

      return {
        productId: product.id,
        qty: line.qty,
        unitPrice,
        discountPct: lineDiscount,
        taxRate,
        lineTotal: afterLineDiscount,
      };
    });

    const discountTotal = subtotal * (headerDiscount / 100);
    const afterHeaderDiscount = subtotal - discountTotal;
    // Tax computed on the discounted subtotal using a blended average of line tax rates.
    const blendedTax =
      lineData.reduce((acc, l) => acc + l.taxRate, 0) / (lineData.length || 1);
    taxTotal = afterHeaderDiscount * (blendedTax / 100);
    const total = afterHeaderDiscount + taxTotal;
    const marginPct = total > 0 ? ((afterHeaderDiscount - estimatedCost) / afterHeaderDiscount) * 100 : 0;

    const number = await this.nextNumber();

    return this.prisma.quotation.create({
      data: {
        number,
        customerId: input.customerId,
        salespersonId: input.salespersonId,
        createdById: input.createdById ?? input.salespersonId,
        discountPct: headerDiscount,
        subtotal,
        discountTotal,
        taxTotal,
        total,
        marginPct: Number(marginPct.toFixed(2)),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        lines: { create: lineData },
      },
      include: { lines: true },
    });
  }
}
