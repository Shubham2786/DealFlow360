import { Injectable } from '@nestjs/common';
import { DealHealth, InvoiceStatus, QuotationStatus } from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';

// Thresholds (would be configuration-driven in the full Admin module).
const EXCESSIVE_DISCOUNT_PCT = 15;
const LOW_MARGIN_PCT = 15;
const APPROVAL_STUCK_DAYS = 5;
const EXPIRY_WARNING_DAYS = 7;

export interface Anomaly {
  dealId: string;
  dealRef: string;
  customer: string;
  type: string;
  severity: 'WARNING' | 'CRITICAL';
  detectedAt: string;
  explanation: string;
  recommendedAction: string;
  drilldown: string;
}

@Injectable()
export class DealHealthService {
  constructor(private readonly prisma: PrismaService) {}

  private daysBetween(a: Date, b: Date): number {
    return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
  }

  /** Derives per-deal anomalies and an overall health summary from live domain data. */
  async overview() {
    const now = new Date();
    const quotations = await this.prisma.quotation.findMany({
      where: { status: { notIn: [QuotationStatus.CANCELLED, QuotationStatus.COMPLETED] } },
      include: { customer: true, invoices: true },
    });

    const anomalies: Anomaly[] = [];
    const criticalDeals = new Set<string>();
    const warningDeals = new Set<string>();

    for (const q of quotations) {
      const discount = Number(q.discountPct);
      const margin = Number(q.marginPct);
      const customerName = q.customer?.name ?? 'Unknown';

      if (discount > EXCESSIVE_DISCOUNT_PCT) {
        anomalies.push({
          dealId: q.id,
          dealRef: q.number,
          customer: customerName,
          type: 'EXCESSIVE_DISCOUNT',
          severity: 'WARNING',
          detectedAt: now.toISOString(),
          explanation: `Discount ${discount}% exceeds the ${EXCESSIVE_DISCOUNT_PCT}% threshold`,
          recommendedAction: 'Review pricing / route for approval',
          drilldown: `/quotations/${q.id}`,
        });
        warningDeals.add(q.id);
      }

      if (margin < LOW_MARGIN_PCT) {
        anomalies.push({
          dealId: q.id,
          dealRef: q.number,
          customer: customerName,
          type: 'LOW_MARGIN',
          severity: 'CRITICAL',
          detectedAt: now.toISOString(),
          explanation: `Margin ${margin}% is below the ${LOW_MARGIN_PCT}% threshold`,
          recommendedAction: 'Renegotiate terms or escalate to finance',
          drilldown: `/quotations/${q.id}`,
        });
        criticalDeals.add(q.id);
      }

      if (
        q.status === QuotationStatus.PENDING_APPROVAL &&
        this.daysBetween(now, q.createdAt) >= APPROVAL_STUCK_DAYS
      ) {
        anomalies.push({
          dealId: q.id,
          dealRef: q.number,
          customer: customerName,
          type: 'APPROVAL_STUCK',
          severity: 'WARNING',
          detectedAt: now.toISOString(),
          explanation: `Pending approval for ${this.daysBetween(now, q.createdAt)} days`,
          recommendedAction: 'Follow up with the current approver',
          drilldown: `/approvals`,
        });
        warningDeals.add(q.id);
      }

      if (
        q.expiresAt &&
        [QuotationStatus.DRAFT, QuotationStatus.SUBMITTED, QuotationStatus.NEGOTIATION].includes(
          q.status as QuotationStatus,
        ) &&
        this.daysBetween(q.expiresAt, now) <= EXPIRY_WARNING_DAYS &&
        q.expiresAt >= now
      ) {
        anomalies.push({
          dealId: q.id,
          dealRef: q.number,
          customer: customerName,
          type: 'NEARING_EXPIRY',
          severity: 'WARNING',
          detectedAt: now.toISOString(),
          explanation: `Quote expires in ${this.daysBetween(q.expiresAt, now)} day(s)`,
          recommendedAction: 'Send reminder or extend validity',
          drilldown: `/quotations/${q.id}`,
        });
        warningDeals.add(q.id);
      }

      for (const inv of q.invoices) {
        const overdue =
          inv.status === InvoiceStatus.OVERDUE ||
          (inv.dueDate &&
            inv.dueDate < now &&
            inv.status !== InvoiceStatus.PAID &&
            inv.status !== InvoiceStatus.CANCELLED);
        if (overdue) {
          anomalies.push({
            dealId: q.id,
            dealRef: q.number,
            customer: customerName,
            type: 'OVERDUE_INVOICE',
            severity: 'CRITICAL',
            detectedAt: now.toISOString(),
            explanation: `Invoice ${inv.number} is overdue`,
            recommendedAction: 'Trigger collections follow-up',
            drilldown: `/invoices/${inv.id}`,
          });
          criticalDeals.add(q.id);
        }
      }
    }

    const total = quotations.length;
    const critical = criticalDeals.size;
    const warning = Array.from(warningDeals).filter((id) => !criticalDeals.has(id)).length;
    const healthy = Math.max(total - critical - warning, 0);

    return {
      summary: {
        totalDeals: total,
        [DealHealth.HEALTHY]: healthy,
        [DealHealth.WARNING]: warning,
        [DealHealth.CRITICAL]: critical,
      },
      anomalies: anomalies.sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === 'CRITICAL' ? -1 : 1,
      ),
      generatedAt: now.toISOString(),
    };
  }
}
