import { Injectable } from '@nestjs/common';
import { InvoiceStatus, QuotationStatus } from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';

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
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Company-wide reporting aggregates (for MANAGER / FINANCE / ADMIN). */
  async report() {
    const [
      byStatus,
      totalDeals,
      completed,
      cancelled,
      pipelineAgg,
      discountAgg,
      revenueAgg,
      outstandingInvoices,
      overdue,
      pendingApprovals,
      decidedRequests,
      openBackorders,
      customerSums,
    ] = await Promise.all([
      this.prisma.quotation.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.quotation.count(),
      this.prisma.quotation.count({ where: { status: QuotationStatus.COMPLETED } }),
      this.prisma.quotation.count({ where: { status: QuotationStatus.CANCELLED } }),
      this.prisma.quotation.aggregate({ _sum: { total: true }, where: { status: { in: ACTIVE_STATUSES } } }),
      this.prisma.quotation.aggregate({ _avg: { discountPct: true } }),
      this.prisma.invoice.aggregate({ _sum: { paidAmount: true }, where: { status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID] } } }),
      this.prisma.invoice.findMany({ where: { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] } }, select: { total: true, paidAmount: true } }),
      this.prisma.invoice.findMany({ where: { status: InvoiceStatus.OVERDUE }, select: { total: true, paidAmount: true } }),
      this.prisma.approvalRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.approvalRequest.findMany({ where: { status: { not: 'PENDING' } }, select: { createdAt: true, updatedAt: true } }),
      this.prisma.backorder.count({ where: { status: { in: ['OPEN', 'PARTIALLY_ALLOCATED'] } } }),
      this.prisma.quotation.groupBy({ by: ['customerId'], _sum: { total: true } }),
    ]);

    const outstandingAmount = outstandingInvoices.reduce((a, i) => a + (Number(i.total) - Number(i.paidAmount)), 0);
    const overdueAmount = overdue.reduce((a, i) => a + (Number(i.total) - Number(i.paidAmount)), 0);

    const avgTurnaroundDays =
      decidedRequests.length === 0
        ? 0
        : decidedRequests.reduce((a, r) => a + (r.updatedAt.getTime() - r.createdAt.getTime()), 0) /
          decidedRequests.length /
          (1000 * 60 * 60 * 24);

    // Top customers by total quotation value.
    const topSorted = [...customerSums].sort((a, b) => Number(b._sum.total ?? 0) - Number(a._sum.total ?? 0)).slice(0, 5);
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: topSorted.map((c) => c.customerId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(customers.map((c) => [c.id, c.name]));
    const topCustomers = topSorted.map((c) => ({
      customer: nameById.get(c.customerId) ?? 'Unknown',
      total: Number(c._sum.total ?? 0),
    }));

    return {
      revenue: {
        collected: Number(revenueAgg._sum.paidAmount ?? 0),
        outstanding: Math.round(outstandingAmount),
        overdueAmount: Math.round(overdueAmount),
        overdueCount: overdue.length,
      },
      pipeline: { value: Number(pipelineAgg._sum.total ?? 0), activeDeals: byStatus.filter((s) => ACTIVE_STATUSES.includes(s.status as QuotationStatus)).reduce((a, s) => a + s._count._all, 0) },
      deals: {
        total: totalDeals,
        completed,
        cancelled,
        conversionRate: totalDeals ? Math.round((completed / totalDeals) * 100) : 0,
        byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      },
      approvals: { pending: pendingApprovals, avgTurnaroundDays: Math.round(avgTurnaroundDays * 10) / 10 },
      fulfillment: { openBackorders },
      discounts: { avgDiscountPct: Math.round(Number(discountAgg._avg.discountPct ?? 0) * 10) / 10 },
      topCustomers,
      generatedAt: new Date().toISOString(),
    };
  }
}
