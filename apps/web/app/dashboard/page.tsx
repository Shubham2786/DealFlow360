'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard, StatTile } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-auth';

const currency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function DashboardPage() {
  const auth = useRequireAuth();
  const metrics = useQuery({ queryKey: ['dashboard-metrics'], queryFn: api.dashboard.metrics });

  if (auth.isLoading || auth.data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  const k = metrics.data?.kpis;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sales Dashboard</h1>
            <p className="text-sm text-slate-500">
              Welcome back, {auth.data?.name} · {auth.data?.role}
            </p>
          </div>
          <Link
            href="/deal-health"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            View Deal Health →
          </Link>
        </div>

        {metrics.isLoading && <EmptyState message="Loading metrics…" />}
        {metrics.isError && (
          <p className="text-sm text-red-600">Could not load metrics. Is the API running?</p>
        )}

        {k && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatTile label="Active Deals" value={k.activeDeals} />
              <StatTile label="Draft Quotations" value={k.draftQuotations} />
              <StatTile label="Pending Approvals" value={k.pendingApprovals} tone={k.pendingApprovals ? 'warning' : 'default'} />
              <StatTile label="Approved Deals" value={k.approvedDeals} tone="success" />
              <StatTile label="Awaiting Fulfillment" value={k.awaitingFulfillment} />
              <StatTile label="Outstanding Invoices" value={k.outstandingInvoices} />
              <StatTile label="Overdue Invoices" value={k.overdueInvoices} tone={k.overdueInvoices ? 'critical' : 'default'} />
              <StatTile label="Revenue (collected)" value={currency(k.revenue)} tone="success" />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <SectionCard title="Alerts">
                  {metrics.data!.alerts.length === 0 ? (
                    <EmptyState message="No active alerts" />
                  ) : (
                    <ul className="space-y-2">
                      {metrics.data!.alerts.map((a, i) => (
                        <li key={i}>
                          <Link href={a.href} className="flex items-center gap-2 text-sm hover:underline">
                            <Badge kind={a.severity}>{a.severity}</Badge>
                            <span className="text-slate-700">{a.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </div>

              <div className="lg:col-span-1">
                <SectionCard title="Pipeline">
                  <div className="text-3xl font-bold tabular-nums text-slate-900">
                    {currency(k.pipelineValue)}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {k.totalCustomers} customers · {k.totalProducts} products
                  </p>
                </SectionCard>
              </div>

              <div className="lg:col-span-1">
                <SectionCard title="Recent Activity">
                  {metrics.data!.recentActivity.length === 0 ? (
                    <EmptyState message="No recent activity" />
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {metrics.data!.recentActivity.map((e) => (
                        <li key={e.id} className="flex flex-col">
                          <span className="text-slate-700">{e.message ?? e.action}</span>
                          <span className="text-xs text-slate-400">
                            {e.actor ?? 'System'} · {new Date(e.at).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
