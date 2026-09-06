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
  const [jsonError, setJsonError] = useState<string | null>(null);

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
    if (key === 'category_ceilings_json') {
      try {
        JSON.parse(value);
        setJsonError(null);
      } catch (err: any) {
        setJsonError(err.message);
      }
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (jsonError) return;
    update.mutate(form);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition mb-3"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">System Configuration</h1>
            <p className="text-sm text-slate-500">
              Commercial parameters, approval threshold rules, document prefixes, and environment settings.
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
          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {/* Commercial & Branding */}
                <SectionCard title="Commercial & Branding">
                  <div className="space-y-4">
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
                          Currency Code
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
                  </div>
                </SectionCard>

                {/* Document Numbering & Terms */}
                <SectionCard title="Document Prefixes & Payment Terms">
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500">
                      Configure prefixes for system generated identifiers and standard billing lifecycle windows.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Quotation Prefix
                        </label>
                        <input
                          type="text"
                          value={form.quotation_prefix ?? 'Q-'}
                          onChange={(e) => handleChange('quotation_prefix', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">e.g. Q-1001</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Invoice Prefix
                        </label>
                        <input
                          type="text"
                          value={form.invoice_prefix ?? 'INV-'}
                          onChange={(e) => handleChange('invoice_prefix', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">e.g. INV-1001</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Subscription Prefix
                        </label>
                        <input
                          type="text"
                          value={form.subscription_prefix ?? 'SUB-'}
                          onChange={(e) => handleChange('subscription_prefix', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">e.g. SUB-1001</span>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Default Payment Terms Name
                        </label>
                        <input
                          type="text"
                          value={form.default_payment_terms ?? 'Net 30'}
                          onChange={(e) => handleChange('default_payment_terms', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">Shown on invoices & proposals</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Default Payment Due Days
                        </label>
                        <input
                          type="number"
                          value={form.default_payment_terms_days ?? '30'}
                          onChange={(e) => handleChange('default_payment_terms_days', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">Days from invoice date until due</span>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {/* Multi-tier Discount Governance */}
                <SectionCard title="Governance: Discount Approval Thresholds">
                  <div className="space-y-4">
                    <p className="text-xs text-slate-500">
                      Discounts exceeding these thresholds escalate progressively up the hierarchy.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Auto-Approve (%)
                        </label>
                        <input
                          type="number"
                          value={form.discount_auto_approve_threshold_pct ?? '5'}
                          onChange={(e) => handleChange('discount_auto_approve_threshold_pct', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-emerald-600 font-medium">Instant approval</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Sales Manager (%)
                        </label>
                        <input
                          type="number"
                          value={form.discount_manager_threshold_pct ?? '10'}
                          onChange={(e) => handleChange('discount_manager_threshold_pct', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">Level 1 review</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Finance Head (%)
                        </label>
                        <input
                          type="number"
                          value={form.discount_finance_threshold_pct ?? '15'}
                          onChange={(e) => handleChange('discount_finance_threshold_pct', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">Level 2 review</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Executive / CEO (%)
                        </label>
                        <input
                          type="number"
                          value={form.discount_exec_threshold_pct ?? '25'}
                          onChange={(e) => handleChange('discount_exec_threshold_pct', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">Executive sign-off</span>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {/* Deal Value & Margin Guardrails */}
                <SectionCard title="Deal Value & Margin Guardrails">
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Min Floor Margin (%)
                        </label>
                        <input
                          type="number"
                          value={form.min_margin_threshold_pct ?? '15'}
                          onChange={(e) => handleChange('min_margin_threshold_pct', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-amber-600">Forces Finance review below this</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Healthy Target Margin (%)
                        </label>
                        <input
                          type="number"
                          value={form.healthy_margin_threshold_pct ?? '25'}
                          onChange={(e) => handleChange('healthy_margin_threshold_pct', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">Target for auto-approval</span>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Finance Deal Value Trigger ({form.currency_symbol || '₹'})
                        </label>
                        <input
                          type="number"
                          value={form.deal_value_finance_threshold ?? '500000'}
                          onChange={(e) => handleChange('deal_value_finance_threshold', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">Total deal size requiring Finance sign-off</span>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Executive Deal Value Trigger ({form.currency_symbol || '₹'})
                        </label>
                        <input
                          type="number"
                          value={form.deal_value_exec_threshold ?? '1500000'}
                          onChange={(e) => handleChange('deal_value_exec_threshold', e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                        <span className="text-[11px] text-slate-400">Mega-deals requiring Executive approval</span>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {/* Category Ceilings Matrix */}
                <SectionCard title="Category & Tier Discount Ceilings (JSON)">
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">
                      Configures maximum discount percentages allowed per product category (HARDWARE, SERVICES, SUBSCRIPTIONS, ACCESSORIES) across customer tiers (STANDARD, SMB, ENTERPRISE, STRATEGIC).
                    </p>
                    <textarea
                      rows={8}
                      value={form.category_ceilings_json ?? ''}
                      onChange={(e) => handleChange('category_ceilings_json', e.target.value)}
                      className={`w-full rounded-md border font-mono text-xs p-3 shadow-sm focus:outline-none focus:ring-1 ${
                        jsonError ? 'border-red-300 focus:border-red-500 focus:ring-red-500 bg-red-50' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500'
                      }`}
                    />
                    {jsonError && <p className="text-xs font-medium text-red-600">Invalid JSON: {jsonError}</p>}
                  </div>
                </SectionCard>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  {saved ? (
                    <span className="text-sm font-medium text-emerald-600">✓ System configuration saved successfully!</span>
                  ) : <div />}
                  <button
                    type="submit"
                    disabled={update.isPending || !!jsonError}
                    className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-50"
                  >
                    {update.isPending ? 'Saving…' : 'Save Configuration'}
                  </button>
                </div>
              </div>

              {/* Sidebar with environment and live routing preview */}
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
                      <dd className="font-semibold text-slate-800">
                        {form.currency || 'INR'} ({form.currency_symbol || '₹'}), GST {form.default_gst_rate || '18'}%
                      </dd>
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

                <SectionCard title="Active Routing Triggers">
                  <div className="space-y-4 text-xs">
                    <div>
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span>Auto-Approval</span>
                        <span className="text-emerald-600">≤ {form.discount_auto_approve_threshold_pct || 5}%</span>
                      </div>
                      <p className="mt-1 text-slate-500">
                        Deals within auto-approve discount with margin ≥ {form.healthy_margin_threshold_pct || 20}% and no category breaches bypass review.
                      </p>
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span>Level 1 (Sales Manager)</span>
                        <Badge kind="neutral">MANAGER</Badge>
                      </div>
                      <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-slate-600">
                        <li>Discount &gt; {form.discount_auto_approve_threshold_pct || 5}%</li>
                        <li>Deal total &gt; {form.currency_symbol || '₹'}{(Number(form.deal_value_finance_threshold || 500000) / 2).toLocaleString('en-IN')}</li>
                        <li>Per-line category ceiling exceeded</li>
                      </ul>
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span>Level 2 (Finance Head)</span>
                        <Badge kind="warning">FINANCE</Badge>
                      </div>
                      <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-slate-600">
                        <li>Discount &gt; {form.discount_finance_threshold_pct || 15}%</li>
                        <li>Deal total &gt; {form.currency_symbol || '₹'}{Number(form.deal_value_finance_threshold || 500000).toLocaleString('en-IN')}</li>
                        <li>Estimated margin &lt; {form.min_margin_threshold_pct || 15}%</li>
                        <li>Non-standard payment terms</li>
                      </ul>
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span>Level 3 (Executive / CEO)</span>
                        <Badge kind="danger">ADMIN</Badge>
                      </div>
                      <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-slate-600">
                        <li>Discount &gt; {form.discount_exec_threshold_pct || 25}%</li>
                        <li>Mega deal value &gt; {form.currency_symbol || '₹'}{Number(form.deal_value_exec_threshold || 1500000).toLocaleString('en-IN')}</li>
                      </ul>
                    </div>
                  </div>
                </SectionCard>
              </div>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
