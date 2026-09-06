import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Permission, QuotationStatus, UserRole } from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const ACTIVE_STATUSES: QuotationStatus[] = [
  QuotationStatus.SUBMITTED,
  QuotationStatus.PENDING_APPROVAL,
  QuotationStatus.CHANGES_REQUESTED,
  QuotationStatus.APPROVED,
  QuotationStatus.NEGOTIATION,
  QuotationStatus.CONVERTED_TO_FULFILLMENT,
  QuotationStatus.FULFILLING,
  QuotationStatus.PARTIALLY_FULFILLED,
  QuotationStatus.BILLING,
  QuotationStatus.INVOICED,
];

export interface DashboardViewer {
  id: string;
  email?: string;
  role: string;
  permissions: string[];
}

export interface Alert {
  severity: string;
  label: string;
  href: string;
}

export interface CustomerDashboardData {
  id: string;
  name: string;
  segment: string;
  contactName: string | null;
  contactEmail: string | null;
  accountManager: { name: string; email: string } | null;
  proposals: {
    id: string;
    number: string;
    total: number;
    status: string;
    validUntil: string | null;
    token?: string;
  }[];
  invoices: {
    id: string;
    number: string;
    total: number;
    paidAmount: number;
    status: string;
    dueDate: string | null;
  }[];
  subscriptions: {
    id: string;
    number: string;
    amount: number;
    frequency: string;
    status: string;
    nextBillingDate: string | null;
  }[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) { }

  /**
   * Role-aware dashboard.
   * - CUSTOMER sees their proposals, orders, invoices, and active subscriptions.
   * - USER sees only their own deals.
   * - MANAGER/ADMIN see team-wide.
   * - FINANCE/ADMIN additionally see billing KPIs.
   * - ADMIN sees system totals.
   */
  async metrics(viewer: DashboardViewer) {
    const now = new Date();
    const isCustomer = viewer.role === UserRole.CUSTOMER;

    if (isCustomer) {
      return this.customerMetrics(viewer);
    }

    const isTeam = viewer.role === UserRole.ADMIN || viewer.permissions.includes(Permission.DEAL_VIEW_TEAM);
    const isFinance = viewer.role === UserRole.ADMIN || viewer.permissions.includes(Permission.FINANCE_DATA_VIEW);
    const isAdmin = viewer.role === UserRole.ADMIN;
    const variant = viewer.role;

    // Deal queries are scoped to the viewer unless they have team visibility.
    // For sales reps, include deals where they are the salesperson (e.g. customer-submitted orders)
    // as well as deals they created directly.
    const dealScope = isTeam
      ? {}
      : { OR: [{ createdById: viewer.id }, { salespersonId: viewer.id }] };

    const [draftQuotations, pendingApprovals, approvedDeals, activeDeals, pipelineAgg] =
      await Promise.all([
        this.prisma.quotation.count({ where: { ...dealScope, status: QuotationStatus.DRAFT } }),
        this.prisma.quotation.count({ where: { ...dealScope, status: QuotationStatus.PENDING_APPROVAL } }),
        this.prisma.quotation.count({ where: { ...dealScope, status: QuotationStatus.APPROVED } }),
        this.prisma.quotation.count({ where: { ...dealScope, status: { in: ACTIVE_STATUSES } } }),
        this.prisma.quotation.aggregate({ _sum: { total: true }, where: { ...dealScope, status: { in: ACTIVE_STATUSES } } }),
      ]);

    const kpis: Record<string, number> = {
      activeDeals,
      draftQuotations,
      pendingApprovals,
      approvedDeals,
      pipelineValue: Number(pipelineAgg._sum.total ?? 0),
    };

    if (isTeam) {
      kpis.awaitingFulfillment = await this.prisma.quotation.count({
        where: { status: { in: [QuotationStatus.APPROVED, QuotationStatus.CONVERTED_TO_FULFILLMENT] } },
      });
    }

    if (isFinance) {
      const [outstanding, overdue, revenueAgg] = await Promise.all([
        this.prisma.invoice.count({ where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] } } }),
        this.prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE } }),
        this.prisma.invoice.aggregate({
          _sum: { paidAmount: true },
          where: { status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID] } },
        }),
      ]);
      kpis.outstandingInvoices = outstanding;
      kpis.overdueInvoices = overdue;
      kpis.revenue = Number(revenueAgg._sum.paidAmount ?? 0);
    }

    if (isAdmin) {
      const [totalCustomers, totalProducts, totalUsers] = await Promise.all([
        this.prisma.customer.count(),
        this.prisma.product.count(),
        this.prisma.user.count(),
      ]);
      kpis.totalCustomers = totalCustomers;
      kpis.totalProducts = totalProducts;
      kpis.totalUsers = totalUsers;
    }

    // Activity: own actions for a plain user; global for team/finance/admin.
    const recent = isTeam || isFinance
      ? await this.audit.recent(12)
      : await this.prisma.auditEvent.findMany({
        where: { actorId: viewer.id },
        orderBy: { createdAt: 'desc' },
        take: 12,
      });

    return {
      variant,
      kpis,
      alerts: this.buildAlerts({ variant, isTeam, isFinance, kpis }),
      recentActivity: recent.map((e) => ({
        id: e.id,
        action: e.action,
        message: e.message,
        actor: e.actorName,
        at: e.createdAt,
      })),
      generatedAt: now.toISOString(),
    };
  }

  private async customerMetrics(viewer: DashboardViewer) {
    const now = new Date();
    const customer = await this.prisma.customer.findFirst({
      where: viewer.email ? { contactEmail: viewer.email } : { id: '__none__' },
      include: {
        quotations: {
          orderBy: { createdAt: 'desc' },
          include: {
            salesperson: { select: { name: true, email: true } },
            negotiation: { include: { token: true } },
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!customer) {
      return {
        variant: UserRole.CUSTOMER,
        kpis: { activeProposals: 0, approvedDeals: 0, outstandingInvoices: 0, activeSubscriptions: 0 },
        customer: null,
        alerts: [],
        recentActivity: [],
        generatedAt: now.toISOString(),
      };
    }

    const proposalStatuses: QuotationStatus[] = [
      QuotationStatus.DRAFT,
      QuotationStatus.SUBMITTED,
      QuotationStatus.PENDING_APPROVAL,
      QuotationStatus.NEGOTIATION,
    ];
    const orderStatuses: QuotationStatus[] = [
      QuotationStatus.APPROVED,
      QuotationStatus.CONVERTED_TO_FULFILLMENT,
      QuotationStatus.FULFILLING,
      QuotationStatus.PARTIALLY_FULFILLED,
      QuotationStatus.FULFILLED,
    ];

    const activeProposals = customer.quotations.filter((q) =>
      proposalStatuses.includes(q.status as QuotationStatus),
    ).length;

    const approvedDeals = customer.quotations.filter((q) =>
      orderStatuses.includes(q.status as QuotationStatus),
    ).length;

    const outstandingInvoices = customer.invoices.filter(
      (i) => i.status !== InvoiceStatus.PAID && i.status !== InvoiceStatus.CANCELLED,
    ).length;

    const activeSubscriptions = customer.subscriptions.filter(
      (s) => s.status === 'ACTIVE',
    ).length;

    // Find account manager from the most recent quote with a salesperson
    const repQuote = customer.quotations.find((q) => q.salesperson);
    const accountManager = repQuote?.salesperson
      ? { name: repQuote.salesperson.name, email: repQuote.salesperson.email }
      : null;

    const customerData: CustomerDashboardData = {
      id: customer.id,
      name: customer.name,
      segment: customer.segment,
      contactName: customer.contactName,
      contactEmail: customer.contactEmail,
      accountManager,
      proposals: customer.quotations.map((q) => ({
        id: q.id,
        number: q.number,
        total: Number(q.total),
        status: q.status,
        validUntil: q.expiresAt ? q.expiresAt.toISOString() : null,
        token: q.negotiation?.token?.token,
      })),
      invoices: customer.invoices.map((i) => ({
        id: i.id,
        number: i.number,
        total: Number(i.total),
        paidAmount: Number(i.paidAmount),
        status: i.status,
        dueDate: i.dueDate ? i.dueDate.toISOString() : null,
      })),
      subscriptions: customer.subscriptions.map((s) => ({
        id: s.id,
        number: s.number,
        amount: Number(s.recurringAmount),
        frequency: s.frequency,
        status: s.status,
        nextBillingDate: s.nextBillingDate ? s.nextBillingDate.toISOString() : null,
      })),
    };

    const alerts: Alert[] = [];
    if (activeProposals > 0) {
      alerts.push({
        severity: 'info',
        label: `${activeProposals} commercial proposal(s) available for your review`,
        href: '/quotations',
      });
    }
    if (outstandingInvoices > 0) {
      alerts.push({
        severity: 'warning',
        label: `${outstandingInvoices} invoice(s) awaiting payment`,
        href: '/invoices',
      });
    }

    return {
      variant: UserRole.CUSTOMER,
      kpis: {
        activeProposals,
        approvedDeals,
        outstandingInvoices,
        activeSubscriptions,
      },
      customer: customerData,
      alerts,
      recentActivity: [],
      generatedAt: now.toISOString(),
    };
  }

  private buildAlerts(input: {
    variant: string;
    isTeam: boolean;
    isFinance: boolean;
    kpis: Record<string, number>;
  }): Alert[] {
    const alerts: Alert[] = [];
    const k = input.kpis;
    if (input.isTeam && k.pendingApprovals > 0)
      alerts.push({ severity: 'warning', label: `${k.pendingApprovals} approval(s) pending`, href: '/approvals' });
    if (input.isTeam && (k.awaitingFulfillment ?? 0) > 0)
      alerts.push({ severity: 'info', label: `${k.awaitingFulfillment} deal(s) awaiting fulfillment`, href: '/fulfillment' });
    if (input.isFinance && (k.overdueInvoices ?? 0) > 0)
      alerts.push({ severity: 'critical', label: `${k.overdueInvoices} overdue invoice(s)`, href: '/invoices' });
    if (!input.isTeam && k.pendingApprovals > 0)
      alerts.push({ severity: 'info', label: `${k.pendingApprovals} of your deal(s) awaiting approval`, href: '/quotations' });
    return alerts;
  }
}
