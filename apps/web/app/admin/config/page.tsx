'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { usePermissions, useRequireAuth } from '@/lib/use-auth';

export default function AdminConfigPage() {
  const auth = useRequireAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();

  const config = useQuery({
    queryKey: ['admin-config'],
    queryFn: api.adminConfig.get,
    enabled: can('USER_MANAGE'),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config.data?.settings) {
      setForm(config.data.settings);
    }
  }, [config.data]);

  const update = useMutation({
    mutationFn: (settings: Record<string, string>) => api.adminConfig.update(settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-config'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!can('USER_MANAGE')) {
    return (
      <AppShell>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You don’t have permission to access system configuration. (Requires an administrator.)
        </div>
      </AppShell>
    );
  }

  const c = config.data;

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(form);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">System Configuration</h1>
            <p className="text-sm text-slate-500">
              Commercial parameters, approval threshold rules and environment settings.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/users"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              User Management →
            </Link>
          </div>
        </div>

        {config.isLoading && <EmptyState message="Loading configuration…" />}
        {config.isError && (
          <p className="text-sm text-red-600">Could not load configuration.</p>
        )}

        {c && (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <SectionCard title="Commercial & Operational Parameters">
                  <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Company Name
                        </label>
                        <input
                          type="text"
                          value={form.company_name ?? ''}
                          onChange={(e) => handleChange('company_name', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Support Email
                        </label>
                        <input
                          type="email"
                          value={form.support_email ?? ''}
                          onChange={(e) => handleChange('support_email', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Currency
                        </label>
                        <input
                          type="text"
                          value={form.currency ?? ''}
                          onChange={(e) => handleChange('currency', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Currency Symbol
                        </label>
                        <input
                          type="text"
                          value={form.currency_symbol ?? ''}
                          onChange={(e) => handleChange('currency_symbol', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Default GST Rate (%)
                        </label>
                        <input
                          type="number"
                          value={form.default_gst_rate ?? ''}
                          onChange={(e) => handleChange('default_gst_rate', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Manager Approval Discount (%)
                        </label>
                        <input
                          type="number"
                          value={form.discount_manager_threshold_pct ?? ''}
                          onChange={(e) => handleChange('discount_manager_threshold_pct', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-xs text-slate-400">Triggers Level 1 review</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Finance Approval Discount (%)
                        </label>
                        <input
                          type="number"
                          value={form.discount_finance_threshold_pct ?? ''}
                          onChange={(e) => handleChange('discount_finance_threshold_pct', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-xs text-slate-400">Triggers Level 2 review</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Min Margin Threshold (%)
                        </label>
                        <input
                          type="number"
                          value={form.min_margin_threshold_pct ?? ''}
                          onChange={(e) => handleChange('min_margin_threshold_pct', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-xs text-slate-400">Low margin warning</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4">
                      {saved ? (
                        <span className="text-xs font-medium text-emerald-600">✓ Settings saved successfully</span>
                      ) : <div />}
                      <button
                        type="submit"
                        disabled={update.isPending}
                        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-50"
                      >
                        {update.isPending ? 'Saving…' : 'Save Configuration'}
                      </button>
                    </div>
                  </form>
                </SectionCard>
              </div>

              <div className="space-y-6">
                <SectionCard title="System Environment">
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Environment</dt>
                      <dd className="font-semibold text-slate-800">{c.system.environment}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Database Engine</dt>
                      <dd className="font-semibold text-slate-800">{c.system.databaseEngine}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Localization</dt>
                      <dd className="font-semibold text-slate-800">{c.system.localization}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">RBAC Roles</dt>
                      <dd className="flex flex-wrap gap-1 pt-1">
                        {c.system.rbacRoles.map((r) => (
                          <Badge key={r} kind="info">{r}</Badge>
                        ))}
                      </dd>
                    </div>
                  </dl>
                </SectionCard>

                <SectionCard title="Approval Routing Policy">
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-800">
                        Level 1 ({c.approvalPolicy.level1.role})
                      </div>
                      <ul className="mt-1 list-disc pl-4 text-slate-600">
                        {c.approvalPolicy.level1.triggers.map((t, idx) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="pt-2 border-t border-slate-100">
                      <div className="font-semibold text-slate-800">
                        Level 2 ({c.approvalPolicy.level2.role})
                      </div>
                      <ul className="mt-1 list-disc pl-4 text-slate-600">
                        {c.approvalPolicy.level2.triggers.map((t, idx) => (
                          <li key={idx}>{t}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </SectionCard>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
