'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { useToast } from '@/components/toast';
import { api, type ProductItem } from '@/lib/api';
import { inr } from '@/lib/format';
import { usePermissions, useRequireAuth } from '@/lib/use-auth';

const currency = (n: string | number) => inr(n, true);

const empty = { sku: '', name: '', category: '', type: 'ONE_TIME', basePrice: 0, taxRate: 18 };

export default function ProductsPage() {
  const auth = useRequireAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const products = useQuery({ queryKey: ['products'], queryFn: api.products.list });
  const [form, setForm] = useState({ ...empty });
  const { can } = usePermissions();
  const isAdmin = can('SYSTEM_CONFIG_MANAGE');
  const isCustomer = auth.data?.role === 'CUSTOMER';

  // Customer order builder state
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderNotes, setOrderNotes] = useState<string>('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['products'] });

  const create = useMutation({
    mutationFn: () => api.products.create({ ...form, basePrice: Number(form.basePrice), taxRate: Number(form.taxRate) }),
    onSuccess: async () => {
      setForm({ ...empty });
      await invalidate();
      toast.success('Product created successfully');
    },
  });

  const toggle = useMutation({
    mutationFn: (p: { id: string; active: boolean }) => api.products.update(p.id, { active: !p.active }),
    onSuccess: () => {
      invalidate();
      toast.info('Product status updated');
    },
  });

  const customerOrderMutation = useMutation({
    mutationFn: (input: { lines: { productId: string; qty: number }[]; notes?: string }) =>
      api.quotations.createCustomerOrder(input),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      qc.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      toast.success(`Order request ${res.quotation.number} placed successfully!`);
      setCart({});
      setOrderNotes('');
      // Navigate customer directly to digital proposal review & sign portal
      router.push(res.portalUrl);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to submit order request');
    },
  });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const allProducts = products.data ?? [];

  // Filter products for customer
  const filteredProducts = allProducts.filter((p) => {
    if (isCustomer && !p.active) return false;
    const matchesCategory = selectedCategory === 'ALL' || (p.category ?? 'Other').toUpperCase() === selectedCategory.toUpperCase();
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories = Array.from(new Set(allProducts.map((p) => p.category ?? 'Other')));

  // Cart operations
  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[productId] ?? 0;
      const next = current + delta;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const setCartItem = (productId: string, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: qty };
    });
  };

  // Cart calculations
  const cartLines = Object.entries(cart)
    .map(([productId, qty]) => {
      const product = allProducts.find((p) => p.id === productId);
      if (!product) return null;
      const basePrice = Number(product.basePrice);
      const taxRate = Number(product.taxRate ?? 0);
      const gross = basePrice * qty;
      const tax = gross * (taxRate / 100);
      return { product, qty, basePrice, taxRate, gross, tax, total: gross + tax };
    })
    .filter(Boolean) as { product: ProductItem; qty: number; basePrice: number; taxRate: number; gross: number; tax: number; total: number }[];

  const cartSubtotal = cartLines.reduce((acc, l) => acc + l.gross, 0);
  const cartTax = cartLines.reduce((acc, l) => acc + l.tax, 0);
  const cartTotal = cartSubtotal + cartTax;
  const cartCount = cartLines.reduce((acc, l) => acc + l.qty, 0);

  const handleSubmitCustomerOrder = () => {
    if (cartLines.length === 0) return;
    const lines = cartLines.map((l) => ({ productId: l.product.id, qty: l.qty }));
    customerOrderMutation.mutate({ lines, notes: orderNotes.trim() || undefined });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition mb-3"
          >
            ← Back to Dashboard
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {isCustomer ? 'Order Products & Services' : 'Product Catalog'}
              </h1>
              <p className="text-sm text-slate-500">
                {isCustomer
                  ? 'Select products, configure quantities, and submit a self-service order request to your account manager.'
                  : 'Sellable products and services referenced across deals.'}
              </p>
            </div>
            {isCustomer && cartCount > 0 && (
              <div className="rounded-lg bg-brand-50 border border-brand-200 px-4 py-2 text-right">
                <span className="text-xs text-brand-700 font-medium">{cartCount} items selected</span>
                <div className="text-base font-bold text-brand-900">{currency(cartTotal)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Customer Self-Service Ordering Interface */}
        {isCustomer ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Products Selection List (Left Column) */}
            <div className="space-y-4 lg:col-span-2">
              {/* Filter Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                      selectedCategory === 'ALL'
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Categories
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
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
                  placeholder="Search products or SKU…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 min-w-[200px]"
                />
              </div>

              {/* Product Cards Grid */}
              {products.isLoading && <EmptyState message="Loading catalog…" />}
              {filteredProducts.length === 0 ? (
                <EmptyState message="No matching products found." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {filteredProducts.map((p) => {
                    const inCartQty = cart[p.id] ?? 0;
                    return (
                      <div
                        key={p.id}
                        className={`flex flex-col justify-between rounded-xl border p-4 shadow-sm transition bg-white ${
                          inCartQty > 0 ? 'border-brand-300 ring-1 ring-brand-400' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-mono font-medium text-slate-400">{p.sku}</span>
                            <Badge kind="info">{p.category ?? 'Standard'}</Badge>
                          </div>
                          <h3 className="mt-1 text-base font-semibold text-slate-900">{p.name}</h3>
                          {p.description && (
                            <p className="mt-1 text-xs text-slate-500 line-clamp-2">{p.description}</p>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <div>
                            <span className="text-xs text-slate-400 block">{p.type.replaceAll('_', ' ')}</span>
                            <span className="text-base font-bold text-slate-900 tabular-nums">
                              {currency(p.basePrice)}
                            </span>
                            <span className="text-[11px] text-slate-500 block">+{p.taxRate}% GST</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {inCartQty > 0 ? (
                              <div className="flex items-center rounded-lg border border-brand-300 bg-brand-50 p-1">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(p.id, -1)}
                                  className="flex h-7 w-7 items-center justify-center rounded bg-white text-sm font-bold text-brand-700 shadow-sm hover:bg-brand-100"
                                >
                                  -
                                </button>
                                <span className="w-8 text-center text-xs font-bold text-brand-900 tabular-nums">
                                  {inCartQty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(p.id, 1)}
                                  className="flex h-7 w-7 items-center justify-center rounded bg-white text-sm font-bold text-brand-700 shadow-sm hover:bg-brand-100"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => updateQuantity(p.id, 1)}
                                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
                              >
                                + Add to Order
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Order Request Summary Drawer (Right Column) */}
            <div className="space-y-4">
              <SectionCard title="Order Request Summary">
                {cartLines.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">
                    <p className="text-2xl mb-2">🛒</p>
                    <p>No products selected yet.</p>
                    <p className="text-xs mt-1">Select items from the catalog to build your order request.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
                      {cartLines.map((l) => (
                        <li key={l.product.id} className="py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-900 truncate">{l.product.name}</p>
                              <p className="text-[11px] text-slate-400">
                                {currency(l.basePrice)} × {l.qty}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-slate-900 tabular-nums">
                                {currency(l.gross)}
                              </p>
                              <button
                                type="button"
                                onClick={() => setCartItem(l.product.id, 0)}
                                className="text-[10px] text-rose-600 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div className="space-y-1.5 border-t border-slate-200 pt-3 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Items Subtotal</span>
                        <span className="font-semibold tabular-nums">{currency(cartSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Estimated GST Taxes</span>
                        <span className="font-semibold tabular-nums">{currency(cartTax)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                        <span>Estimated Total</span>
                        <span className="text-brand-700 tabular-nums">{currency(cartTotal)}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Purchase Order / Delivery Notes (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="e.g., Deliver to Main Facility, PO #99482..."
                        className="w-full rounded-md border border-slate-300 p-2 text-xs outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSubmitCustomerOrder}
                      disabled={customerOrderMutation.isPending || cartLines.length === 0}
                      className="w-full rounded-lg bg-brand-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition"
                    >
                      {customerOrderMutation.isPending ? 'Submitting Order Request…' : 'Submit Order Request →'}
                    </button>
                    <p className="text-center text-[11px] text-slate-400">
                      Creates proposal, assigns your sales rep &amp; opens instant review &amp; sign portal.
                    </p>
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        ) : (
          /* Staff & Admin Catalog View */
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SectionCard title="Products">
                {products.isLoading && <EmptyState message="Loading…" />}
                {products.data && allProducts.length === 0 && <EmptyState message="No products yet." />}
                {allProducts.length > 0 && (
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
                        {allProducts.map((p) => (
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
                  <p className="text-sm text-slate-500">Only administrators can add new products.</p>
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
                      <span className="mb-1 block font-medium text-slate-600">GST %</span>
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
        )}
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
