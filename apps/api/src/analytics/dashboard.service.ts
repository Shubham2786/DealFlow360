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
  role: string;
  permissions: string[];
}

export interface Alert {
  severity: string;
  label: string;
  href: string;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) { }

  /**
   * Role-aware dashboard. USER sees only their own deals; MANAGER/ADMIN see team-wide;
   * FINANCE/ADMIN additionally see billing KPIs; ADMIN sees system totals.
   * `variant` tells the frontend which layout to render.
   */
  async metrics(viewer: DashboardViewer) {
    const now = new Date();
    const isTeam = viewer.role === UserRole.ADMIN || viewer.permissions.includes(Permission.DEAL_VIEW_TEAM);
    const isFinance = viewer.role === UserRole.ADMIN || viewer.permissions.includes(Permission.FINANCE_DATA_VIEW);
    const isAdmin = viewer.role === UserRole.ADMIN;
    const variant = viewer.role;

    // Deal queries are scoped to the viewer unless they have team visibility.
    const dealScope = isTeam ? {} : { createdById: viewer.id };

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
