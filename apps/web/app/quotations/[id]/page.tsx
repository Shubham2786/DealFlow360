'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { DealStatusBadge, EmptyState, LifecycleStepper, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-auth';

const currency = (n: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n));

export default function QuotationDetailPage() {
  const auth = useRequireAuth();
  const params = useParams();
  const id = String(params.id);
  const qc = useQueryClient();

  const quotation = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api.quotations.get(id),
    enabled: !!id,
  });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['quotation', id] });
    await qc.invalidateQueries({ queryKey: ['quotations'] });
  };
  const submit = useMutation({ mutationFn: () => api.quotations.submit(id), onSuccess: invalidate });
  const cancel = useMutation({ mutationFn: () => api.quotations.cancel(id), onSuccess: invalidate });
  const revise = useMutation({ mutationFn: () => api.quotations.revise(id), onSuccess: invalidate });

  if (auth.isLoading || auth.data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>
    );
  }

  const q = quotation.data;
  const status = q?.status ?? '';
  const canSubmit = status === 'DRAFT';
  const canRevise = ['CHANGES_REQUESTED', 'REJECTED', 'NEGOTIATION'].includes(status);
  const canCancel = !['CANCELLED', 'COMPLETED', 'PAID'].includes(status);
  const pending = submit.isPending || cancel.isPending || revise.isPending;

  return (
    <AppShell>
      <div className="space-y-6">
        <Link href="/quotations" className="text-sm text-brand-600 hover:underline">
          ← Back to quotations
        </Link>

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
              <div className="flex gap-2">
                {canSubmit && (
                  <button
                    onClick={() => submit.mutate()}
                    disabled={pending}
                    className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    Submit for Approval
                  </button>
                )}
                {canRevise && (
                  <button
                    onClick={() => revise.mutate()}
                    disabled={pending}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Revise (back to Draft)
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => {
                      if (confirm('Cancel this quotation?')) cancel.mutate();
                    }}
                    disabled={pending}
                    className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <SectionCard title="Lifecycle">
              <LifecycleStepper status={q.status} />
            </SectionCard>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <SectionCard title="Line Items">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-3">Product</th>
                          <th className="py-2 pr-3">SKU</th>
                          <th className="py-2 pr-3">Qty</th>
                          <th className="py-2 pr-3">Unit</th>
                          <th className="py-2 pr-3">Disc%</th>
                          <th className="py-2 pr-3">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.lines.map((l) => (
                          <tr key={l.id} className="border-b border-slate-100">
                            <td className="py-2 pr-3">{l.product.name}</td>
                            <td className="py-2 pr-3 text-slate-500">{l.product.sku}</td>
                            <td className="py-2 pr-3 tabular-nums">{l.qty}</td>
                            <td className="py-2 pr-3 tabular-nums">{currency(l.unitPrice)}</td>
                            <td className="py-2 pr-3 tabular-nums">{Number(l.discountPct)}%</td>
                            <td className="py-2 pr-3 tabular-nums">{currency(l.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </div>

              <div className="space-y-6">
                <SectionCard title="Pricing Summary">
                  <dl className="space-y-1 text-sm">
                    <Row label="Subtotal" value={currency(q.subtotal)} />
                    <Row label={`Discount (${Number(q.discountPct)}%)`} value={`- ${currency(q.discountTotal)}`} />
                    <Row label="Tax" value={currency(q.taxTotal)} />
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <Row label="Total" value={currency(q.total)} bold />
                    </div>
                    <Row label="Margin" value={`${Number(q.marginPct)}%`} />
                  </dl>
                </SectionCard>

                <SectionCard title="Customer">
                  <p className="text-sm font-medium text-slate-800">{q.customer?.name}</p>
                  <p className="text-sm text-slate-500">{q.customer?.segment}</p>
                  {q.customer?.contactName && (
                    <p className="text-sm text-slate-500">
                      {q.customer.contactName} · {q.customer.contactEmail}
                    </p>
                  )}
                </SectionCard>

                {q.invoices.length > 0 && (
                  <SectionCard title="Invoices">
                    <ul className="space-y-1 text-sm">
                      {q.invoices.map((inv) => (
                        <li key={inv.id} className="flex justify-between">
                          <Link href={`/invoices/${inv.id}`} className="text-brand-600 hover:underline">
                            {inv.number}
                          </Link>
                          <span className="text-slate-500">{inv.status}</span>
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
