'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { inr, formatDate, formatDateTime } from '@/lib/format';
import { usePermissions, useRequireAuth } from '@/lib/use-auth';

const ISTATUS: Record<string, string> = {
  DRAFT: 'info', ISSUED: 'info', PARTIALLY_PAID: 'warning', PAID: 'success', OVERDUE: 'critical', CANCELLED: 'critical',
};

export default function InvoiceDetailPage() {
  const auth = useRequireAuth();
  const params = useParams();
  const id = String(params.id);
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');

  const inv = useQuery({ queryKey: ['invoice', id], queryFn: () => api.invoices.get(id), enabled: !!id });

  const invalidate = async () => { await qc.invalidateQueries(); };
  const pay = useMutation({
    mutationFn: () => api.invoices.pay(id, Number(amount), method),
    onSuccess: async () => { setAmount(''); await invalidate(); },
  });
  const cancel = useMutation({ mutationFn: () => api.invoices.cancel(id), onSuccess: invalidate });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const i = inv.data;
  const { can } = usePermissions();
  const canManage = can('FINANCE_TRANSACTION_APPROVE');
  const outstanding = i ? Number(i.total) - Number(i.paidAmount) : 0;
  const payable = i && i.status !== 'PAID' && i.status !== 'CANCELLED';

  return (
    <AppShell>
      <div className="space-y-6">
        <Link href="/invoices" className="text-sm text-brand-600 hover:underline">← Back to invoices</Link>

        {inv.isLoading && <EmptyState message="Loading invoice…" />}
        {inv.isError && <p className="text-sm text-red-600">Invoice {id} could not be found.</p>}

        {i && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900">{i.number}</h1>
                  <Badge kind={ISTATUS[i.status] ?? 'info'}>{i.status.replaceAll('_', ' ')}</Badge>
                </div>
                <p className="text-sm text-slate-500">
                  {i.customer?.name}
                  {i.quotation && <> · Deal <Link href={`/quotations/${i.quotation.id}`} className="text-brand-600 hover:underline">{i.quotation.number}</Link></>}
                </p>
              </div>
              {canManage && payable && (
                <button onClick={() => { if (confirm('Cancel this invoice?')) cancel.mutate(); }} disabled={cancel.isPending}
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">
                  Cancel Invoice
                </button>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <SectionCard title="Line Items">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-3">Description</th>
                          <th className="py-2 pr-3">Qty</th>
                          <th className="py-2 pr-3">Unit</th>
                          <th className="py-2 pr-3">GST%</th>
                          <th className="py-2 pr-3">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(i.lines ?? []).map((l) => (
                          <tr key={l.id} className="border-b border-slate-100">
                            <td className="py-2 pr-3">{l.description}</td>
                            <td className="py-2 pr-3 tabular-nums">{l.qty}</td>
                            <td className="py-2 pr-3 tabular-nums">{inr(l.unitPrice)}</td>
                            <td className="py-2 pr-3 tabular-nums">{Number(l.gstRate)}%</td>
                            <td className="py-2 pr-3 tabular-nums">{inr(l.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>

                <SectionCard title="Payments">
                  {(i.payments ?? []).length === 0 ? (
                    <EmptyState message="No payments recorded." />
                  ) : (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {i.payments!.map((p) => (
                        <li key={p.id} className="flex justify-between py-2">
                          <span className="text-slate-600">{formatDateTime(p.receivedAt)} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
                          <span className="tabular-nums font-medium text-slate-800">{inr(p.amount, true)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </SectionCard>
              </div>

              <div className="space-y-6">
                <SectionCard title="Summary">
                  <dl className="space-y-1 text-sm">
                    <Row label="Subtotal" value={inr(i.subtotal)} />
                    <Row label="GST" value={inr(i.gstTotal)} />
                    <div className="mt-2 border-t border-slate-200 pt-2"><Row label="Total" value={inr(i.total)} bold /></div>
                    <Row label="Paid" value={inr(i.paidAmount)} />
                    <Row label="Outstanding" value={inr(outstanding)} />
                    <Row label="Terms" value={i.paymentTerms} />
                    <Row label="Issued" value={formatDate(i.issueDate)} />
                    <Row label="Due" value={formatDate(i.dueDate)} />
                  </dl>
                </SectionCard>

                {canManage && payable && (
                  <SectionCard title="Record Payment">
                    <form onSubmit={(e) => { e.preventDefault(); pay.mutate(); }} className="space-y-3 text-sm">
                      <label className="block">
                        <span className="mb-1 block font-medium text-slate-600">Amount (₹)</span>
                        <input type="number" min={1} max={outstanding} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
                      </label>
                      <label className="block">
                        <span className="mb-1 block font-medium text-slate-600">Method</span>
                        <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5">
                          <option>UPI</option><option>NEFT</option><option>RTGS</option><option>Cheque</option><option>Card</option>
                        </select>
                      </label>
                      {pay.isError && <p className="text-red-600">{(pay.error as Error).message}</p>}
                      <button type="submit" disabled={pay.isPending} className="w-full rounded-md bg-green-600 px-3 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-60">
                        {pay.isPending ? 'Recording…' : `Record ₹ payment`}
                      </button>
                    </form>
                  </SectionCard>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={bold ? 'font-bold tabular-nums text-slate-900' : 'tabular-nums text-slate-700'}>{value}</dd>
    </div>
  );
}
