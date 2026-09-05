'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard, StatTile } from '@/components/ui';
import { api } from '@/lib/api';
import { inr } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-auth';

const currency = (n: number) => inr(n);

// Per-role dashboard framing.
const VARIANT_META: Record<string, { title: string; subtitle: string }> = {
  USER: { title: 'My Dashboard', subtitle: 'Your deals and their progress' },
  MANAGER: { title: 'Manager Dashboard', subtitle: 'Team pipeline, approvals and fulfillment' },
  FINANCE: { title: 'Finance Dashboard', subtitle: 'Billing, collections and revenue' },
  ADMIN: { title: 'Admin Dashboard', subtitle: 'Full operational and system overview' },
};

export default function DashboardPage() {
  const auth = useRequireAuth();
  const metrics = useQuery({ queryKey: ['dashboard-metrics'], queryFn: api.dashboard.metrics });

  if (auth.isLoading || auth.data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>
    );
  }

  const data = metrics.data;
  const k = data?.kpis;
  const meta = VARIANT_META[data?.variant ?? 'USER'] ?? VARIANT_META.USER;
  const has = (key: keyof NonNullable<typeof k>) => k?.[key] !== undefined;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{meta.title}</h1>
            <p className="text-sm text-slate-500">
              {auth.data?.name} · {auth.data?.role} — {meta.subtitle}
            </p>
          </div>
          <Link href="/deal-health" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Deal Health →
          </Link>
        </div>

        {metrics.isLoading && <EmptyState message="Loading metrics…" />}
        {metrics.isError && <p className="text-sm text-red-600">Could not load metrics. Is the API running?</p>}

        {k && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {has('activeDeals') && <StatTile label={data!.variant === 'USER' ? 'My Active Deals' : 'Active Deals'} value={k.activeDeals!} />}
              {has('draftQuotations') && <StatTile label="Drafts" value={k.draftQuotations!} />}
              {has('pendingApprovals') && <StatTile label={data!.variant === 'USER' ? 'Awaiting Approval' : 'Pending Approvals'} value={k.pendingApprovals!} tone={k.pendingApprovals ? 'warning' : 'default'} />}
              {has('approvedDeals') && <StatTile label="Approved" value={k.approvedDeals!} tone="success" />}
              {has('awaitingFulfillment') && <StatTile label="Awaiting Fulfillment" value={k.awaitingFulfillment!} />}
              {has('outstandingInvoices') && <StatTile label="Outstanding Invoices" value={k.outstandingInvoices!} />}
              {has('overdueInvoices') && <StatTile label="Overdue Invoices" value={k.overdueInvoices!} tone={k.overdueInvoices ? 'critical' : 'default'} />}
              {has('revenue') && <StatTile label="Revenue (collected)" value={currency(k.revenue!)} tone="success" />}
              {has('totalUsers') && <StatTile label="Users" value={k.totalUsers!} />}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <SectionCard title="Alerts">
                {data!.alerts.length === 0 ? (
                  <EmptyState message="No active alerts" />
                ) : (
                  <ul className="space-y-2">
                    {data!.alerts.map((a, i) => (
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

              <SectionCard title={data!.variant === 'USER' ? 'My Pipeline' : 'Pipeline'}>
                <div className="text-3xl font-bold tabular-nums text-slate-900">
                  {currency(k.pipelineValue ?? 0)}
                </div>
                {has('totalCustomers') && (
                  <p className="mt-1 text-sm text-slate-500">{k.totalCustomers} customers · {k.totalProducts} products</p>
                )}
              </SectionCard>

              <SectionCard title={data!.variant === 'USER' ? 'My Recent Activity' : 'Recent Activity'}>
                {data!.recentActivity.length === 0 ? (
                  <EmptyState message="No recent activity" />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {data!.recentActivity.map((e) => (
                      <li key={e.id} className="flex flex-col">
                        <span className="text-slate-700">{e.message ?? e.action}</span>
                        <span className="text-xs text-slate-400">
                          {e.actor ?? 'System'} · {new Date(e.at).toLocaleString('en-IN')}
                        </span>
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
