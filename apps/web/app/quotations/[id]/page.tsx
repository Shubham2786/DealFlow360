'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { DealStatusBadge, EmptyState, LifecycleStepper, SectionCard, Badge } from '@/components/ui';
import { useToast } from '@/components/toast';
import { api, InvoiceItem } from '@/lib/api';
import { inr } from '@/lib/format';
import { usePermissions, useRequireAuth } from '@/lib/use-auth';

const currency = (n: string | number) => inr(n, true);

export default function QuotationDetailPage() {
  const auth = useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const id = String(params.id);
  const qc = useQueryClient();

  const [repReply, setRepReply] = useState('');
  const [portalLink, setPortalLink] = useState<string | null>(null);

  const quotation = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api.quotations.get(id),
    enabled: !!id,
  });

  const { can } = usePermissions();

  const invalidate = async () => {
    await qc.invalidateQueries();
  };

  const submit = useMutation({
    mutationFn: () => api.quotations.submit(id),
    onSuccess: async () => {
      toast.success('Quotation submitted for approval!');
      await invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to submit quotation'),
  });

  const cancel = useMutation({
    mutationFn: () => api.quotations.cancel(id),
    onSuccess: async () => {
      toast.success('Quotation cancelled and reservations released.');
      await invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to cancel quotation'),
  });

  const revise = useMutation({
    mutationFn: () => api.quotations.revise(id),
    onSuccess: async () => {
      toast.success('Quotation reverted to draft for revision.');
      await invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to revise quotation'),
  });

  const convert = useMutation({
    mutationFn: () => api.fulfillment.fromQuotation(id),
    onSuccess: async (f: { id: string }) => {
      toast.success('Fulfillment order created!');
      await invalidate();
      router.push(`/fulfillment/${f.id}`);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to convert to fulfillment'),
  });

  const generateInvoice = useMutation({
    mutationFn: () => api.invoices.generateFromQuotation(id),
    onSuccess: async (inv: InvoiceItem) => {
      toast.success(`Invoice ${inv.number} generated!`);
      await invalidate();
      router.push(`/invoices/${inv.id}`);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to generate invoice'),
  });

  const sendToCustomer = useMutation({
    mutationFn: () => api.negotiation.sendToCustomer(id),
    onSuccess: async (r: { token: string }) => {
      const link = `${window.location.origin}/customer-portal/${r.token}`;
      setPortalLink(link);
      toast.success('Portal link created!');
      await invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to generate portal link'),
  });

  const applyCounterOffer = useMutation({
    mutationFn: (discountPct: number) =>
      api.quotations.applyCounterDiscount(id, discountPct, 'Accepted customer requested discount'),
    onSuccess: async () => {
      toast.success('Applied counter-discount and routed for approval!');
      await invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to apply counter-discount'),
  });

  const sendReply = useMutation({
    mutationFn: () => api.quotations.replyNegotiation(id, repReply),
    onSuccess: async () => {
      setRepReply('');
      toast.success('Response sent to customer negotiation thread.');
      await invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to send reply'),
  });

  if (auth.isLoading || auth.data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>
    );
  }

  const q = quotation.data;
  const isCustomer = auth.data?.role === 'CUSTOMER';
  const status = q?.status ?? '';
  const canSubmit = !isCustomer && status === 'DRAFT';
  const canRevise = !isCustomer && ['CHANGES_REQUESTED', 'REJECTED', 'NEGOTIATION'].includes(status);
  const canCancel = !isCustomer && !['CANCELLED', 'COMPLETED', 'PAID'].includes(status);
  const canConvert = !isCustomer && status === 'APPROVED';
  const canInvoice =
    !isCustomer &&
    ['FULFILLED', 'PARTIALLY_FULFILLED'].includes(status) &&
    can('FINANCE_TRANSACTION_APPROVE');
  const canSendToCustomer =
    !isCustomer &&
    can('DEAL_CREATE') &&
    !['COMPLETED', 'CANCELLED', 'PAID', 'INVOICED', 'BILLING'].includes(status);

  const pending =
    submit.isPending ||
    cancel.isPending ||
    revise.isPending ||
    convert.isPending ||
    generateInvoice.isPending ||
    sendToCustomer.isPending ||
    applyCounterOffer.isPending ||
    sendReply.isPending;

  // Find latest customer discount request
  const lastCustomerMsgWithDiscount = q?.negotiation?.messages
    ?.filter((m) => m.author === 'CUSTOMER' && m.requestedDiscountPct != null)
    .slice(-1)[0];

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <Link
            href="/quotations"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition"
          >
            {isCustomer ? '← Back to proposals' : '← Back to quotations'}
          </Link>
        </div>

        {quotation.isLoading && <EmptyState message="Loading quotation…" />}
        {quotation.isError && (
          <p className="text-sm text-red-600">Quotation {id} could not be found.</p>
        )}

        {q && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900">{q.number}</h1>
                  <DealStatusBadge status={q.status} />
                </div>
                <p className="text-sm text-slate-500">
                  {q.customer?.name} · Salesperson: {q.salesperson?.name ?? '—'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canSubmit && (
                  <button
                    onClick={() => submit.mutate()}
                    disabled={pending}
                    className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 shadow-sm"
                  >
                    Submit for Approval
                  </button>
                )}
                {canConvert && (
                  <button
                    onClick={() => convert.mutate()}
                    disabled={pending}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 shadow-sm"
                  >
                    Convert to Fulfillment →
                  </button>
                )}
                {canInvoice && (
                  <button
                    onClick={() => generateInvoice.mutate()}
                    disabled={pending}
                    className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 shadow-sm"
                  >
                    Generate Invoice →
                  </button>
                )}
                {canSendToCustomer && (
                  <button
                    onClick={() => sendToCustomer.mutate()}
                    disabled={pending}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Share Portal Link
                  </button>
                )}
                {canRevise && (
                  <button
                    onClick={() => revise.mutate()}
                    disabled={pending}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Revise (back to Draft)
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to cancel this quotation? This will release reserved inventory and cancel outstanding backorders.')) {
                        cancel.mutate();
                      }
                    }}
                    disabled={pending}
                    className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                  >
                    Cancel Deal
                  </button>
                )}
              </div>
            </div>

            {/* Lifecycle Stage Bar */}
            <SectionCard title="Lifecycle Status">
              <LifecycleStepper status={q.status} />
            </SectionCard>

            {portalLink && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900">
                <span className="font-semibold block mb-1">Customer Portal Link Active:</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={portalLink}
                    className="flex-1 rounded border border-blue-300 bg-white px-3 py-1.5 text-xs text-slate-700 font-mono"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(portalLink);
                      toast.success('Link copied to clipboard!');
                    }}
                    className="rounded bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-blue-700"
                  >
                    Copy Link
                  </button>
                  <a
                    href={portalLink}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-blue-600 text-blue-600 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-blue-50"
                  >
                    Open Portal ↗
                  </a>
                </div>
              </div>
            )}

            {/* Negotiation Panel for Customer and Reps */}
            {isCustomer && q.status === 'NEGOTIATION' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                <div>
                  <div className="font-semibold text-amber-900 text-sm">Proposal is Under Active Negotiation</div>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your sales team is discussing terms with you. You can review the proposal, submit notes, or accept terms.
                  </p>
                </div>
                {q.negotiation?.token?.token && (
                  <Link
                    href={`/customer-portal/${q.negotiation.token.token}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-800 px-4 py-2 text-xs font-bold text-white hover:bg-amber-900 shadow-sm transition"
                  >
                    Open Negotiation Portal →
                  </Link>
                )}
              </div>
            )}

            {q.negotiation && (
              <SectionCard title="Customer Negotiation Thread">
                <div className="space-y-4">
                  {!isCustomer && lastCustomerMsgWithDiscount && lastCustomerMsgWithDiscount.requestedDiscountPct != null && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-amber-900 text-sm">
                          Customer Counter-Offer: {lastCustomerMsgWithDiscount.requestedDiscountPct}% Discount Requested
                        </div>
                        <div className="text-xs text-amber-700 mt-0.5">
                          Current deal discount is {q.discountPct}%. Accepting will recalculate totals and route to approval.
                        </div>
                      </div>
                      <button
                        onClick={() => applyCounterOffer.mutate(Number(lastCustomerMsgWithDiscount.requestedDiscountPct))}
                        disabled={pending}
                        className="rounded-md bg-amber-700 text-white px-3.5 py-1.5 text-xs font-bold hover:bg-amber-800 disabled:opacity-50 shadow-sm"
                      >
                        Accept {lastCustomerMsgWithDiscount.requestedDiscountPct}% &amp; Re-route
                      </button>
                    </div>
                  )}

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {(q.negotiation.messages ?? []).length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">No messages in negotiation thread yet.</p>
                    ) : (
                      q.negotiation.messages.map((m, idx) => (
                        <div
                          key={idx}
                          className={`rounded-lg p-3 text-xs border ${
                            m.author === 'CUSTOMER'
                              ? 'bg-slate-50 border-slate-200 ml-0 mr-12'
                              : 'bg-brand-50/50 border-brand-200 ml-12 mr-0'
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold text-slate-700 mb-1">
                            <span>{m.author === 'CUSTOMER' ? 'Customer' : m.author}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {new Date(m.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-slate-600">{m.body}</p>
                          {m.requestedDiscountPct != null && (
                            <span className="inline-block mt-1 font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[10px]">
                              Requested discount: {m.requestedDiscountPct}%
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {!isCustomer ? (
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <input
                        type="text"
                        placeholder="Type a reply to the customer..."
                        value={repReply}
                        onChange={(e) => setRepReply(e.target.value)}
                        className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                      />
                      <button
                        onClick={() => sendReply.mutate()}
                        disabled={pending || !repReply.trim()}
                        className="rounded-md bg-brand-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-brand-700 disabled:opacity-50"
                      >
                        Send Reply
                      </button>
                    </div>
                  ) : (
                    q.negotiation?.token?.token && (
                      <div className="pt-2 border-t border-slate-100 flex justify-end">
                        <Link
                          href={`/customer-portal/${q.negotiation.token.token}`}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-800"
                        >
                          Respond in Customer Portal →
                        </Link>
                      </div>
                    )
                  )}
                </div>
              </SectionCard>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <SectionCard title="Quotation Lines">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-2 pr-3">Product</th>
                          <th className="py-2 pr-3">SKU</th>
                          <th className="py-2 pr-3">Qty</th>
                          <th className="py-2 pr-3">Unit Price</th>
                          <th className="py-2 pr-3">Disc%</th>
                          <th className="py-2 pr-3">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.lines.map((l) => (
                          <tr key={l.id} className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-medium text-slate-800">{l.product.name}</td>
                            <td className="py-2 pr-3 text-slate-500 font-mono text-xs">{l.product.sku}</td>
                            <td className="py-2 pr-3 tabular-nums">{l.qty}</td>
                            <td className="py-2 pr-3 tabular-nums">{currency(l.unitPrice)}</td>
                            <td className="py-2 pr-3 tabular-nums">{Number(l.discountPct)}%</td>
                            <td className="py-2 pr-3 tabular-nums font-semibold text-slate-800">{currency(l.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </div>

              <div className="space-y-6">
                <SectionCard title="Pricing Summary">
                  {(() => {
                    const linesSubtotal = (q.lines ?? []).reduce((acc, l) => acc + Number(l.lineTotal), 0) || Number(q.subtotal) || 0;
                    const discountPct = Number(q.discountPct) || 0;
                    const discountTotal = Number(q.discountTotal) > 0 ? Number(q.discountTotal) : (linesSubtotal * discountPct) / 100;
                    const taxTotal = Number(q.taxTotal) || 0;
                    const total = Number(q.total) > 0 && Math.abs(Number(q.total) - (linesSubtotal - discountTotal + taxTotal)) < 1
                      ? Number(q.total)
                      : linesSubtotal - discountTotal + taxTotal;

                    return (
                      <dl className="space-y-1.5 text-sm">
                        <Row label="Subtotal" value={currency(linesSubtotal)} />
                        {discountPct > 0 && (
                          <Row label={`Discount (${discountPct}%)`} value={`- ${currency(discountTotal)}`} />
                        )}
                        <Row label="Tax (GST)" value={currency(taxTotal)} />
                        <div className="mt-2 border-t border-slate-200 pt-2">
                          <Row label="Total" value={currency(total)} bold />
                        </div>
                        {!isCustomer && (
                          <div className="mt-2 border-t border-slate-100 pt-2 flex items-center justify-between">
                            <dt className="text-slate-500 text-xs">Estimated Margin</dt>
                            <dd className="font-bold text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              {Number(q.marginPct)}% est.
                            </dd>
                          </div>
                        )}
                      </dl>
                    );
                  })()}
                </SectionCard>

                <SectionCard title="Customer Account">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{q.customer?.name}</p>
                    {q.customer?.segment && <Badge kind="info">{q.customer.segment}</Badge>}
                  </div>
                  {q.customer?.contactName && (
                    <p className="text-xs text-slate-500 mt-1">
                      {q.customer.contactName} · {q.customer.contactEmail}
                    </p>
                  )}
                </SectionCard>

                {q.invoices && q.invoices.length > 0 && (
                  <SectionCard title="Related Invoices">
                    <ul className="space-y-2 text-sm">
                      {q.invoices.map((inv) => (
                        <li key={inv.id} className="flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-200">
                          <Link href={`/invoices/${inv.id}`} className="text-brand-600 font-semibold hover:underline">
                            {inv.number}
                          </Link>
                          <Badge kind={inv.status === 'PAID' ? 'success' : 'warning'}>{inv.status}</Badge>
                        </li>
                      ))}
                    </ul>
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
