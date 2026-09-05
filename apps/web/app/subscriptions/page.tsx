'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { api, type SubscriptionItem } from '@/lib/api';
import { inr, formatDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-auth';

const SSTATUS: Record<string, string> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  CANCELLED: 'critical',
  EXPIRED: 'critical',
  DRAFT: 'info',
};

export default function SubscriptionsPage() {
  const auth = useRequireAuth();
  const qc = useQueryClient();
  const subscriptions = useQuery({
    queryKey: ['subscriptions'],
    queryFn: api.subscriptions.list,
  });

  const [filter, setFilter] = useState<string>('ALL');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['subscriptions'] });

  const pause = useMutation({
    mutationFn: (id: string) => api.subscriptions.pause(id),
    onSuccess: invalidate,
  });

  const resume = useMutation({
    mutationFn: (id: string) => api.subscriptions.resume(id),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.subscriptions.cancel(id),
    onSuccess: invalidate,
  });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const allRows = subscriptions.data ?? [];
  const rows = filter === 'ALL' ? allRows : allRows.filter((s) => s.status === filter);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Subscriptions</h1>
            <p className="text-sm text-slate-500">
              Recurring service agreements, maintenance plans and annual contracts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {['ALL', 'ACTIVE', 'PAUSED', 'CANCELLED'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  filter === f
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <SectionCard title="Active & Historic Contracts">
          {subscriptions.isLoading && <EmptyState message="Loading subscriptions…" />}
          {subscriptions.isError && (
            <p className="text-sm text-red-600">Could not load subscriptions.</p>
          )}
          {subscriptions.data && rows.length === 0 && (
            <EmptyState message={filter === 'ALL' ? 'No subscriptions found.' : `No ${filter.toLowerCase()} subscriptions.`} />
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Subscription</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Frequency</th>
                    <th className="py-2 pr-3">Start Date</th>
                    <th className="py-2 pr-3">End Date</th>
                    <th className="py-2 pr-3">Recurring Amount</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s: SubscriptionItem) => (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 pr-3 font-medium text-slate-900">
                        {s.number}
                        {s.quotation && (
                          <span className="block text-xs text-slate-400">Deal: {s.quotation.number}</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-slate-700">
                        {s.customer?.name ?? '—'}
                      </td>
                      <td className="py-3 pr-3">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {s.frequency}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-slate-600 tabular-nums">{formatDate(s.startDate)}</td>
                      <td className="py-3 pr-3 text-slate-600 tabular-nums">{formatDate(s.endDate)}</td>
                      <td className="py-3 pr-3 font-semibold tabular-nums text-slate-900">
                        {inr(s.recurringAmount)}
                        <span className="text-xs font-normal text-slate-400">
                          /{s.frequency === 'ANNUAL' ? 'yr' : s.frequency === 'MONTHLY' ? 'mo' : 'qtr'}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge kind={SSTATUS[s.status] ?? 'info'}>{s.status}</Badge>
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {s.status === 'ACTIVE' && (
                            <button
                              onClick={() => pause.mutate(s.id)}
                              disabled={pause.isPending}
                              className="rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            >
                              Pause
                            </button>
                          )}
                          {s.status === 'PAUSED' && (
                            <button
                              onClick={() => resume.mutate(s.id)}
                              disabled={resume.isPending}
                              className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              Resume
                            </button>
                          )}
                          {s.status !== 'CANCELLED' && (
                            <button
                              onClick={() => {
                                if (confirm(`Cancel subscription ${s.number}?`)) {
                                  cancel.mutate(s.id);
                                }
                              }}
                              disabled={cancel.isPending}
                              className="rounded border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
