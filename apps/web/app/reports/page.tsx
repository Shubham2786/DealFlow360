'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { EmptyState, SectionCard, StatTile } from '@/components/ui';
import { api } from '@/lib/api';
import { inr } from '@/lib/format';
import { usePermissions, useRequireAuth } from '@/lib/use-auth';

export default function ReportsPage() {
  const auth = useRequireAuth();
  const { can } = usePermissions();
  const allowed = can('TEAM_VIEW') || can('FINANCE_REPORT_GENERATE');
  const report = useQuery({ queryKey: ['reports'], queryFn: api.reports, enabled: allowed });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!allowed) {
    return (
      <AppShell>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Reports are available to managers, finance, and admins.
        </div>
      </AppShell>
    );
  }

  const r = report.data;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition mb-3"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Company-wide performance (amounts in ₹).</p>
        </div>

        {report.isLoading && <EmptyState message="Crunching numbers…" />}
        {report.isError && <p className="text-sm text-red-600">Could not load reports.</p>}

        {r && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatTile label="Revenue Collected" value={inr(r.revenue.collected)} tone="success" />
              <StatTile label="Outstanding" value={inr(r.revenue.outstanding)} />
              <StatTile label="Overdue" value={inr(r.revenue.overdueAmount)} tone={r.revenue.overdueCount ? 'critical' : 'default'} hint={`${r.revenue.overdueCount} invoice(s)`} />
              <StatTile label="Pipeline" value={inr(r.pipeline.value)} hint={`${r.pipeline.activeDeals} active deals`} />
              <StatTile label="Deals" value={r.deals.total} hint={`${r.deals.completed} completed · ${r.deals.cancelled} cancelled`} />
              <StatTile label="Conversion" value={`${r.deals.conversionRate}%`} tone="success" />
              <StatTile label="Approvals Pending" value={r.approvals.pending} tone={r.approvals.pending ? 'warning' : 'default'} hint={`avg ${r.approvals.avgTurnaroundDays}d turnaround`} />
              <StatTile label="Open Backorders" value={r.fulfillment.openBackorders} tone={r.fulfillment.openBackorders ? 'warning' : 'default'} hint={`avg discount ${r.discounts.avgDiscountPct}%`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <SectionCard title="Deals by Status">
                {r.deals.byStatus.length === 0 ? (
                  <EmptyState message="No deals" />
                ) : (
                  <ul className="space-y-1 text-sm">
                    {r.deals.byStatus.map((s) => (
                      <li key={s.status} className="flex justify-between">
                        <span className="text-slate-600">{s.status.replaceAll('_', ' ')}</span>
                        <span className="tabular-nums font-medium text-slate-800">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard title="Top Customers (by deal value)">
                {r.topCustomers.length === 0 ? (
                  <EmptyState message="No customers" />
                ) : (
                  <ul className="space-y-1 text-sm">
                    {r.topCustomers.map((c, i) => (
                      <li key={i} className="flex justify-between">
                        <span className="text-slate-600">{c.customer}</span>
                        <span className="tabular-nums font-medium text-slate-800">{inr(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
