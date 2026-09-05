'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { inr, formatDate } from '@/lib/format';

/**
 * PUBLIC customer portal — no login, no app shell. Shows only customer-safe fields.
 * Reached via a tokenized link shared by the sales team.
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
  const accept = useMutation({ mutationFn: () => api.portal.accept(token, message), onSuccess: () => { setDone('Thank you — you accepted the proposal.'); refresh(); } });
  const reject = useMutation({ mutationFn: () => api.portal.reject(token, message), onSuccess: () => { setDone('You declined the proposal.'); refresh(); } });
  const change = useMutation({
    mutationFn: () => api.portal.requestChange(token, message || 'Requesting changes', discount ? Number(discount) : undefined),
    onSuccess: () => { setDone('Your change request was sent to the sales team.'); refresh(); },
  });

  const busy = accept.isPending || reject.isPending || change.isPending;
  const p = view.data;

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-6">
          <div className="text-lg font-bold text-brand-700">DealFlow360</div>
          <p className="text-sm text-slate-500">Commercial proposal</p>
        </div>

        {view.isLoading && <p className="text-sm text-slate-400">Loading proposal…</p>}
        {view.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            This link is invalid or has expired. Please contact your sales representative.
          </div>
        )}

        {p && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Proposal {p.quoteNumber}</h1>
                  <p className="text-sm text-slate-500">Prepared for {p.customer}</p>
                </div>
                <div className="text-right text-sm text-slate-500">
                  Valid until<br /><span className="font-medium text-slate-700">{formatDate(p.validUntil)}</span>
                </div>
              </div>

              <table className="mt-5 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Qty</th>
                    <th className="py-2 pr-3">Unit</th>
                    <th className="py-2 pr-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {p.lines.map((l, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{l.product}<div className="text-xs text-slate-400">{l.sku}</div></td>
                      <td className="py-2 pr-3 tabular-nums">{l.qty}</td>
                      <td className="py-2 pr-3 tabular-nums">{inr(l.unitPrice)}</td>
                      <td className="py-2 pr-3 tabular-nums">{inr(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
                <Row label="Subtotal" value={inr(p.subtotal)} />
                <Row label={`Discount (${Number(p.discountPct)}%)`} value={`- ${inr(p.discountTotal)}`} />
                <Row label="GST" value={inr(p.taxTotal)} />
                <div className="mt-1 border-t border-slate-200 pt-1"><Row label="Total" value={inr(p.total)} bold /></div>
              </dl>
            </div>

            {done ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800">{done}</div>
            ) : ['ACCEPTED', 'REJECTED'].includes(p.negotiationStatus) ? (
              <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
                This proposal is {p.negotiationStatus.toLowerCase()}.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Your response</h2>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Optional message to the sales team"
                  rows={2}
                  className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="mb-3">
                  <label className="text-sm text-slate-600">Request a different discount % (optional)</label>
                  <input type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(e.target.value)}
                    className="ml-2 w-24 rounded-md border border-slate-300 px-2 py-1 text-sm" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => accept.mutate()} disabled={busy} className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">Accept</button>
                  <button onClick={() => change.mutate()} disabled={busy} className="rounded-md border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60">Request changes</button>
                  <button onClick={() => reject.mutate()} disabled={busy} className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">Decline</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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
