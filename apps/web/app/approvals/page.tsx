'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, DealStatusBadge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-auth';

const currency = (n: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n));

const REQ_KIND: Record<string, string> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'critical',
  CHANGES_REQUESTED: 'warning',
  ESCALATED: 'warning',
};

export default function ApprovalsPage() {
  const auth = useRequireAuth();
  const [status, setStatus] = useState('');
  const approvals = useQuery({ queryKey: ['approvals', status], queryFn: () => api.approvals.list(status || undefined) });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const rows = approvals.data ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Approvals</h1>
          <p className="text-sm text-slate-500">Deals requiring authorization based on discount, margin, and value.</p>
        </div>

        <SectionCard title="Approval Requests">
          <div className="mb-3 flex items-center gap-2">
            <label className="text-sm text-slate-500">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CHANGES_REQUESTED">Changes Requested</option>
            </select>
          </div>

          {approvals.isLoading && <EmptyState message="Loading approvals…" />}
          {approvals.data && rows.length === 0 && <EmptyState message="No approval requests." />}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Quote</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Value</th>
                    <th className="py-2 pr-3">Discount</th>
                    <th className="py-2 pr-3">Margin</th>
                    <th className="py-2 pr-3">Chain</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-medium">
                        <Link href={`/approvals/${a.id}`} className="text-brand-600 hover:underline">
                          {a.quotation.number}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{a.quotation.customer?.name ?? '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{currency(a.quotation.total)}</td>
                      <td className="py-2 pr-3 tabular-nums">{Number(a.quotation.discountPct)}%</td>
                      <td className="py-2 pr-3 tabular-nums">{Number(a.quotation.marginPct)}%</td>
                      <td className="py-2 pr-3 text-xs text-slate-500">
                        {a.steps.map((s) => s.role.replaceAll('_', ' ')).join(' → ')}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge kind={REQ_KIND[a.status] ?? 'info'}>{a.status.replaceAll('_', ' ')}</Badge>
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
