import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingFrequency, Permission, SubscriptionStatus, UserRole } from '@dealflow/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppSettingsService } from '../config/app-settings.service';

export interface SubscriptionViewer {
  id?: string;
  email?: string;
  role?: string;
  permissions?: string[];
}

type Actor = SubscriptionViewer & { id?: string; name?: string };

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
    private readonly appSettings: AppSettingsService,
  ) {}

  list(viewer?: SubscriptionViewer) {
    const isCustomer = viewer?.role === UserRole.CUSTOMER;
    const isTeamOrFinance =
      viewer?.role === UserRole.ADMIN ||
      viewer?.role === UserRole.FINANCE ||
      (viewer?.permissions ?? []).includes(Permission.FINANCE_DATA_VIEW) ||
      (viewer?.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM);

    let whereClause: Prisma.SubscriptionWhereInput | undefined;
    if (isCustomer && viewer?.email) {
      whereClause = { customer: { contactEmail: viewer.email } };
    } else if (!isTeamOrFinance && viewer?.id) {
      whereClause = {
        quotation: {
          OR: [{ createdById: viewer.id }, { salespersonId: viewer.id }],
        },
      };
    }

    return this.prisma.subscription.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        quotation: { select: { id: true, number: true, createdById: true, salespersonId: true } },
        lines: { include: { product: true } },
      },
    });
  }

  async get(id: string, viewer?: SubscriptionViewer) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: { select: { id: true, number: true, createdById: true, salespersonId: true } },
        lines: { include: { product: true } },
      },
    });
    if (!sub) throw new NotFoundException(`Subscription ${id} not found`);

    if (viewer?.role === UserRole.CUSTOMER) {
      if (!sub.customer?.contactEmail || sub.customer.contactEmail !== viewer.email) {
        throw new ForbiddenException('You do not have access to this subscription');
      }
    } else if (viewer) {
      const isTeamOrFinance =
        viewer.role === UserRole.ADMIN ||
        viewer.role === UserRole.FINANCE ||
        (viewer.permissions ?? []).includes(Permission.FINANCE_DATA_VIEW) ||
        (viewer.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM);

      if (!isTeamOrFinance && viewer.id) {
        const isOwner =
          sub.quotation?.createdById === viewer.id ||
          sub.quotation?.salespersonId === viewer.id;
        if (!isOwner) {
          throw new ForbiddenException('You do not have access to this subscription');
        }
      }
    }

    return sub;
  }

  private async nextNumber(): Promise<string> {
    const latest = await this.prisma.subscription.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { number: true },
    });
    let seq = 5001;
    if (latest?.number) {
      const match = latest.number.match(/(\d+)/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    const prefix = await this.appSettings.get('subscription_prefix', 'SUB-');
    return `${prefix}${seq}`;
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
    const sub = await this.get(id, actor);
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
    const sub = await this.get(id, actor);
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
    const sub = await this.get(id, actor);
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
