import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingFrequency, SubscriptionStatus, UserRole } from '@dealflow/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type Actor = { id?: string; name?: string };

export interface SubscriptionViewer {
  id?: string;
  email?: string;
  role?: string;
  permissions?: string[];
}

export interface CreateSubscriptionDto {
  customerId: string;
  quotationId?: string;
  frequency?: BillingFrequency;
  startDate?: string;
  endDate?: string;
  notes?: string;
  lines: {
    productId: string;
    qty: number;
    unitPrice: number;
  }[];
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(viewer?: SubscriptionViewer) {
    const isCustomer = viewer?.role === UserRole.CUSTOMER;
    return this.prisma.subscription.findMany({
      where: isCustomer && viewer?.email ? { customer: { contactEmail: viewer.email } } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        quotation: { select: { id: true, number: true } },
        lines: { include: { product: true } },
      },
    });
  }

  async get(id: string, viewer?: SubscriptionViewer) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: { select: { id: true, number: true } },
        lines: { include: { product: true } },
      },
    });
    if (!sub) throw new NotFoundException(`Subscription ${id} not found`);

    if (viewer?.role === UserRole.CUSTOMER) {
      if (!sub.customer?.contactEmail || sub.customer.contactEmail !== viewer.email) {
        throw new ForbiddenException('You do not have access to this subscription');
      }
    }

    return sub;
  }

  private async nextNumber(): Promise<string> {
    const count = await this.prisma.subscription.count();
    return `SUB-${5000 + count + 1}`;
  }

  async create(dto: CreateSubscriptionDto, actor: Actor) {
    if (!dto.lines?.length) {
      throw new BadRequestException('Subscription must contain at least one line');
    }

    const number = await this.nextNumber();
    const frequency = dto.frequency ?? BillingFrequency.ANNUAL;
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = dto.endDate
      ? new Date(dto.endDate)
      : new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000); // default 1 year

    const recurringAmount = dto.lines.reduce(
      (sum, line) => sum + line.qty * line.unitPrice,
      0,
    );

    const subscription = await this.prisma.subscription.create({
      data: {
        number,
        customerId: dto.customerId,
        quotationId: dto.quotationId,
        status: SubscriptionStatus.ACTIVE,
        frequency,
        startDate,
        endDate,
        nextBillingDate: startDate,
        recurringAmount: new Prisma.Decimal(recurringAmount),
        notes: dto.notes,
        lines: {
          create: dto.lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            unitPrice: new Prisma.Decimal(l.unitPrice),
            lineTotal: new Prisma.Decimal(l.qty * l.unitPrice),
          })),
        },
      },
      include: {
        customer: true,
        lines: { include: { product: true } },
      },
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Subscription',
      entityId: subscription.id,
      action: 'SUBSCRIPTION_CREATED',
      message: `Subscription ${subscription.number} created (₹${recurringAmount}/${frequency.toLowerCase()})`,
    });

    return subscription;
  }

  async pause(id: string, actor: Actor) {
    const sub = await this.get(id);
    if (sub.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException(`Cannot pause subscription with status ${sub.status}`);
    }

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status: SubscriptionStatus.PAUSED },
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Subscription',
      entityId: id,
      action: 'SUBSCRIPTION_PAUSED',
      message: `Subscription ${sub.number} paused`,
    });

    return updated;
  }

  async resume(id: string, actor: Actor) {
    const sub = await this.get(id);
    if (sub.status !== SubscriptionStatus.PAUSED) {
      throw new BadRequestException(`Cannot resume subscription with status ${sub.status}`);
    }

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status: SubscriptionStatus.ACTIVE },
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Subscription',
      entityId: id,
      action: 'SUBSCRIPTION_RESUMED',
      message: `Subscription ${sub.number} resumed`,
    });

    return updated;
  }

  async cancel(id: string, actor: Actor) {
    const sub = await this.get(id);
    if (sub.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Subscription is already cancelled');
    }

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status: SubscriptionStatus.CANCELLED },
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'Subscription',
      entityId: id,
      action: 'SUBSCRIPTION_CANCELLED',
      message: `Subscription ${sub.number} cancelled`,
    });

    return updated;
  }
}
