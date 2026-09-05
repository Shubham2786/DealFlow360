import { Injectable } from '@nestjs/common';
import { InvoiceStatus, QuotationStatus } from '@dealflow/shared';
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

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Aggregated KPIs, alerts and recent activity for the Sales Dashboard. */
  async metrics() {
    const now = new Date();

    const [
      totalCustomers,
      totalProducts,
      draftQuotations,
      pendingApprovals,
      approvedDeals,
      awaitingFulfillment,
      activeDeals,
      outstandingInvoices,
      overdueInvoices,
      revenueAgg,
      recent,
    ] = await Promise.all([
      this.prisma.customer.count(),
      this.prisma.product.count(),
      this.prisma.quotation.count({ where: { status: QuotationStatus.DRAFT } }),
      this.prisma.quotation.count({ where: { status: QuotationStatus.PENDING_APPROVAL } }),
      this.prisma.quotation.count({ where: { status: QuotationStatus.APPROVED } }),
      this.prisma.quotation.count({
        where: {
          status: { in: [QuotationStatus.APPROVED, QuotationStatus.CONVERTED_TO_FULFILLMENT] },
        },
      }),
      this.prisma.quotation.count({ where: { status: { in: ACTIVE_STATUSES } } }),
      this.prisma.invoice.count({
        where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] } },
      }),
      this.prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE } }),
      this.prisma.invoice.aggregate({
        _sum: { paidAmount: true },
        where: { status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID] } },
      }),
      this.audit.recent(12),
    ]);

    const pipelineAgg = await this.prisma.quotation.aggregate({
      _sum: { total: true },
      where: { status: { in: ACTIVE_STATUSES } },
    });

    return {
      kpis: {
        activeDeals,
        draftQuotations,
        pendingApprovals,
        approvedDeals,
        awaitingFulfillment,
        outstandingInvoices,
        overdueInvoices,
        totalCustomers,
        totalProducts,
        revenue: Number(revenueAgg._sum.paidAmount ?? 0),
        pipelineValue: Number(pipelineAgg._sum.total ?? 0),
      },
      alerts: this.buildAlerts({ pendingApprovals, overdueInvoices, awaitingFulfillment }),
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
    pendingApprovals: number;
    overdueInvoices: number;
    awaitingFulfillment: number;
  }) {
    const alerts: { severity: string; label: string; href: string }[] = [];
    if (input.pendingApprovals > 0)
      alerts.push({
        severity: 'warning',
        label: `${input.pendingApprovals} approval(s) pending`,
        href: '/approvals',
      });
    if (input.overdueInvoices > 0)
      alerts.push({
        severity: 'critical',
        label: `${input.overdueInvoices} overdue invoice(s)`,
        href: '/invoices',
      });
    if (input.awaitingFulfillment > 0)
      alerts.push({
        severity: 'info',
        label: `${input.awaitingFulfillment} deal(s) awaiting fulfillment`,
        href: '/fulfillment',
      });
    return alerts;
  }
}
