'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { inr } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-auth';

const currency = (n: string | number) => inr(n);

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
  const id = String(params.id);
  const qc = useQueryClient();
  const [comment, setComment] = useState('');

  const req = useQuery({ queryKey: ['approval', id], queryFn: () => api.approvals.get(id), enabled: !!id });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['approval', id] });
    await qc.invalidateQueries({ queryKey: ['approvals'] });
  };
  const approve = useMutation({ mutationFn: () => api.approvals.approve(id, comment), onSuccess: invalidate });
  const reject = useMutation({ mutationFn: () => api.approvals.reject(id, comment), onSuccess: invalidate });
  const requestChanges = useMutation({ mutationFn: () => api.approvals.requestChanges(id, comment), onSuccess: invalidate });

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
      <div className="space-y-6">
        <Link href="/approvals" className="text-sm text-brand-600 hover:underline">← Back to approvals</Link>

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
              <p className="text-sm text-slate-500">{r.quotation.customer?.name}</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1 space-y-6">
                <SectionCard title="Deal Summary">
                  <dl className="space-y-1 text-sm">
                    <Row label="Value" value={currency(r.quotation.total)} />
                    <Row label="Discount" value={`${Number(r.quotation.discountPct)}%`} />
                    <Row label="Margin" value={`${Number(r.quotation.marginPct)}%`} />
                  </dl>
                </SectionCard>
                <SectionCard title="Why approval is required">
                  <p className="text-sm text-slate-600">{r.reason ?? '—'}</p>
                </SectionCard>
              </div>

              <div className="lg:col-span-2 space-y-6">
                <SectionCard title="Approval Chain">
                  <ol className="space-y-2">
                    {r.steps.map((s) => (
                      <li key={s.id} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-400">#{s.level}</span>
                          <span className="text-sm font-medium text-slate-700">{s.role.replaceAll('_', ' ')}</span>
                          {s.approver && <span className="text-xs text-slate-400">by {s.approver.name}</span>}
                        </div>
                        <Badge kind={STEP_KIND[s.status] ?? 'info'}>{s.status.replaceAll('_', ' ')}</Badge>
                      </li>
                    ))}
                  </ol>
                </SectionCard>

                <SectionCard title="Decision">
                  {r.status !== 'PENDING' ? (
                    <p className="text-sm text-slate-500">This request is {r.status.replaceAll('_', ' ').toLowerCase()}.</p>
                  ) : canDecide ? (
                    <div className="space-y-3">
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Optional comment"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        rows={2}
                      />
                      {lastError && <p className="text-sm text-red-600">{lastError.message}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => approve.mutate()} disabled={pending} className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">Approve</button>
                        <button onClick={() => requestChanges.mutate()} disabled={pending} className="rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60">Request Changes</button>
                        <button onClick={() => reject.mutate()} disabled={pending} className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">Reject</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Awaiting <strong>{currentStep?.role.replaceAll('_', ' ')}</strong>. You ({role}) cannot act on this step.
                    </p>
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
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="tabular-nums text-slate-700">{value}</dd>
    </div>
  );
}
