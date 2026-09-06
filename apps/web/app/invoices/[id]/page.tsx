'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { RazorpayModal } from '@/components/razorpay-modal';
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
  const [showRazorpay, setShowRazorpay] = useState(false);

  const inv = useQuery({ queryKey: ['invoice', id], queryFn: () => api.invoices.get(id), enabled: !!id });
  const invalidate = async () => { await qc.invalidateQueries(); };

  const pay = useMutation({
    mutationFn: ({ amount, method, reference }: { amount: number; method: string; reference: string }) =>
      api.invoices.pay(id, amount, method, reference),
    onSuccess: async () => { await invalidate(); },
  });

  const cancel = useMutation({ mutationFn: () => api.invoices.cancel(id), onSuccess: invalidate });

  const { can } = usePermissions();
  const canManage = can('FINANCE_TRANSACTION_APPROVE'); // Finance role
  const isCustomer = auth.data?.role === 'CUSTOMER';

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const i = inv.data;
  const outstanding = i ? Number(i.total) - Number(i.paidAmount) : 0;
  const payable = i && i.status !== 'PAID' && i.status !== 'CANCELLED';

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link
            href="/invoices"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition"
          >
            ← Back to Invoices
          </Link>
        </div>

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
              {/* Finance can cancel; customer cannot */}
              {canManage && payable && (
                <button
                  onClick={() => { if (confirm('Cancel this invoice?')) cancel.mutate(); }}
                  disabled={cancel.isPending}
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
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
                    <EmptyState message="No payments recorded yet." />
                  ) : (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {i.payments!.map((p) => (
                        <li key={p.id} className="flex justify-between py-2">
                          <span className="text-slate-600">
                            {formatDateTime(p.receivedAt)} · {p.method}
                            {p.reference && (
                              <span className="ml-1 font-mono text-xs text-slate-400">· {p.reference}</span>
                            )}
                          </span>
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

                {/* ── CUSTOMER: Pay with Razorpay ── */}
                {isCustomer && payable && outstanding > 0 && (
                  <SectionCard title="Complete Payment">
                    <div className="space-y-4">
                      <div className="rounded-xl bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-100 px-4 py-4 text-center">
                        <p className="text-xs text-slate-500 mb-1">Amount Due</p>
                        <p className="text-3xl font-bold text-slate-900">{inr(outstanding, true)}</p>
                        {i.dueDate && (
                          <p className="mt-1 text-xs text-slate-400">Due by {formatDate(i.dueDate)}</p>
                        )}
                      </div>

                      <button
                        onClick={() => setShowRazorpay(true)}
                        disabled={pay.isPending}
                        className="w-full flex items-center justify-center gap-3 rounded-xl bg-[#072654] px-4 py-3.5 font-bold text-white shadow-lg hover:bg-[#0a3275] active:scale-[0.98] transition-all disabled:opacity-60"
                      >
                        <svg width="20" height="20" viewBox="0 0 36 36" fill="none">
                          <path d="M18 0L0 36h13.5L18 24l4.5 12H36L18 0z" fill="#3395FF"/>
                        </svg>
                        Pay Now with Razorpay
                      </button>

                      <p className="text-center text-[10px] text-slate-400">
                        🔒 Secured by Razorpay · Test Mode — no real charges
                      </p>

                      {pay.isError && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                          {(pay.error as Error).message}
                        </p>
                      )}
                      {pay.isSuccess && (
                        <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 font-medium text-center">
                          ✓ Payment recorded successfully!
                        </div>
                      )}
                    </div>
                  </SectionCard>
                )}

                {/* ── FINANCE: Read-only notice ── */}
                {canManage && payable && outstanding > 0 && (
                  <SectionCard title="Payment Status">
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-4 text-center space-y-2">
                      <p className="text-sm font-semibold text-amber-800">Awaiting Customer Payment</p>
                      <p className="text-xs text-amber-700">
                        This invoice has been issued to the customer.<br />
                        They will complete payment via the customer portal.
                      </p>
                      <div className="pt-1">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          {inr(outstanding, true)} outstanding
                        </span>
                      </div>
                    </div>
                  </SectionCard>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Razorpay Dummy Modal — shown to customer only */}
      {i && isCustomer && (
        <RazorpayModal
          open={showRazorpay}
          amount={outstanding}
          invoiceNumber={i.number}
          customerName={i.customer?.name ?? 'Customer'}
          onSuccess={({ paymentId, method, amount }) => {
            setShowRazorpay(false);
            pay.mutate({ amount, method, reference: paymentId });
          }}
          onDismiss={() => setShowRazorpay(false)}
        />
      )}
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
