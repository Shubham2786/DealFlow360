import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AllocationSource,
  BackorderStatus,
  FulfillmentStatus,
  Permission,
  QuotationStatus,
  ReservationStatus,
  UserRole,
} from '@dealflow/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DealStateMachine } from '../quotations/deal-state-machine';
import { AllocationEngine, WarehouseAvailability } from './allocation.engine';

type Actor = { id?: string; name?: string; role?: string; permissions?: string[] };

export interface FulfillmentViewer {
  id?: string;
  role?: string;
  permissions?: string[];
}

@Injectable()
export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: AllocationEngine,
    private readonly stateMachine: DealStateMachine,
    private readonly audit: AuditService,
  ) { }

  list(viewer?: FulfillmentViewer) {
    const isTeam =
      viewer?.role === UserRole.ADMIN ||
      viewer?.role === UserRole.MANAGER ||
      (viewer?.permissions ?? []).includes(Permission.TASK_ALLOCATE) ||
      (viewer?.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM);

    let whereClause: Prisma.FulfillmentWhereInput | undefined;
    if (!isTeam && viewer?.id) {
      whereClause = {
        quotation: {
          OR: [{ createdById: viewer.id }, { salespersonId: viewer.id }],
        },
      };
    }

    return this.prisma.fulfillment.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: { customer: true, quotation: { select: { id: true, number: true, createdById: true, salespersonId: true } }, lines: true },
    });
  }

  async get(id: string, viewer?: FulfillmentViewer) {
    const f = await this.prisma.fulfillment.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: { select: { id: true, number: true, status: true, createdById: true, salespersonId: true } },
        lines: {
          include: {
            product: true,
            allocations: { include: { warehouse: true } },
            reservations: true,
            backorders: true,
          },
        },
      },
    });
    if (!f) throw new NotFoundException(`Fulfillment ${id} not found`);

    if (viewer) {
      const isTeam =
        viewer.role === UserRole.ADMIN ||
        viewer.role === UserRole.MANAGER ||
        (viewer.permissions ?? []).includes(Permission.TASK_ALLOCATE) ||
        (viewer.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM);

      if (!isTeam && viewer.id) {
        const isOwner =
          f.quotation?.createdById === viewer.id ||
          f.quotation?.salespersonId === viewer.id;
        if (!isOwner) {
          throw new ForbiddenException('You do not have access to this fulfillment order');
        }
      }
    }

    return f;
  }

  private async nextNumber(): Promise<string> {
    const latest = await this.prisma.fulfillment.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    });
    let seq = 2001;
    if (latest?.number) {
      const match = latest.number.match(/(\d+)/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    return `F-${seq}`;
  }

  /** Convert an APPROVED quotation into a fulfillment order (one line per quotation line). */
  async createFromQuotation(quotationId: string, actor: Actor) {
    const number = await this.nextNumber();
    const fulfillment = await this.prisma.$transaction(async (tx) => {
      const quote = await tx.quotation.findUnique({
        where: { id: quotationId },
        include: { lines: true, fulfillment: true },
      });
      if (!quote) throw new NotFoundException(`Quotation ${quotationId} not found`);
      if (quote.fulfillment) return quote.fulfillment; // idempotent
      if (quote.status !== QuotationStatus.APPROVED) {
        throw new ConflictException('Only APPROVED quotations can be converted to fulfillment');
      }

      const created = await tx.fulfillment.create({
        data: {
          number,
          quotationId,
          customerId: quote.customerId,
          status: FulfillmentStatus.PENDING,
          lines: {
            create: quote.lines.map((l) => ({
              productId: l.productId,
              orderedQty: l.qty,
            })),
          },
        },
      });
      // APPROVED → CONVERTED_TO_FULFILLMENT
      this.stateMachine.assertTransition(
        quote.status as QuotationStatus,
        QuotationStatus.CONVERTED_TO_FULFILLMENT,
      );
      await tx.quotation.update({
        where: { id: quotationId },
        data: { status: QuotationStatus.CONVERTED_TO_FULFILLMENT },
      });
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Fulfillment',
      entityId: fulfillment.id,
      action: 'FULFILLMENT_CREATED',
      message: `${number} created for quotation ${quotationId}`,
    });
    return this.get(fulfillment.id, actor);
  }

  /**
   * Allocate all outstanding line quantities from inventory.
   * Runs in a transaction with SELECT ... FOR UPDATE row locks (ordered by id) so two
   * concurrent allocations can never over-reserve the same stock.
   */
  async allocate(fulfillmentId: string, actor: Actor) {
    const fulfillment = await this.get(fulfillmentId);

    for (const line of fulfillment.lines) {
      await this.prisma.$transaction(async (tx) => {
        // Re-read line inside the transaction to avoid race conditions
        const freshLine = await tx.fulfillmentLine.findUnique({ where: { id: line.id } });
        if (!freshLine) return;

        const outstanding = freshLine.orderedQty - freshLine.allocatedQty - freshLine.backorderedQty;
        if (outstanding <= 0) return;

        // Lock this product's inventory rows for the duration of the transaction.
        await tx.$queryRaw`SELECT id FROM inventory WHERE "productId" = ${line.productId} ORDER BY id FOR UPDATE`;

        const invRows = await tx.inventory.findMany({
          where: { productId: line.productId, warehouse: { active: true } },
          include: { warehouse: true },
        });
        const availability: WarehouseAvailability[] = invRows.map((inv) => ({
          warehouseId: inv.warehouseId,
          inventoryId: inv.id,
          priority: inv.warehouse.priority,
          available: inv.onHand - inv.reserved,
        }));

        const plan = this.engine.allocate(outstanding, availability);

        for (const entry of plan.entries) {
          const reservation = await tx.reservation.create({
            data: {
              inventoryId: entry.inventoryId,
              fulfillmentLineId: line.id,
              quantity: entry.quantity,
              status: ReservationStatus.ACTIVE,
            },
          });
          await tx.allocation.create({
            data: {
              fulfillmentLineId: line.id,
              warehouseId: entry.warehouseId,
              inventoryId: entry.inventoryId,
              reservationId: reservation.id,
              quantity: entry.quantity,
              source: AllocationSource.INITIAL,
            },
          });
          await tx.inventory.update({
            where: { id: entry.inventoryId },
            data: { reserved: { increment: entry.quantity } },
          });
        }

        const newAllocated = freshLine.allocatedQty + plan.allocated;
        const newBackordered = freshLine.backorderedQty + plan.backordered;
        await tx.fulfillmentLine.update({
          where: { id: line.id },
          data: {
            allocatedQty: newAllocated,
            backorderedQty: newBackordered,
            status:
              newAllocated >= freshLine.orderedQty
                ? FulfillmentStatus.ALLOCATED
                : newAllocated > 0
                  ? FulfillmentStatus.PARTIALLY_ALLOCATED
                  : FulfillmentStatus.BACKORDERED,
          },
        });

        if (plan.backordered > 0) {
          await tx.backorder.create({
            data: {
              fulfillmentLineId: line.id,
              productId: line.productId,
              originalQty: plan.backordered,
              remainingQty: plan.backordered,
              status: BackorderStatus.OPEN,
            },
          });
        }
      });
    }

    await this.recomputeStatus(fulfillmentId, actor, 'FULFILLMENT_ALLOCATED');
    return this.get(fulfillmentId);
  }

  /** Ship allocated stock: consume reservations, reduce on-hand, mark line/fulfillment. */
  async fulfill(fulfillmentId: string, actor: Actor) {
    const fulfillment = await this.get(fulfillmentId);

    for (const line of fulfillment.lines) {
      const toFulfill = line.allocatedQty - line.fulfilledQty;
      if (toFulfill <= 0) continue;

      await this.prisma.$transaction(async (tx) => {
        const activeReservations = await tx.reservation.findMany({
          where: { fulfillmentLineId: line.id, status: ReservationStatus.ACTIVE },
        });
        for (const res of activeReservations) {
          await tx.inventory.update({
            where: { id: res.inventoryId },
            data: {
              onHand: { decrement: res.quantity },
              reserved: { decrement: res.quantity },
            },
          });
          await tx.reservation.update({
            where: { id: res.id },
            data: { status: ReservationStatus.FULFILLED, fulfilledAt: new Date() },
          });
        }
        await tx.fulfillmentLine.update({
          where: { id: line.id },
          data: { fulfilledQty: line.allocatedQty, status: FulfillmentStatus.FULFILLED },
        });
      });
    }

    await this.recomputeStatus(fulfillmentId, actor, 'FULFILLMENT_FULFILLED');
    return this.get(fulfillmentId);
  }

  /** Rolls fulfillment + quotation status up from line states. */
  private async recomputeStatus(fulfillmentId: string, actor: Actor, action: string) {
    const f = await this.prisma.fulfillment.findUnique({
      where: { id: fulfillmentId },
      include: { lines: true, quotation: true },
    });
    if (!f) return;

    const allFulfilled = f.lines.every((l) => l.fulfilledQty >= l.orderedQty);
    const allAllocated = f.lines.every((l) => l.allocatedQty >= l.orderedQty);
    const anyBackorder = f.lines.some((l) => l.backorderedQty > 0);

    let status: FulfillmentStatus;
    if (allFulfilled) status = FulfillmentStatus.FULFILLED;
    else if (allAllocated) status = FulfillmentStatus.ALLOCATED;
    else if (f.lines.some((l) => l.allocatedQty > 0)) status = FulfillmentStatus.PARTIALLY_ALLOCATED;
    else if (anyBackorder) status = FulfillmentStatus.BACKORDERED;
    else status = FulfillmentStatus.PENDING;

    await this.prisma.fulfillment.update({ where: { id: fulfillmentId }, data: { status } });

    // Drive quotation lifecycle where valid.
    const q = f.quotation;
    const target =
      status === FulfillmentStatus.FULFILLED
        ? QuotationStatus.FULFILLED
        : QuotationStatus.FULFILLING;
    if (this.stateMachine.canTransition(q.status as QuotationStatus, target)) {
      await this.prisma.quotation.update({ where: { id: q.id }, data: { status: target } });
    }

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Fulfillment',
      entityId: fulfillmentId,
      action,
      message: `${f.number}: ${status}`,
    });
  }

  // ---------- Inventory ----------

  listInventory() {
    return this.prisma.inventory.findMany({
      orderBy: [{ productId: 'asc' }],
      include: { product: true, warehouse: true },
    });
  }

  listWarehouses() {
    return this.prisma.warehouse.findMany({ orderBy: { priority: 'asc' } });
  }

  /**
   * Receive stock (idempotent by reference), then reprocess open backorders for the
   * product by priority (oldest first) — allocating from the freshly received stock.
   */
  async receive(
    input: { warehouseId: string; productId: string; quantity: number; reference: string },
    actor: Actor,
  ) {
    if (input.quantity <= 0) throw new BadRequestException('Quantity must be greater than zero');

    const existing = await this.prisma.inventoryReceipt.findUnique({
      where: { reference: input.reference },
    });
    if (existing) return { idempotent: true, receiptId: existing.id }; // no double count

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryReceipt.create({ data: input });
      await tx.inventory.upsert({
        where: { productId_warehouseId: { productId: input.productId, warehouseId: input.warehouseId } },
        create: { productId: input.productId, warehouseId: input.warehouseId, onHand: input.quantity, reserved: 0 },
        update: { onHand: { increment: input.quantity } },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'InventoryReceipt',
      entityId: input.reference,
      action: 'INVENTORY_RECEIVED',
      message: `Received ${input.quantity} of product ${input.productId}`,
    });

    const result = await this.reprocessBackorders(input.productId, actor);
    return { idempotent: false, ...result };
  }

  /** Allocate open backorders for a product (FIFO by creation) from available stock. */
  private async reprocessBackorders(productId: string, actor: Actor) {
    const backorders = await this.prisma.backorder.findMany({
      where: { productId, status: { in: [BackorderStatus.OPEN, BackorderStatus.PARTIALLY_ALLOCATED] } },
      orderBy: { createdAt: 'asc' },
      include: { fulfillmentLine: true },
    });

    let fulfilledCount = 0;
    for (const bo of backorders) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM inventory WHERE "productId" = ${productId} ORDER BY id FOR UPDATE`;
        const invRows = await tx.inventory.findMany({
          where: { productId, warehouse: { active: true } },
          include: { warehouse: true },
        });
        const availability: WarehouseAvailability[] = invRows.map((inv) => ({
          warehouseId: inv.warehouseId,
          inventoryId: inv.id,
          priority: inv.warehouse.priority,
          available: inv.onHand - inv.reserved,
        }));

        const plan = this.engine.allocate(bo.remainingQty, availability);
        if (plan.allocated === 0) return;

        for (const entry of plan.entries) {
          const reservation = await tx.reservation.create({
            data: {
              inventoryId: entry.inventoryId,
              fulfillmentLineId: bo.fulfillmentLineId,
              quantity: entry.quantity,
              status: ReservationStatus.ACTIVE,
            },
          });
          await tx.allocation.create({
            data: {
              fulfillmentLineId: bo.fulfillmentLineId,
              warehouseId: entry.warehouseId,
              inventoryId: entry.inventoryId,
              reservationId: reservation.id,
              quantity: entry.quantity,
              source: AllocationSource.BACKORDER,
            },
          });
          await tx.inventory.update({
            where: { id: entry.inventoryId },
            data: { reserved: { increment: entry.quantity } },
          });
        }

        const newRemaining = bo.remainingQty - plan.allocated;
        await tx.backorder.update({
          where: { id: bo.id },
          data: {
            remainingQty: newRemaining,
            status: newRemaining === 0 ? BackorderStatus.FULFILLED : BackorderStatus.PARTIALLY_ALLOCATED,
          },
        });
        await tx.fulfillmentLine.update({
          where: { id: bo.fulfillmentLineId },
          data: {
            allocatedQty: { increment: plan.allocated },
            backorderedQty: { decrement: plan.allocated },
            status:
              bo.fulfillmentLine.allocatedQty + plan.allocated >= bo.fulfillmentLine.orderedQty
                ? FulfillmentStatus.ALLOCATED
                : FulfillmentStatus.PARTIALLY_ALLOCATED,
          },
        });
        if (newRemaining === 0) fulfilledCount += 1;
      });

      // Roll the parent fulfillment/quotation status up.
      const line = await this.prisma.fulfillmentLine.findUnique({ where: { id: bo.fulfillmentLineId } });
      if (line) await this.recomputeStatus(line.fulfillmentId, actor, 'BACKORDER_REALLOCATED');
    }

    return { backordersProcessed: backorders.length, backordersFulfilled: fulfilledCount };
  }
}
