'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { DealStatusBadge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { inr } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-auth';

const currency = (n: string | number) => inr(n);

export default function QuotationsPage() {
  const auth = useRequireAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const quotations = useQuery({ queryKey: ['quotations'], queryFn: api.quotations.list });

  if (auth.isLoading || auth.data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>
    );
  }

  const isCustomer = auth.data?.role === 'CUSTOMER';
  const rows = (quotations.data ?? []).filter((q) => !statusFilter || q.status === statusFilter);
  const statuses = Array.from(new Set((quotations.data ?? []).map((q) => q.status)));

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isCustomer ? 'Commercial Proposals' : 'Quotations'}
          </h1>
          <p className="text-sm text-slate-500">
            {isCustomer ? 'Proposals and orders prepared for your company.' : 'All deals in the system.'}
          </p>
        </div>

        <SectionCard title={isCustomer ? 'Your Proposals' : 'Deals'}>
          <div className="mb-3 flex items-center gap-2">
            <label className="text-sm text-slate-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">All</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {quotations.isLoading && <EmptyState message="Loading quotations…" />}
          {quotations.isError && <p className="text-sm text-red-600">Failed to load quotations.</p>}
          {quotations.data && rows.length === 0 && <EmptyState message="No quotations found." />}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">{isCustomer ? 'Proposal' : 'Quote'}</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Salesperson</th>
                    <th className="py-2 pr-3">Total</th>
                    <th className="py-2 pr-3">Discount</th>
                    {!isCustomer && <th className="py-2 pr-3">Margin</th>}
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((q) => (
                    <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-medium">
                        <Link href={`/quotations/${q.id}`} className="text-brand-600 hover:underline">
                          {q.number}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{q.customer?.name ?? '—'}</td>
                      <td className="py-2 pr-3 text-slate-600">{q.salesperson?.name ?? '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{currency(q.total)}</td>
                      <td className="py-2 pr-3 tabular-nums">{Number(q.discountPct)}%</td>
                      {!isCustomer && <td className="py-2 pr-3 tabular-nums">{Number(q.marginPct)}%</td>}
                      <td className="py-2 pr-3">
                        <DealStatusBadge status={q.status} />
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
