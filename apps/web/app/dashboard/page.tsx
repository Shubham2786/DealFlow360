'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, DealStatusBadge, EmptyState, SectionCard, StatTile } from '@/components/ui';
import { api } from '@/lib/api';
import { inr, formatDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-auth';

const currency = (n: number) => inr(n);

// Per-role dashboard framing.
const VARIANT_META: Record<string, { title: string; subtitle: string }> = {
  USER: { title: 'My Dashboard', subtitle: 'Your deals and their progress' },
  MANAGER: { title: 'Manager Dashboard', subtitle: 'Team pipeline, approvals and fulfillment' },
  FINANCE: { title: 'Finance Dashboard', subtitle: 'Billing, collections and revenue' },
  ADMIN: { title: 'Admin Dashboard', subtitle: 'Full operational and system overview' },
  CUSTOMER: { title: 'Customer Portal & Dashboard', subtitle: 'Commercial proposals, orders, invoices and subscriptions' },
};

const ISTATUS: Record<string, string> = {
  DRAFT: 'info', ISSUED: 'info', PARTIALLY_PAID: 'warning', PAID: 'success', OVERDUE: 'critical', CANCELLED: 'critical',
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
  const isCustomer = data?.variant === 'CUSTOMER';
  const meta = VARIANT_META[data?.variant ?? 'USER'] ?? VARIANT_META.USER;
  const has = (key: keyof NonNullable<typeof k>) => k?.[key] !== undefined;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{meta.title}</h1>
            <p className="text-sm text-slate-500">
              {auth.data?.name} · {data?.customer?.name ?? auth.data?.role} — {meta.subtitle}
            </p>
          </div>
          {!isCustomer ? (
            <Link href="/deal-health" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Deal Health →
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/products"
                className="inline-flex items-center rounded-md bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition"
              >
                + Place New Order
              </Link>
              {data?.customer?.accountManager && (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-right text-xs">
                  <span className="text-slate-400">Dedicated Account Manager</span>
                  <div className="font-semibold text-slate-800">{data.customer.accountManager.name}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {metrics.isLoading && <EmptyState message="Loading metrics…" />}
        {metrics.isError && <p className="text-sm text-red-600">Could not load metrics. Is the API running?</p>}

        {k && (
          <>
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {has('activeProposals') && <StatTile label="Commercial Proposals" value={k.activeProposals!} tone="default" />}
              {has('activeDeals') && <StatTile label={data!.variant === 'USER' ? 'My Active Deals' : 'Active Deals'} value={k.activeDeals!} />}
              {has('draftQuotations') && <StatTile label="Drafts" value={k.draftQuotations!} />}
              {has('pendingApprovals') && <StatTile label={data!.variant === 'USER' ? 'Awaiting Approval' : 'Pending Approvals'} value={k.pendingApprovals!} tone={k.pendingApprovals ? 'warning' : 'default'} />}
              {has('approvedDeals') && <StatTile label={isCustomer ? 'Orders in Progress' : 'Approved'} value={k.approvedDeals!} tone="success" />}
              {has('awaitingFulfillment') && <StatTile label="Awaiting Fulfillment" value={k.awaitingFulfillment!} />}
              {has('outstandingInvoices') && <StatTile label="Outstanding Invoices" value={k.outstandingInvoices!} tone={k.outstandingInvoices ? 'warning' : 'default'} />}
              {has('overdueInvoices') && <StatTile label="Overdue Invoices" value={k.overdueInvoices!} tone={k.overdueInvoices ? 'critical' : 'default'} />}
              {has('activeSubscriptions') && <StatTile label="Active Subscriptions" value={k.activeSubscriptions!} tone="default" />}
              {has('revenue') && <StatTile label="Revenue (collected)" value={currency(k.revenue!)} tone="success" />}
              {has('totalUsers') && <StatTile label="Users" value={k.totalUsers!} />}
            </div>

            {/* Customer-Specific Deep Panels */}
            {isCustomer && data?.customer && (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-6">
                    <SectionCard title="Your Commercial Proposals">
                      {data.customer.proposals.length === 0 ? (
                        <EmptyState message="No commercial proposals on file." />
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                                <th className="py-2 pr-3">Proposal</th>
                                <th className="py-2 pr-3">Amount</th>
                                <th className="py-2 pr-3">Status</th>
                                <th className="py-2 pr-3 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.customer.proposals.map((p) => (
                                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                                  <td className="py-2.5 pr-3 font-medium text-slate-900">
                                    <Link href={`/quotations/${p.id}`} className="hover:text-brand-600 hover:underline">
                                      {p.number}
                                    </Link>
                                    {p.validUntil && (
                                      <span className="block text-xs text-slate-400">Valid until {formatDate(p.validUntil)}</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 pr-3 font-semibold tabular-nums text-slate-900">{currency(p.total)}</td>
                                  <td className="py-2.5 pr-3"><DealStatusBadge status={p.status} /></td>
                                  <td className="py-2.5 pr-3 text-right">
                                    {p.token ? (
                                      <Link
                                        href={`/customer-portal/${p.token}`}
                                        className="inline-flex items-center rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
                                      >
                                        Review &amp; Sign →
                                      </Link>
                                    ) : (
                                      <Link
                                        href={`/quotations/${p.id}`}
                                        className="inline-flex items-center rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                      >
                                        View
                                      </Link>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard title="Recent Invoices &amp; Billing">
                      {data.customer.invoices.length === 0 ? (
                        <EmptyState message="No invoices generated yet." />
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                                <th className="py-2 pr-3">Invoice</th>
                                <th className="py-2 pr-3">Total</th>
                                <th className="py-2 pr-3">Balance Due</th>
                                <th className="py-2 pr-3">Due Date</th>
                                <th className="py-2 pr-3 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.customer.invoices.map((inv) => {
                                const balance = inv.total - inv.paidAmount;
                                return (
                                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="py-2.5 pr-3 font-medium">
                                      <Link href={`/invoices/${inv.id}`} className="text-brand-600 hover:underline">
                                        {inv.number}
                                      </Link>
                                    </td>
                                    <td className="py-2.5 pr-3 tabular-nums">{currency(inv.total)}</td>
                                    <td className="py-2.5 pr-3 font-semibold tabular-nums text-slate-900">{currency(balance)}</td>
                                    <td className="py-2.5 pr-3 text-slate-600">{formatDate(inv.dueDate)}</td>
                                    <td className="py-2.5 pr-3 text-right">
                                      <Badge kind={ISTATUS[inv.status] ?? 'info'}>{inv.status.replaceAll('_', ' ')}</Badge>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-6">
                    <SectionCard title="Active Subscriptions">
                      {data.customer.subscriptions.length === 0 ? (
                        <EmptyState message="No active subscriptions." />
                      ) : (
                        <ul className="divide-y divide-slate-100 text-sm">
                          {data.customer.subscriptions.map((s) => (
                            <li key={s.id} className="py-3">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-slate-900">{s.number}</span>
                                <Badge kind={s.status === 'ACTIVE' ? 'success' : 'warning'}>{s.status}</Badge>
                              </div>
                              <div className="mt-1 text-sm font-semibold text-slate-800">
                                {currency(s.amount)} <span className="text-xs font-normal text-slate-400">/{s.frequency.toLowerCase()}</span>
                              </div>
                              {s.nextBillingDate && (
                                <div className="mt-0.5 text-xs text-slate-500">Next renewal: {formatDate(s.nextBillingDate)}</div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </SectionCard>

                    {data.customer.accountManager && (
                      <SectionCard title="Dedicated Sales Representative">
                        <div className="space-y-2 text-sm">
                          <p className="font-semibold text-slate-900">{data.customer.accountManager.name}</p>
                          <p className="text-xs text-slate-500">{data.customer.accountManager.email}</p>
                          <p className="mt-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-100">
                            Have questions regarding pricing, terms, or order delivery? Contact your dedicated representative anytime.
                          </p>
                        </div>
                      </SectionCard>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Internal Staff Grid (USER, MANAGER, FINANCE, ADMIN) */}
            {!isCustomer && (
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
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
