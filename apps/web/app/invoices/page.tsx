'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { inr, formatDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-auth';

const ISTATUS: Record<string, string> = {
  DRAFT: 'info',
  ISSUED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'critical',
  CANCELLED: 'critical',
};

function effectiveStatus(i: { status: string; dueDate: string | null; total: string; paidAmount: string }) {
  const outstanding = Number(i.total) - Number(i.paidAmount);
  if (i.status !== 'PAID' && i.status !== 'CANCELLED' && outstanding > 0 && i.dueDate && new Date(i.dueDate) < new Date()) {
    return 'OVERDUE';
  }
  return i.status;
}

export default function InvoicesPage() {
  const auth = useRequireAuth();
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: api.invoices.list });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const rows = invoices.data ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">GST invoices and payment status (amounts in ₹).</p>
        </div>

        <SectionCard title="Invoices">
          {invoices.isLoading && <EmptyState message="Loading…" />}
          {invoices.data && rows.length === 0 && <EmptyState message="No invoices yet. Generate one from a fulfilled deal." />}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Deal</th>
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2 pr-3">Total</th>
                    <th className="py-2 pr-3">Outstanding</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const outstanding = Number(i.total) - Number(i.paidAmount);
                    const st = effectiveStatus(i);
                    return (
                      <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 pr-3 font-medium">
                          <Link href={`/invoices/${i.id}`} className="text-brand-600 hover:underline">{i.number}</Link>
                        </td>
                        <td className="py-2 pr-3 text-slate-600">{i.customer?.name ?? '—'}</td>
                        <td className="py-2 pr-3 text-slate-600">{i.quotation?.number ?? '—'}</td>
                        <td className="py-2 pr-3 text-slate-600">{formatDate(i.dueDate)}</td>
                        <td className="py-2 pr-3 tabular-nums">{inr(i.total)}</td>
                        <td className="py-2 pr-3 tabular-nums">{inr(outstanding)}</td>
                        <td className="py-2 pr-3"><Badge kind={ISTATUS[st] ?? 'info'}>{st.replaceAll('_', ' ')}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
