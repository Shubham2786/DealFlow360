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

  const isCustomer = auth.data?.role === 'CUSTOMER';
  const rows = invoices.data ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isCustomer ? 'My Invoices' : 'Invoices'}
          </h1>
          <p className="text-sm text-slate-500">
            {isCustomer
              ? 'Your GST invoices. Click "Pay Now" on any outstanding invoice to complete payment.'
              : 'GST invoices and payment status (amounts in ₹).'}
          </p>
        </div>

        <SectionCard title={isCustomer ? 'Your Invoices' : 'Invoices'}>
          {invoices.isLoading && <EmptyState message="Loading…" />}
          {invoices.data && rows.length === 0 && (
            <EmptyState message={isCustomer ? 'No invoices issued yet.' : 'No invoices yet. Generate one from a fulfilled deal.'} />
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Invoice</th>
                    {!isCustomer && <th className="py-2 pr-3">Customer</th>}
                    {!isCustomer && <th className="py-2 pr-3">Deal</th>}
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2 pr-3">Total</th>
                    <th className="py-2 pr-3">Outstanding</th>
                    <th className="py-2 pr-3">Status</th>
                    {isCustomer && <th className="py-2 pr-3">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const outstanding = Number(i.total) - Number(i.paidAmount);
                    const st = effectiveStatus(i);
                    const canPay = isCustomer && st !== 'PAID' && st !== 'CANCELLED' && outstanding > 0;
                    return (
                      <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2.5 pr-3 font-medium">
                          <Link href={`/invoices/${i.id}`} className="text-brand-600 hover:underline">{i.number}</Link>
                        </td>
                        {!isCustomer && <td className="py-2.5 pr-3 text-slate-600">{i.customer?.name ?? '—'}</td>}
                        {!isCustomer && <td className="py-2.5 pr-3 text-slate-600">{i.quotation?.number ?? '—'}</td>}
                        <td className="py-2.5 pr-3 text-slate-600">
                          <span className={st === 'OVERDUE' ? 'font-semibold text-red-600' : ''}>
                            {formatDate(i.dueDate)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums">{inr(i.total)}</td>
                        <td className="py-2.5 pr-3 tabular-nums">
                          <span className={outstanding > 0 ? 'font-semibold text-slate-800' : 'text-slate-400'}>
                            {inr(outstanding)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge kind={ISTATUS[st] ?? 'info'}>{st.replaceAll('_', ' ')}</Badge>
                        </td>
                        {isCustomer && (
                          <td className="py-2.5 pr-3">
                            {canPay ? (
                              <Link
                                href={`/invoices/${i.id}`}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#072654] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0a3275] transition-colors shadow-sm"
                              >
                                <svg width="12" height="12" viewBox="0 0 36 36" fill="none">
                                  <path d="M18 0L0 36h13.5L18 24l4.5 12H36L18 0z" fill="#3395FF"/>
                                </svg>
                                Pay Now
                              </Link>
                            ) : (
                              <Link
                                href={`/invoices/${i.id}`}
                                className="text-xs text-slate-400 hover:text-brand-600 transition-colors"
                              >
                                View →
                              </Link>
                            )}
                          </td>
                        )}
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
