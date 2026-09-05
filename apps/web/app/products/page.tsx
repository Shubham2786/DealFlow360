'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-auth';

const currency = (n: string | number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n));

const empty = { sku: '', name: '', category: '', type: 'ONE_TIME', basePrice: 0, taxRate: 0 };

export default function ProductsPage() {
  const auth = useRequireAuth();
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ['products'], queryFn: api.products.list });
  const [form, setForm] = useState({ ...empty });
  const isAdmin = auth.data?.role === 'ADMIN';

  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] });
  const create = useMutation({
    mutationFn: () => api.products.create({ ...form, basePrice: Number(form.basePrice), taxRate: Number(form.taxRate) }),
    onSuccess: async () => {
      setForm({ ...empty });
      await invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: (p: { id: string; active: boolean }) => api.products.update(p.id, { active: !p.active }),
    onSuccess: invalidate,
  });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const rows = products.data ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Product Catalog</h1>
          <p className="text-sm text-slate-500">Sellable products and services referenced across deals.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SectionCard title="Products">
              {products.isLoading && <EmptyState message="Loading…" />}
              {products.data && rows.length === 0 && <EmptyState message="No products yet." />}
              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">SKU</th>
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Category</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Base Price</th>
                        <th className="py-2 pr-3">Status</th>
                        {isAdmin && <th className="py-2 pr-3"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p) => (
                        <tr key={p.id} className="border-b border-slate-100">
                          <td className="py-2 pr-3 font-medium">{p.sku}</td>
                          <td className="py-2 pr-3">{p.name}</td>
                          <td className="py-2 pr-3 text-slate-600">{p.category ?? '—'}</td>
                          <td className="py-2 pr-3 text-slate-600">{p.type.replaceAll('_', ' ')}</td>
                          <td className="py-2 pr-3 tabular-nums">{currency(p.basePrice)}</td>
                          <td className="py-2 pr-3">
                            <Badge kind={p.active ? 'success' : 'critical'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                          </td>
                          {isAdmin && (
                            <td className="py-2 pr-3">
                              <button
                                onClick={() => toggle.mutate({ id: p.id, active: p.active })}
                                disabled={toggle.isPending}
                                className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-60"
                              >
                                {p.active ? 'Deactivate' : 'Activate'}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          <div>
            <SectionCard title="Add Product">
              {!isAdmin ? (
                <p className="text-sm text-slate-500">Only admins can add products.</p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    create.mutate();
                  }}
                  className="space-y-3 text-sm"
                >
                  <Field label="SKU" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} />
                  <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                  <Field label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} required={false} />
                  <label className="block">
                    <span className="mb-1 block font-medium text-slate-600">Type</span>
                    <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5">
                      <option value="ONE_TIME">One-time</option>
                      <option value="RECURRING">Recurring</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-medium text-slate-600">Base Price</span>
                    <input type="number" min={0} step="0.01" required value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })} className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-medium text-slate-600">Tax Rate %</span>
                    <input type="number" min={0} step="0.01" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })} className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
                  </label>
                  {create.isError && <p className="text-red-600">{(create.error as Error).message}</p>}
                  <button type="submit" disabled={create.isPending} className="w-full rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                    {create.isPending ? 'Creating…' : 'Create Product'}
                  </button>
                </form>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange, required = true }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      <input required={required} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
    </label>
  );
}
