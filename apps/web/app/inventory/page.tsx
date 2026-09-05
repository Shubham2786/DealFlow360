'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-auth';

export default function InventoryPage() {
  const auth = useRequireAuth();
  const qc = useQueryClient();
  const inventory = useQuery({ queryKey: ['inventory'], queryFn: api.inventory.list });
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: api.inventory.warehouses });
  const products = useQuery({ queryKey: ['products'], queryFn: api.products.list });

  const [form, setForm] = useState({ warehouseId: '', productId: '', quantity: 10, reference: '' });
  const [msg, setMsg] = useState('');

  const receive = useMutation({
    mutationFn: () => api.inventory.receive({ ...form, quantity: Number(form.quantity) }),
    onSuccess: async (r: unknown) => {
      const res = r as { idempotent?: boolean; backordersFulfilled?: number };
      setMsg(
        res.idempotent
          ? 'Receipt already processed (idempotent — no double count).'
          : `Received. Backorders fulfilled: ${res.backordersFulfilled ?? 0}.`,
      );
      await qc.invalidateQueries({ queryKey: ['inventory'] });
      await qc.invalidateQueries({ queryKey: ['fulfillment'] });
    },
  });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const rows = inventory.data ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">On-hand, reserved, and available-to-promise per warehouse.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SectionCard title="Stock">
              {inventory.isLoading && <EmptyState message="Loading…" />}
              {inventory.data && rows.length === 0 && <EmptyState message="No inventory records." />}
              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Product</th>
                        <th className="py-2 pr-3">Warehouse</th>
                        <th className="py-2 pr-3">On Hand</th>
                        <th className="py-2 pr-3">Reserved</th>
                        <th className="py-2 pr-3">Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const available = r.onHand - r.reserved;
                        return (
                          <tr key={r.id} className="border-b border-slate-100">
                            <td className="py-2 pr-3">{r.product.name}<div className="text-xs text-slate-400">{r.product.sku}</div></td>
                            <td className="py-2 pr-3 text-slate-600">{r.warehouse.code}</td>
                            <td className="py-2 pr-3 tabular-nums">{r.onHand}</td>
                            <td className="py-2 pr-3 tabular-nums">{r.reserved}</td>
                            <td className={`py-2 pr-3 tabular-nums font-medium ${available <= 0 ? 'text-red-600' : 'text-slate-800'}`}>{available}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          <div>
            <SectionCard title="Receive Inventory">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setMsg('');
                  receive.mutate();
                }}
                className="space-y-3 text-sm"
              >
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600">Warehouse</span>
                  <select required value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5">
                    <option value="">Select…</option>
                    {(warehouses.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600">Product</span>
                  <select required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5">
                    <option value="">Select…</option>
                    {(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600">Quantity</span>
                  <input type="number" min={1} required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600">Reference (idempotency key)</span>
                  <input required value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="e.g. PO-12345" className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
                </label>
                {receive.isError && <p className="text-red-600">{(receive.error as Error).message}</p>}
                {msg && <p className="text-green-700">{msg}</p>}
                <button type="submit" disabled={receive.isPending} className="w-full rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                  {receive.isPending ? 'Receiving…' : 'Receive'}
                </button>
              </form>
            </SectionCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
