'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-auth';

const empty = { name: '', segment: 'STANDARD', contactName: '', contactEmail: '', contactPhone: '' };

export default function CustomersPage() {
  const auth = useRequireAuth();
  const qc = useQueryClient();
  const customers = useQuery({ queryKey: ['customers'], queryFn: api.customers.list });
  const [form, setForm] = useState({ ...empty });

  const create = useMutation({
    mutationFn: () => api.customers.create(form),
    onSuccess: async () => { setForm({ ...empty }); await qc.invalidateQueries({ queryKey: ['customers'] }); },
  });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const rows = customers.data ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">Accounts that deals and invoices belong to.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SectionCard title="Customers">
              {customers.isLoading && <EmptyState message="Loading…" />}
              {customers.data && rows.length === 0 && <EmptyState message="No customers yet." />}
              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Segment</th>
                        <th className="py-2 pr-3">Contact</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => (
                        <tr key={c.id} className="border-b border-slate-100">
                          <td className="py-2 pr-3 font-medium">{c.name}</td>
                          <td className="py-2 pr-3 text-slate-600">{c.segment}</td>
                          <td className="py-2 pr-3 text-slate-600">
                            {c.contactName ?? '—'}{c.contactEmail ? ` · ${c.contactEmail}` : ''}
                          </td>
                          <td className="py-2 pr-3"><Badge kind={c.active ? 'success' : 'critical'}>{c.active ? 'Active' : 'Inactive'}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          <div>
            <SectionCard title="Add Customer">
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3 text-sm">
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600">Name</span>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600">Segment</span>
                  <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5">
                    <option value="STANDARD">Standard</option>
                    <option value="SMB">SMB</option>
                    <option value="ENTERPRISE">Enterprise</option>
                    <option value="STRATEGIC">Strategic</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600">Contact name</span>
                  <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600">Contact email</span>
                  <input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-600">Contact phone</span>
                  <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="+91…" className="w-full rounded-md border border-slate-300 px-2 py-1.5" />
                </label>
                {create.isError && <p className="text-red-600">{(create.error as Error).message}</p>}
                <button type="submit" disabled={create.isPending} className="w-full rounded-md bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60">
                  {create.isPending ? 'Creating…' : 'Create Customer'}
                </button>
              </form>
            </SectionCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
