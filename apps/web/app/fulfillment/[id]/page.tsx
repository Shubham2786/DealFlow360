'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-auth';

const FSTATUS: Record<string, string> = {
  PENDING: 'info',
  ALLOCATED: 'success',
  PARTIALLY_ALLOCATED: 'warning',
  BACKORDERED: 'critical',
  FULFILLED: 'success',
  FAILED: 'critical',
};

export default function FulfillmentDetailPage() {
  const auth = useRequireAuth();
  const params = useParams();
  const id = String(params.id);
  const qc = useQueryClient();

  const f = useQuery({ queryKey: ['fulfillment', id], queryFn: () => api.fulfillment.get(id), enabled: !!id });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['fulfillment', id] });
    await qc.invalidateQueries({ queryKey: ['fulfillment'] });
  };
  const allocate = useMutation({ mutationFn: () => api.fulfillment.allocate(id), onSuccess: invalidate });
  const fulfill = useMutation({ mutationFn: () => api.fulfillment.fulfill(id), onSuccess: invalidate });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const order = f.data;
  const pending = allocate.isPending || fulfill.isPending;
  const canAllocate = order && ['PENDING', 'PARTIALLY_ALLOCATED', 'BACKORDERED'].includes(order.status);
  const canFulfill = order && order.lines.some((l) => l.allocatedQty > l.fulfilledQty);
  const err = (allocate.error || fulfill.error) as Error | null;

  return (
    <AppShell>
      <div className="space-y-6">
        <Link href="/fulfillment" className="text-sm text-brand-600 hover:underline">← Back to fulfillment</Link>

        {f.isLoading && <EmptyState message="Loading order…" />}
        {f.isError && <p className="text-sm text-red-600">Fulfillment {id} could not be found.</p>}

        {order && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900">{order.number}</h1>
                  <Badge kind={FSTATUS[order.status] ?? 'info'}>{order.status.replaceAll('_', ' ')}</Badge>
                </div>
                <p className="text-sm text-slate-500">
                  {order.customer?.name} · Quote{' '}
                  {order.quotation && (
                    <Link href={`/quotations/${order.quotation.id}`} className="text-brand-600 hover:underline">
                      {order.quotation.number}
                    </Link>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                {canAllocate && (
                  <button onClick={() => allocate.mutate()} disabled={pending} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                    Allocate
                  </button>
                )}
                {canFulfill && (
                  <button onClick={() => fulfill.mutate()} disabled={pending} className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">
                    Fulfill Allocated
                  </button>
                )}
              </div>
            </div>

            {err && <p className="text-sm text-red-600">{err.message}</p>}

            <SectionCard title="Lines">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">Product</th>
                      <th className="py-2 pr-3">Ordered</th>
                      <th className="py-2 pr-3">Allocated</th>
                      <th className="py-2 pr-3">Fulfilled</th>
                      <th className="py-2 pr-3">Backordered</th>
                      <th className="py-2 pr-3">Allocation</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((l) => (
                      <tr key={l.id} className="border-b border-slate-100 align-top">
                        <td className="py-2 pr-3">
                          {l.product?.name}
                          <div className="text-xs text-slate-400">{l.product?.sku}</div>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{l.orderedQty}</td>
                        <td className="py-2 pr-3 tabular-nums font-medium text-green-700">{l.allocatedQty}</td>
                        <td className="py-2 pr-3 tabular-nums">{l.fulfilledQty}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {l.backorderedQty > 0 ? (
                            <span className="font-medium text-red-600">{l.backorderedQty}</span>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-500">
                          {l.allocations && l.allocations.length > 0
                            ? l.allocations.map((a) => `${a.warehouse.code}:${a.quantity}${a.source === 'BACKORDER' ? '*' : ''}`).join(', ')
                            : '—'}
                        </td>
                        <td className="py-2 pr-3"><Badge kind={FSTATUS[l.status] ?? 'info'}>{l.status.replaceAll('_', ' ')}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-400">* allocated from a backorder after inventory receipt</p>
            </SectionCard>
          </>
        )}
      </div>
    </AppShell>
  );
}
