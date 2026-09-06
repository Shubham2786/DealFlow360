import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
import { ApprovalRuleEngine } from '../approvals/approval-rule.engine';
import { AppSettingsService } from '../config/app-settings.service';

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
    private readonly approvalEngine: ApprovalRuleEngine,
    @Optional() private readonly appSettings?: AppSettingsService,
  ) { }

  /** Ensures the viewer is the deal creator/salesperson, or has team-level permissions. */
  assertCanModify(
    quotation: { createdById?: string | null; salespersonId?: string | null },
    viewer: Viewer,
  ) {
    if (viewer.role === UserRole.CUSTOMER) {
      throw new ForbiddenException('Customers cannot modify internal quotations');
    }
    if (
      viewer.role === UserRole.ADMIN ||
      viewer.role === UserRole.MANAGER ||
      (viewer.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM)
    ) {
      return;
    }
    if (
      (quotation.createdById && quotation.createdById === viewer.id) ||
      (quotation.salespersonId && quotation.salespersonId === viewer.id)
    ) {
      return;
    }
    throw new ForbiddenException('You do not have permission to modify this quotation');
  }

  /** Validates and applies a lifecycle transition transactionally, recording an audit event. */
  async transition(
    id: string,
    to: QuotationStatus,
    actor: { id?: string; name?: string },
    action: string,
  ) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw new NotFoundException(`Quotation ${id} not found`);

    this.stateMachine.assertTransition(quotation.status as QuotationStatus, to);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Release any active inventory reservations if quotation is cancelled
      if (to === QuotationStatus.CANCELLED) {
        const fulfillment = await tx.fulfillment.findUnique({
          where: { quotationId: id },
          include: { lines: { include: { reservations: { where: { status: ReservationStatus.ACTIVE } } } } },
        });
        if (fulfillment) {
          for (const line of fulfillment.lines) {
            for (const res of line.reservations) {
              await tx.inventory.update({
                where: { id: res.inventoryId },
                data: { reserved: { decrement: res.quantity } },
              });
              await tx.reservation.update({
                where: { id: res.id },
                data: { status: ReservationStatus.RELEASED, releasedAt: new Date() },
              });
            }
            await tx.fulfillmentLine.update({
              where: { id: line.id },
              data: { status: FulfillmentStatus.FAILED },
            });
          }
          await tx.fulfillment.update({
            where: { id: fulfillment.id },
            data: { status: FulfillmentStatus.FAILED },
          });
          await tx.backorder.updateMany({
            where: {
              fulfillmentLine: { fulfillmentId: fulfillment.id },
              status: { in: [BackorderStatus.OPEN, BackorderStatus.PARTIALLY_ALLOCATED] },
            },
            data: { status: BackorderStatus.CANCELLED },
          });
        }
      }

      return tx.quotation.update({
        where: { id },
        data: { status: to },
      });
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
      // Sales reps should see quotations they created OR are assigned to as salesperson
      // (customer-submitted orders assign a salesperson but set createdById to the customer)
      whereClause = {
        OR: [
          { createdById: viewer?.id ?? '__none__' },
          { salespersonId: viewer?.id ?? '__none__' },
        ],
      };
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
        negotiation: { include: { token: true, messages: { orderBy: { createdAt: 'asc' } } } },
      },
    });
    if (!quotation) throw new NotFoundException(`Quotation ${id} not found`);

    const isCustomer = viewer?.role === UserRole.CUSTOMER;

    // Ownership check: customer can only view deals addressed to their company email
    if (isCustomer) {
      if (!viewer.email || quotation.customer.contactEmail !== viewer.email) {
        throw new ForbiddenException('Access denied: quotation belongs to another organization');
      }
    }

    // Salesperson can only view their own deals unless they have team-wide permissions
    if (
      viewer &&
      !isCustomer &&
      !this.canViewAll(viewer) &&
      quotation.createdById !== viewer.id &&
      quotation.salespersonId !== viewer.id
    ) {
      throw new ForbiddenException('Access denied: you can only view your own deals');
    }

    // Ensure mathematically sound totals (defense-in-depth against legacy/seeded discrepancies)
    const linesSum = (quotation.lines ?? []).reduce((acc, l) => acc + Number(l.lineTotal), 0);
    const subtotal = linesSum > 0 ? linesSum : Number(quotation.subtotal);
    const discountPct = Number(quotation.discountPct);
    const discountTotal = Number(quotation.discountTotal) > 0 ? Number(quotation.discountTotal) : (subtotal * (discountPct / 100));
    const taxTotal = Number(quotation.taxTotal);
    const total = subtotal - discountTotal + taxTotal;

    return {
      ...quotation,
      subtotal,
      discountTotal,
      taxTotal,
      total,
      marginPct: isCustomer ? (0 as unknown as typeof quotation.marginPct) : quotation.marginPct,
    };
  }

  /** Safe sequential number generation without concurrency races. */
  private async nextNumber(): Promise<string> {
    const latest = await this.prisma.quotation.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    });
    let seq = 1001;
    if (latest?.number) {
      const match = latest.number.match(/(\d+)/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    const prefix = this.appSettings ? await this.appSettings.get('quotation_prefix', 'Q-') : 'Q-';
    return `${prefix}${seq}`;
  }

  /**
   * Previews quotation calculations, tax, estimated margin, and governance approval preview
   * without writing to the database.
   */
  async preview(input: CreateQuotationInput) {
    if (!input.lines?.length) {
      throw new BadRequestException('Quotation must contain at least one line');
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new NotFoundException(`Customer ${input.customerId} not found`);

    const headerDiscount = input.discountPct ?? 0;
    if (headerDiscount < 0 || headerDiscount > 100) {
      throw new BadRequestException('Header discount percentage must be between 0 and 100');
    }

    const productIds = input.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let estimatedCost = 0;

    const lineData = input.lines.map((line) => {
      const product = byId.get(line.productId);
      if (!product) throw new BadRequestException(`Product ${line.productId} not found`);
      const qty = Math.max(1, line.qty);
      const basePrice = Number(product.basePrice);
      const unitPrice = line.unitPrice !== undefined ? Number(line.unitPrice) : basePrice;
      const lineDiscount = line.discountPct ?? 0;
      const gross = unitPrice * qty;
      const lineTotal = gross * (1 - lineDiscount / 100);
      const taxRate = Number(product.taxRate);

      subtotal += lineTotal;
      const cost = Number((product as any).costPrice) || (basePrice * 0.7);
      estimatedCost += cost * qty;

      return {
        productId: product.id,
        productName: product.name,
        category: product.category ?? 'Hardware',
        sku: product.sku,
        qty,
        basePrice,
        unitPrice,
        discountPct: lineDiscount,
        taxRate,
        lineTotal,
      };
    });

    const discountTotal = subtotal * (headerDiscount / 100);
    const afterHeaderDiscount = subtotal - discountTotal;
    const blendedTax = lineData.reduce((acc, l) => acc + l.taxRate, 0) / (lineData.length || 1);
    const taxTotal = afterHeaderDiscount * (blendedTax / 100);
    const total = afterHeaderDiscount + taxTotal;
    const marginPct = total > 0 ? ((afterHeaderDiscount - estimatedCost) / afterHeaderDiscount) * 100 : 0;

    const governance = await this.approvalEngine.evaluate({
      discountPct: headerDiscount,
      marginPct: Number(marginPct.toFixed(2)),
      total,
      customerSegment: customer.segment,
      lines: lineData,
    });

    return {
      subtotal: Number(subtotal.toFixed(2)),
      discountPct: headerDiscount,
      discountTotal: Number(discountTotal.toFixed(2)),
      taxTotal: Number(taxTotal.toFixed(2)),
      total: Number(total.toFixed(2)),
      marginPct: Number(marginPct.toFixed(2)),
      lines: lineData,
      governance,
    };
  }

  /**
   * Creates a quotation, computing line totals, quotation-level pricing, and demonstration margin.
   */
  async create(input: CreateQuotationInput) {
    if (!input.lines?.length) {
      throw new BadRequestException('Quotation must contain at least one line');
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new NotFoundException(`Customer ${input.customerId} not found`);

    if (input.discountPct !== undefined && (input.discountPct < 0 || input.discountPct > 100)) {
      throw new BadRequestException('Header discount percentage must be between 0 and 100');
    }

    const productIds = input.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds } } });
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
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
      const cost = Number((product as any).costPrice) || (Number(product.basePrice) * 0.7);
      estimatedCost += cost * line.qty;

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
    const blendedTax =
      lineData.reduce((acc, l) => acc + l.taxRate, 0) / (lineData.length || 1);
    const taxTotal = afterHeaderDiscount * (blendedTax / 100);
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

  /**
   * Applies an updated discount (e.g. from customer negotiation counter-offer)
   * and recalculates totals and margins.
   */
  async applyDiscount(id: string, newDiscountPct: number, actor: { id?: string; name?: string }) {
    if (newDiscountPct < 0 || newDiscountPct > 100) {
      throw new BadRequestException('Discount percentage must be between 0 and 100');
    }

    const q = await this.prisma.quotation.findUnique({
      where: { id },
      include: { lines: { include: { product: true } } },
    });
    if (!q) throw new NotFoundException(`Quotation ${id} not found`);

    const subtotal = Number(q.subtotal);
    const discountTotal = subtotal * (newDiscountPct / 100);
    const afterDiscount = subtotal - discountTotal;

    const blendedTax = q.lines.reduce((acc, l) => acc + Number(l.taxRate), 0) / (q.lines.length || 1);
    const taxTotal = afterDiscount * (blendedTax / 100);
    const total = afterDiscount + taxTotal;

    const estimatedCost = q.lines.reduce(
      (acc, l) => acc + (Number((l.product as any).costPrice) || (Number(l.product.basePrice) * 0.7)) * l.qty,
      0,
    );
    const marginPct = total > 0 ? ((afterDiscount - estimatedCost) / afterDiscount) * 100 : 0;

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: {
        discountPct: newDiscountPct,
        discountTotal,
        taxTotal,
        total,
        marginPct: Number(marginPct.toFixed(2)),
      },
      include: { lines: true },
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Quotation',
      entityId: id,
      action: 'DISCOUNT_UPDATED',
      message: `${q.number}: discount updated to ${newDiscountPct}%`,
    });

    return updated;
  }

  /**
   * Allows customer personas to initiate an inbound self-service order request.
   * Auto-resolves customer entity from contactEmail, assigns dedicated rep,
   * creates a Quotation in NEGOTIATION status, creates a CustomerPortalToken, and audits the event.
   */
  async createCustomerOrder(
    input: { lines: { productId: string; qty: number }[]; notes?: string },
    user: Viewer,
  ) {
    if (!input.lines?.length) {
      throw new BadRequestException('Order request must contain at least one item');
    }

    // 1. Resolve Customer by user.email
    const customer = await this.prisma.customer.findFirst({
      where: user.email ? { contactEmail: user.email } : { id: '__none__' },
      include: {
        quotations: {
          where: { salespersonId: { not: null } },
          select: { salespersonId: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) {
      throw new NotFoundException('No associated customer profile found for this account');
    }

    // 2. Resolve dedicated salesperson
    let salespersonId = customer.quotations[0]?.salespersonId ?? null;
    if (!salespersonId) {
      const defaultSales = await this.prisma.user.findFirst({
        where: { role: { name: UserRole.USER }, status: 'ACTIVE' },
      });
      salespersonId = defaultSales?.id ?? null;
    }

    // 3. Load active catalog products
    const productIds = input.lines.map((l) => l.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, active: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let estimatedCost = 0;
    const lineData = input.lines.map((l) => {
      const p = byId.get(l.productId);
      if (!p) throw new BadRequestException(`Product ${l.productId} is invalid or inactive`);
      const qty = Math.max(1, l.qty);
      const unitPrice = Number(p.basePrice);
      const lineGross = unitPrice * qty;
      const taxRate = Number(p.taxRate ?? 0);
      subtotal += lineGross;
      const cost = Number((p as any).costPrice) || (unitPrice * 0.7);
      estimatedCost += cost * qty;

      return {
        productId: p.id,
        qty,
        unitPrice,
        discountPct: 0,
        taxRate,
        lineTotal: lineGross,
      };
    });

    const blendedTax = lineData.reduce((acc, l) => acc + l.taxRate, 0) / (lineData.length || 1);
    const taxTotal = subtotal * (blendedTax / 100);
    const total = subtotal + taxTotal;
    const marginPct = total > 0 ? ((subtotal - estimatedCost) / subtotal) * 100 : 0;
    const number = await this.nextNumber();

    // 4. Generate token and 14-day expiry
    const tokenStr = `portal-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const quotation = await this.prisma.quotation.create({
      data: {
        number,
        customerId: customer.id,
        salespersonId,
        createdById: user.id,
        status: QuotationStatus.NEGOTIATION,
        discountPct: 0,
        subtotal,
        discountTotal: 0,
        taxTotal,
        total,
        marginPct: Number(marginPct.toFixed(2)),
        expiresAt,
        lines: { create: lineData },
        negotiation: {
          create: {
            status: 'OPEN',
            token: {
              create: {
                token: tokenStr,
                expiresAt,
              },
            },
            messages: input.notes
              ? {
                  create: {
                    author: 'CUSTOMER',
                    body: input.notes,
                  },
                }
              : undefined,
          },
        },
      },
      include: {
        lines: { include: { product: true } },
        negotiation: { include: { token: true } },
      },
    });

    await this.audit.record({
      actorId: user.id,
      actorName: (user as any).name ?? user.email,
      entityType: 'Quotation',
      entityId: quotation.id,
      action: 'CUSTOMER_ORDER_PLACED',
      message: `Customer ${customer.name} placed order request ${quotation.number}`,
    });

    return {
      quotation,
      token: tokenStr,
      portalUrl: `/customer-portal/${tokenStr}`,
    };
  }
}
