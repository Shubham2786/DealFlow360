'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { useToast } from '@/components/toast';
import { api } from '@/lib/api';
import { inr } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-auth';

const currency = (n: string | number) => inr(n, true);

const STEP_KIND: Record<string, string> = {
  PENDING: 'info',
  APPROVED: 'success',
  REJECTED: 'critical',
  CHANGES_REQUESTED: 'warning',
  SKIPPED: 'info',
};

export default function ApprovalDetailPage() {
  const auth = useRequireAuth();
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const id = String(params.id);
  const qc = useQueryClient();
  const [comment, setComment] = useState('');

  const req = useQuery({
    queryKey: ['approval', id],
    queryFn: () => api.approvals.get(id),
    enabled: !!id,
  });

  const invalidate = async () => {
    await qc.invalidateQueries();
  };

  const approve = useMutation({
    mutationFn: () => api.approvals.approve(id, comment),
    onSuccess: async () => {
      toast.success('Step approved successfully!');
      setComment('');
      await invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to approve step'),
  });

  const reject = useMutation({
    mutationFn: () => {
      if (!comment.trim()) throw new Error('A reason comment is mandatory when rejecting a deal.');
      return api.approvals.reject(id, comment);
    },
    onSuccess: async () => {
      toast.success('Approval request rejected.');
      setComment('');
      await invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to reject step'),
  });

  const requestChanges = useMutation({
    mutationFn: () => {
      if (!comment.trim()) throw new Error('A comment explaining required revisions is mandatory.');
      return api.approvals.requestChanges(id, comment);
    },
    onSuccess: async () => {
      toast.success('Changes requested from salesperson.');
      setComment('');
      await invalidate();
    },
    onError: (err: any) => toast.error(err.message || 'Failed to request changes'),
  });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const r = req.data;
  const role = auth.data?.role;
  const currentStep = r?.steps.find((s) => s.status === 'PENDING');
  const canDecide =
    r?.status === 'PENDING' &&
    currentStep &&
    (role === 'ADMIN' || role === currentStep.role);
  const pending = approve.isPending || reject.isPending || requestChanges.isPending;
  const lastError = (approve.error || reject.error || requestChanges.error) as Error | null;

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <Link
            href="/approvals"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition"
          >
            ← Back to Approvals
          </Link>
        </div>

        {req.isLoading && <EmptyState message="Loading approval…" />}
        {req.isError && <p className="text-sm text-red-600">Approval {id} could not be found.</p>}

        {r && (
          <>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900">
                  <Link href={`/quotations/${r.quotation.id}`} className="hover:underline">
                    {r.quotation.number}
                  </Link>
                </h1>
                <Badge kind={r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'critical' : 'warning'}>
                  {r.status.replaceAll('_', ' ')}
                </Badge>
              </div>
              <p className="text-sm text-slate-500">
                {r.quotation.customer?.name}
                {r.quotation.customer?.segment && (
                  <span className="ml-2 inline-flex font-mono text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                    Tier: {r.quotation.customer.segment}
                  </span>
                )}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1 space-y-6">
                <SectionCard title="Commercial Facts">
                  <dl className="space-y-2 text-sm">
                    <Row label="Deal Total" value={currency(r.quotation.total)} />
                    <Row label="Header Discount" value={`${Number(r.quotation.discountPct)}%`} />
                    <Row label="Estimated Margin" value={`${Number(r.quotation.marginPct)}%`} />
                  </dl>
                </SectionCard>

                <SectionCard title="Governance Audit Finding">
                  <p className="text-sm text-slate-700 leading-relaxed">{r.reason ?? 'Standard threshold review'}</p>
                </SectionCard>
              </div>

              <div className="lg:col-span-2 space-y-6">
                <SectionCard title="Approval Hierarchy & Chain">
                  <ol className="space-y-2.5">
                    {r.steps.map((s) => {
                      const isCurrent = s.id === currentStep?.id && r.status === 'PENDING';
                      return (
                        <li
                          key={s.id}
                          className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                            isCurrent
                              ? 'border-brand-500 bg-brand-50/40 shadow-sm ring-1 ring-brand-400'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                                isCurrent
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {s.level}
                            </span>
                            <div>
                              <div className="text-sm font-semibold text-slate-800">
                                {s.role.replaceAll('_', ' ')}
                                {isCurrent && (
                                  <span className="ml-2 text-xs font-normal text-brand-700 font-sans">
                                    (Active Decision Step)
                                  </span>
                                )}
                              </div>
                              {s.approver && (
                                <div className="text-xs text-slate-400">
                                  Decided by {s.approver.name}
                                  {s.decidedAt && ` on ${new Date(s.decidedAt).toLocaleDateString()}`}
                                </div>
                              )}
                              {s.comment && (
                                <div className="text-xs italic text-slate-600 mt-1">
                                  &ldquo;{s.comment}&rdquo;
                                </div>
                              )}
                            </div>
                          </div>
                          <Badge kind={STEP_KIND[s.status] ?? 'info'}>{s.status.replaceAll('_', ' ')}</Badge>
                        </li>
                      );
                    })}
                  </ol>
                </SectionCard>

                {/* Line items for approver context */}
                {r.quotation.lines && r.quotation.lines.length > 0 && (
                  <SectionCard title="Quotation Line Items Under Review">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 uppercase tracking-wider text-slate-500 pb-2">
                            <th className="pb-1.5">Product</th>
                            <th className="pb-1.5 text-center">Qty</th>
                            <th className="pb-1.5 text-right">Unit Price</th>
                            <th className="pb-1.5 text-right">Disc%</th>
                            <th className="pb-1.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {r.quotation.lines.map((l) => (
                            <tr key={l.id}>
                              <td className="py-2">
                                <span className="font-semibold text-slate-800">{l.product.name}</span>
                                <span className="text-slate-400 ml-1">({l.product.sku})</span>
                              </td>
                              <td className="py-2 text-center tabular-nums">{l.qty}</td>
                              <td className="py-2 text-right tabular-nums">{currency(l.unitPrice)}</td>
                              <td className="py-2 text-right tabular-nums font-semibold">{l.discountPct}%</td>
                              <td className="py-2 text-right tabular-nums font-bold text-slate-800">
                                {currency(l.lineTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                )}

                <SectionCard title="Take Action on this Deal">
                  {r.status !== 'PENDING' ? (
                    <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
                      This request has been concluded as <strong className="uppercase">{r.status}</strong>.
                    </div>
                  ) : canDecide ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Decision Reason / Audit Comment
                          <span className="text-slate-400 font-normal ml-1">
                            (Mandatory when rejecting or requesting revisions)
                          </span>
                        </label>
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Provide commercial rationale, requested discount ceilings, or conditional approval notes..."
                          className="w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-brand-500 focus:outline-none"
                          rows={3}
                        />
                      </div>

                      {lastError && (
                        <div className="rounded bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-800">
                          {lastError.message}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() => approve.mutate()}
                          disabled={pending}
                          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                        >
                          Approve Step
                        </button>
                        <button
                          onClick={() => requestChanges.mutate()}
                          disabled={pending}
                          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        >
                          Request Changes
                        </button>
                        <button
                          onClick={() => reject.mutate()}
                          disabled={pending}
                          className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          Reject Deal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
                      Awaiting review from <strong>{currentStep?.role.replaceAll('_', ' ')}</strong>. Your role (
                      {role}) cannot take action on this step.
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline py-1 border-b border-slate-50 last:border-none">
      <dt className="text-slate-500 text-xs">{label}</dt>
      <dd className="tabular-nums font-semibold text-slate-800 text-sm">{value}</dd>
    </div>
  );
}
