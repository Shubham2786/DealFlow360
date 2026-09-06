'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, SectionCard } from '@/components/ui';
import { useToast } from '@/components/toast';
import { api, type QuotationLineInput, type QuotationPreview } from '@/lib/api';
import { inr } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-auth';

interface BuilderLine extends QuotationLineInput {
  id: string;
  name: string;
  sku: string;
  category: string;
  unitPrice: number;
  basePrice: number;
  discountPct: number;
  taxRate: number;
}

export default function NewQuotationPage() {
  const auth = useRequireAuth();
  const router = useRouter();
  const toast = useToast();

  const [customerId, setCustomerId] = useState('');
  const [headerDiscount, setHeaderDiscount] = useState<number>(0);
  const [lines, setLines] = useState<BuilderLine[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchProduct, setSearchProduct] = useState('');

  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: api.customers.list });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: api.products.list });

  // Filter products by category and search
  const availableProducts = useMemo(() => {
    const prods = productsQuery.data ?? [];
    return prods.filter((p) => {
      const cat = p.category ?? 'Hardware';
      const matchesCategory = selectedCategory === 'ALL' || cat.toUpperCase() === selectedCategory.toUpperCase();
      const matchesSearch = !searchProduct || p.name.toLowerCase().includes(searchProduct.toLowerCase()) || p.sku.toLowerCase().includes(searchProduct.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [productsQuery.data, selectedCategory, searchProduct]);

  // Selected customer details
  const selectedCustomer = useMemo(() => {
    return (customersQuery.data ?? []).find((c) => c.id === customerId);
  }, [customersQuery.data, customerId]);

  // Live preview query
  const previewPayload = useMemo(() => {
    if (!customerId || lines.length === 0) return null;
    return {
      customerId,
      discountPct: headerDiscount,
      lines: lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
      })),
    };
  }, [customerId, headerDiscount, lines]);

  const previewQuery = useQuery({
    queryKey: ['quotation-preview', previewPayload],
    queryFn: () => (previewPayload ? api.quotations.preview(previewPayload) : null),
    enabled: !!previewPayload,
  });

  const createMutation = useMutation({
    mutationFn: async (submitImmediately: boolean) => {
      if (!customerId) throw new Error('Please select a customer');
      if (lines.length === 0) throw new Error('Please add at least one line item');

      const quote = await api.quotations.create({
        customerId,
        discountPct: headerDiscount,
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discountPct: l.discountPct,
        })),
      });

      if (submitImmediately) {
        await api.quotations.submit(quote.id);
        toast.success(`Quotation ${quote.number} created and submitted for approval!`);
      } else {
        toast.success(`Quotation ${quote.number} saved as draft!`);
      }

      router.push(`/quotations/${quote.id}`);
      return quote;
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to save quotation');
    },
  });

  const handleAddProduct = (product: any) => {
    const basePrice = Number(product.basePrice);
    const existingIndex = lines.findIndex((l) => l.productId === product.id);
    if (existingIndex >= 0) {
      setLines((prev) => {
        const next = [...prev];
        next[existingIndex].qty += 1;
        return next;
      });
    } else {
      const newLine: BuilderLine = {
        id: Math.random().toString(36).substring(2, 9),
        productId: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category ?? 'Hardware',
        basePrice,
        unitPrice: basePrice,
        qty: 1,
        discountPct: 0,
        taxRate: Number(product.taxRate ?? 18),
      };
      setLines((prev) => [...prev, newLine]);
    }
  };

  const handleUpdateLine = (id: string, updates: Partial<BuilderLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const handleRemoveLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const p = previewQuery.data;

  return (
    <AppShell>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/quotations"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition mb-2"
            >
              ← Back to quotations
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">Quotation Builder</h1>
            <p className="text-sm text-slate-500">
              Configure products, adjust line &amp; order pricing, and preview governance approval chains in real time.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => createMutation.mutate(false)}
              disabled={createMutation.isPending || !customerId || lines.length === 0}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              onClick={() => createMutation.mutate(true)}
              disabled={createMutation.isPending || !customerId || lines.length === 0}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 shadow-sm"
            >
              {createMutation.isPending ? 'Processing…' : 'Confirm & Submit for Approval'}
            </button>
          </div>
        </div>

        {createMutation.isError && (
          <div className="rounded-md bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
            {(createMutation.error as any)?.message || 'Failed to create quotation.'}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Deal Editor (Left 2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Customer Selection */}
            <SectionCard title="1. Select Customer Account">
              <div className="grid gap-4 sm:grid-cols-2 items-center">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Customer Organization
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">-- Choose customer --</option>
                    {(customersQuery.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.segment ?? 'STANDARD'})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCustomer && (
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700">{selectedCustomer.name}</span>
                      <Badge kind="info">{selectedCustomer.segment ?? 'STANDARD'}</Badge>
                    </div>
                    <p className="text-slate-500">Contact: {selectedCustomer.contactName ?? '—'} ({selectedCustomer.contactEmail ?? 'No email'})</p>
                    <p className="text-slate-400">Ceiling discounts tailored to {selectedCustomer.segment ?? 'STANDARD'} tier.</p>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Step 2: Line Items */}
            <SectionCard title="2. Commercial Line Items">
              {lines.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center">
                  <p className="text-sm font-medium text-slate-500">No items added yet</p>
                  <p className="text-xs text-slate-400 mt-1">Select products from the catalog panel below to begin building this proposal.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <th className="pb-2">Product / SKU</th>
                        <th className="pb-2 text-center w-24">Qty</th>
                        <th className="pb-2 text-right w-28">Unit Price (₹)</th>
                        <th className="pb-2 text-right w-24">Disc %</th>
                        <th className="pb-2 text-right w-24">GST</th>
                        <th className="pb-2 text-right w-28">Total (₹)</th>
                        <th className="pb-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((line) => {
                        const isUnitPriceDiscounted = line.unitPrice < line.basePrice;
                        const lineTotal = line.unitPrice * line.qty * (1 - line.discountPct / 100);

                        return (
                          <tr key={line.id} className="hover:bg-slate-50">
                            <td className="py-3">
                              <div className="font-medium text-slate-800">{line.name}</div>
                              <div className="text-xs text-slate-400">
                                {line.sku} · <span className="text-brand-600">{line.category}</span>
                              </div>
                            </td>
                            <td className="py-3 text-center">
                              <div className="inline-flex items-center border border-slate-200 rounded-md">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateLine(line.id, { qty: Math.max(1, line.qty - 1) })}
                                  className="px-2 py-1 text-slate-600 hover:bg-slate-100"
                                >
                                  -
                                </button>
                                <span className="px-2 text-xs font-bold tabular-nums">{line.qty}</span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateLine(line.id, { qty: line.qty + 1 })}
                                  className="px-2 py-1 text-slate-600 hover:bg-slate-100"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-3 text-right">
                              <input
                                type="number"
                                min="0"
                                value={line.unitPrice}
                                onChange={(e) => handleUpdateLine(line.id, { unitPrice: Number(e.target.value) })}
                                className={`w-24 rounded border px-2 py-1 text-right text-xs tabular-nums ${
                                  isUnitPriceDiscounted ? 'border-amber-400 bg-amber-50 font-bold' : 'border-slate-300'
                                }`}
                              />
                              {isUnitPriceDiscounted && (
                                <div className="text-[10px] text-amber-600">Base: {inr(line.basePrice)}</div>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={line.discountPct}
                                onChange={(e) => handleUpdateLine(line.id, { discountPct: Number(e.target.value) })}
                                className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-xs tabular-nums"
                              />
                            </td>
                            <td className="py-3 text-right text-xs text-slate-500 tabular-nums">
                              {line.taxRate}%
                            </td>
                            <td className="py-3 text-right font-semibold text-slate-800 tabular-nums">
                              {inr(lineTotal)}
                            </td>
                            <td className="py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(line.id)}
                                className="text-slate-400 hover:text-red-600 text-sm font-bold"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Order-level discount */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-slate-700">Order Header Discount (%)</span>
                  <p className="text-xs text-slate-400">Applies across the entire quotation subtotal.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={headerDiscount}
                    onChange={(e) => setHeaderDiscount(Number(e.target.value))}
                    className="w-20 rounded-md border border-slate-300 px-3 py-1 text-right text-sm font-bold tabular-nums"
                  />
                  <span className="text-sm font-bold text-slate-500">%</span>
                </div>
              </div>
            </SectionCard>

            {/* Step 3: Product Catalog Picker */}
            <SectionCard title="3. Product Catalog Selection">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex gap-2">
                  {['ALL', 'HARDWARE', 'SERVICES', 'SUBSCRIPTIONS'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold ${
                        selectedCategory === cat
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs w-48 shadow-sm"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-72 overflow-y-auto pr-1">
                {availableProducts.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-slate-200 p-3 hover:border-brand-400 hover:shadow-sm transition-all flex flex-col justify-between bg-slate-50/50"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-xs text-slate-800 truncate">{p.name}</span>
                        <span className="text-[10px] text-brand-600 font-mono">{p.sku}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 font-bold">{inr(p.basePrice)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddProduct(p)}
                      className="mt-3 w-full rounded bg-white border border-slate-300 py-1 text-xs font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-300 transition-colors"
                    >
                      + Add to Deal
                    </button>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* Live Commercial & Governance Preview (Right 1 col) */}
          <div className="space-y-6">
            {/* Live Financial Totals */}
            <SectionCard title="Live Commercial Projection">
              {p ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Gross Subtotal</span>
                    <span className="tabular-nums font-medium">{inr(p.subtotal)}</span>
                  </div>
                  {p.discountTotal > 0 && (
                    <div className="flex justify-between text-amber-700 font-medium">
                      <span>Header Discount ({p.discountPct}%)</span>
                      <span className="tabular-nums">- {inr(p.discountTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>Taxes (GST)</span>
                    <span className="tabular-nums font-medium">{inr(p.taxTotal)}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline font-bold text-slate-900 text-lg">
                    <span>Grand Total</span>
                    <span className="tabular-nums text-brand-700">{inr(p.total)}</span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500">Estimated Margin</span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        p.marginPct >= 20
                          ? 'bg-emerald-100 text-emerald-800'
                          : p.marginPct >= 15
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {p.marginPct}% est.
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">
                  Select a customer and add line items to compute commercial totals.
                </p>
              )}
            </SectionCard>

            {/* Live Governance Preview */}
            <SectionCard title="Approval Engine Preview">
              {p?.governance ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">Blended Risk Score</span>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        p.governance.blendedRiskScore <= 5
                          ? 'bg-emerald-100 text-emerald-800'
                          : p.governance.blendedRiskScore <= 30
                            ? 'bg-blue-100 text-blue-800'
                            : p.governance.blendedRiskScore <= 70
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {p.governance.blendedRiskScore} / 100
                    </span>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-600 block mb-1.5">Required Chain</span>
                    {p.governance.chain.length === 0 ? (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 font-medium">
                        ✓ Within Salesperson Authority — Auto-approved upon submission.
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        {p.governance.chain.map((role, idx) => (
                          <span
                            key={role}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700"
                          >
                            <span>#{idx + 1}</span>
                            <span>{role.replaceAll('_', ' ')}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {p.governance.reasons.length > 0 && (
                    <div className="text-xs text-slate-500 space-y-1 bg-slate-50 p-2.5 rounded-md border border-slate-200">
                      <div className="font-semibold text-slate-700">Governance Findings:</div>
                      {p.governance.reasons.map((r, i) => (
                        <div key={i} className="flex items-start gap-1">
                          <span className="text-brand-600">•</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ceiling alerts if any line breached */}
                  {p.governance.lineAssessments.some((a) => a.exceeded || a.unitPriceBypassDetected) && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 space-y-1">
                      <div className="font-bold">Discount Ceiling Policy Violations:</div>
                      {p.governance.lineAssessments
                        .filter((a) => a.exceeded || a.unitPriceBypassDetected)
                        .map((a, i) => (
                          <div key={i}>
                            {a.category}: {a.effectiveDiscountPct}% effective discount (ceiling is {a.ceilingDiscountPct}% for {selectedCustomer?.segment ?? 'STANDARD'}).
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">
                  Configure line items to preview authorization path.
                </p>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
