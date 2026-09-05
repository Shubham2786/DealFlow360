'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-auth';

const FSTATUS: Record<string, string> = {
  PENDING: 'info',
  ALLOCATING: 'info',
  ALLOCATED: 'success',
  PARTIALLY_ALLOCATED: 'warning',
  BACKORDERED: 'critical',
  READY_TO_SHIP: 'info',
  FULFILLED: 'success',
  FAILED: 'critical',
};

export default function FulfillmentPage() {
  const auth = useRequireAuth();
  const list = useQuery({ queryKey: ['fulfillment'], queryFn: api.fulfillment.list });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const rows = list.data ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Fulfillment</h1>
            <p className="text-sm text-slate-500">Orders converted from approved deals.</p>
          </div>
          <Link href="/inventory" className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            View Inventory →
          </Link>
        </div>

        <SectionCard title="Fulfillment Orders">
          {list.isLoading && <EmptyState message="Loading…" />}
          {list.data && rows.length === 0 && <EmptyState message="No fulfillment orders yet. Convert an approved quotation." />}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Order</th>
                    <th className="py-2 pr-3">Quote</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Lines</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-medium">
                        <Link href={`/fulfillment/${f.id}`} className="text-brand-600 hover:underline">{f.number}</Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{f.quotation?.number ?? '—'}</td>
                      <td className="py-2 pr-3 text-slate-600">{f.customer?.name ?? '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{f.lines.length}</td>
                      <td className="py-2 pr-3"><Badge kind={FSTATUS[f.status] ?? 'info'}>{f.status.replaceAll('_', ' ')}</Badge></td>
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
