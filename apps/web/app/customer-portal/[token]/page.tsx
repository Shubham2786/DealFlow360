'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { inr, formatDate } from '@/lib/format';

/**
 * Customer Portal — Secure proposal review and negotiation interface.
 * Shows customer-safe fields, message history, counter-offer options, and clear navigation.
 */
export default function CustomerPortalPage() {
  const params = useParams();
  const token = String(params.token);
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [discount, setDiscount] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const view = useQuery({ queryKey: ['portal', token], queryFn: () => api.portal.view(token), retry: false });

  const refresh = () => qc.invalidateQueries({ queryKey: ['portal', token] });
  const accept = useMutation({
    mutationFn: () => api.portal.accept(token, message),
    onSuccess: () => {
      setDone('Thank you — you accepted the commercial proposal.');
      refresh();
    },
  });
  const reject = useMutation({
    mutationFn: () => api.portal.reject(token, message),
    onSuccess: () => {
      setDone('You declined this commercial proposal.');
      refresh();
    },
  });
  const change = useMutation({
    mutationFn: () => api.portal.requestChange(token, message || 'Requesting changes', discount ? Number(discount) : undefined),
    onSuccess: () => {
      setDone('Your change request was successfully sent to the sales team.');
      refresh();
    },
  });

  const busy = accept.isPending || reject.isPending || change.isPending;
  const p = view.data;

  // Truthful pricing calculations (defense against seeded discrepancies)
  const linesSubtotal = (p?.lines ?? []).reduce((acc, l) => acc + Number(l.lineTotal), 0) || Number(p?.subtotal) || 0;
  const discountPct = Number(p?.discountPct) || 0;
  const discountTotal = Number(p?.discountTotal) > 0 ? Number(p?.discountTotal) : (linesSubtotal * discountPct) / 100;
  const taxTotal = Number(p?.taxTotal) || 0;
  const total = Number(p?.total) > 0 && Math.abs(Number(p?.total) - (linesSubtotal - discountTotal + taxTotal)) < 1
    ? Number(p?.total)
    : linesSubtotal - discountTotal + taxTotal;

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-3xl px-4 space-y-6">
        {/* Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition"
            >
              ← Back to Dashboard
            </Link>
            <span className="text-slate-300">|</span>
            <Link
              href="/quotations"
              className="text-xs text-slate-500 hover:text-slate-800 transition"
            >
              My Proposals
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Status:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              p?.negotiationStatus === 'ACCEPTED'
                ? 'bg-green-100 text-green-800 border border-green-200'
                : p?.negotiationStatus === 'REJECTED'
                ? 'bg-red-100 text-red-800 border border-red-200'
                : 'bg-amber-100 text-amber-800 border border-amber-200'
            }`}>
              {p?.negotiationStatus === 'OPEN' ? 'Under Negotiation' : (p?.negotiationStatus ?? 'Active')}
            </span>
          </div>
        </div>

        {view.isLoading && <p className="text-sm text-slate-400 py-6 text-center">Loading commercial proposal…</p>}
        {view.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            This link is invalid or has expired. Please contact your sales representative.
          </div>
        )}

        {p && (
          <div className="space-y-6">
            {/* Commercial Proposal Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-brand-600">DealFlow360 Proposal</div>
                  <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Proposal {p.quoteNumber}</h1>
                  <p className="text-sm text-slate-500">Prepared for <span className="font-semibold text-slate-800">{p.customer}</span></p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  Valid until<br />
                  <span className="font-semibold text-slate-800 text-sm">{formatDate(p.validUntil)}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2.5 pr-3">Item &amp; Description</th>
                      <th className="py-2.5 pr-3 text-center">Qty</th>
                      <th className="py-2.5 pr-3 text-right">Unit Price</th>
                      <th className="py-2.5 pr-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.lines.map((l, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-3 pr-3">
                          <div className="font-medium text-slate-800">{l.product}</div>
                          <div className="text-xs text-slate-400 font-mono">{l.sku}</div>
                        </td>
                        <td className="py-3 pr-3 text-center tabular-nums">{l.qty}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">{inr(l.unitPrice)}</td>
                        <td className="py-3 pr-3 text-right font-medium text-slate-800 tabular-nums">{inr(l.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Truthful Pricing Summary */}
              <dl className="mt-5 ml-auto max-w-sm space-y-1.5 text-sm border-t border-slate-100 pt-4">
                <Row label="Subtotal" value={inr(linesSubtotal)} />
                {discountPct > 0 && (
                  <Row label={`Discount (${discountPct}%)`} value={`- ${inr(discountTotal)}`} tone="discount" />
                )}
                <Row label="Tax (GST)" value={inr(taxTotal)} />
                <div className="mt-2 border-t border-slate-200 pt-2">
                  <Row label="Total Amount" value={inr(total)} bold />
                </div>
              </dl>
            </div>

            {/* Negotiation History & Message Thread */}
            {p.messages && p.messages.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                    Negotiation Conversation History
                  </h2>
                  <span className="text-xs text-slate-400">{p.messages.length} message(s)</span>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {p.messages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg p-3.5 text-xs border ${
                        m.author === 'CUSTOMER'
                          ? 'bg-brand-50/70 border-brand-200 ml-8 mr-0'
                          : 'bg-slate-50 border-slate-200 mr-8 ml-0'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold mb-1">
                        <span className={m.author === 'CUSTOMER' ? 'text-brand-900' : 'text-slate-800'}>
                          {m.author === 'CUSTOMER' ? 'You (Customer Request)' : 'Sales Representative'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {new Date(m.at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Response Form or Confirmation State */}
            {done ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-white font-bold text-sm shadow-sm">
                    ✓
                  </span>
                  <div>
                    <h3 className="font-semibold text-green-900 text-base">{done}</h3>
                    <p className="text-xs text-green-700 mt-1">
                      Your proposal update has been routed to your account representative. You can monitor progress on your dashboard.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-green-200/60">
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-4 py-2 text-xs font-semibold text-white hover:bg-green-800 shadow-sm transition"
                  >
                    ← Back to Dashboard
                  </Link>
                  <Link
                    href="/quotations"
                    className="rounded-lg border border-green-300 bg-white px-4 py-2 text-xs font-semibold text-green-800 hover:bg-green-100 transition"
                  >
                    View All Proposals
                  </Link>
                  <button
                    onClick={() => setDone(null)}
                    className="text-xs text-green-800 hover:underline px-2 py-1 ml-auto font-medium"
                  >
                    Send an additional message
                  </button>
                </div>
              </div>
            ) : ['ACCEPTED', 'REJECTED'].includes(p.negotiationStatus) ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center space-y-3 shadow-sm">
                <p className="text-sm text-slate-600 font-medium">
                  This proposal is <span className="font-bold">{p.negotiationStatus.toLowerCase()}</span>.
                </p>
                <div>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition"
                  >
                    ← Back to Dashboard
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                  Respond to Commercial Proposal
                </h2>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add comments, requested scope changes, or terms for the sales team..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 p-3 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />

                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Request Counter-Discount (%)</label>
                    <p className="text-[11px] text-slate-500">Current discount is {discountPct}%. Enter your requested discount:</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      placeholder="e.g. 15"
                      className="w-24 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-right font-medium focus:border-brand-500 focus:outline-none"
                    />
                    <span className="text-xs font-semibold text-slate-500">%</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => accept.mutate()}
                    disabled={busy}
                    className="rounded-lg bg-green-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60 shadow-sm transition"
                  >
                    Accept Proposal
                  </button>
                  <button
                    onClick={() => change.mutate()}
                    disabled={busy}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-60 transition"
                  >
                    Submit Change Request
                  </button>
                  <button
                    onClick={() => reject.mutate()}
                    disabled={busy}
                    className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 transition"
                  >
                    Decline
                  </button>

                  <Link
                    href="/dashboard"
                    className="ml-auto text-xs text-slate-500 hover:text-slate-800 font-medium transition"
                  >
                    Cancel &amp; Return to Dashboard
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'discount' | 'default' }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <dt className={bold ? 'font-semibold text-slate-800' : 'text-slate-500'}>{label}</dt>
      <dd className={`tabular-nums ${
        bold
          ? 'font-bold text-base text-slate-900'
          : tone === 'discount'
          ? 'font-semibold text-emerald-700'
          : 'text-slate-700'
      }`}>
        {value}
      </dd>
    </div>
  );
}
