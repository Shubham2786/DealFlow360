'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { useCurrentUser, usePermissions } from '@/lib/use-auth';

// perm/anyOf undefined means visible to any authenticated user.
const NAV: { href: string; label: string; perm?: string; anyOf?: string[] }[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/quotations', label: 'Quotations' },
  { href: '/approvals', label: 'Approvals', perm: 'DEAL_APPROVE' },
  { href: '/fulfillment', label: 'Fulfillment', perm: 'TASK_ALLOCATE' },
  { href: '/inventory', label: 'Inventory', perm: 'TASK_ALLOCATE' },
  { href: '/invoices', label: 'Invoices', perm: 'FINANCE_DATA_VIEW' },
  { href: '/subscriptions', label: 'Subscriptions' },
  { href: '/deal-health', label: 'Deal Health' },
  { href: '/reports', label: 'Reports', anyOf: ['TEAM_VIEW', 'FINANCE_REPORT_GENERATE'] },
  { href: '/customers', label: 'Customers' },
  { href: '/products', label: 'Products' },
  { href: '/admin/users', label: 'Users', perm: 'USER_MANAGE' },
  { href: '/admin/config', label: 'Configuration', perm: 'USER_MANAGE' },
];

const CUSTOMER_NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/products', label: 'Order Products' },
  { href: '/quotations', label: 'My Proposals' },
  { href: '/invoices', label: 'My Invoices' },
  { href: '/subscriptions', label: 'My Subscriptions' },
];

function initials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

import { ToastProvider } from '@/components/toast';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useCurrentUser();
  const { can } = usePermissions();
  const isCustomer = me.data?.role === 'CUSTOMER';
  const nav = isCustomer
    ? CUSTOMER_NAV
    : NAV.filter(
      (item) =>
        (!item.perm || can(item.perm)) && (!item.anyOf || item.anyOf.some((p) => can(p))),
    );

  const logout = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: async () => {
      qc.clear();
      router.replace('/auth/login');
    },
  });

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-4 text-lg font-bold text-brand-700">DealFlow360</div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'rounded-md bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700'
                    : 'rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3 text-xs text-slate-400">
          B2B Sales &amp; Order Management
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="text-sm text-slate-500">Order Management · India (₹ INR, GST)</div>
          <div className="flex items-center gap-3">
            {me.data && (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {initials(me.data.name)}
                </div>
                <div className="hidden text-right sm:block">
                  <div className="text-sm font-medium text-slate-700">{me.data.name}</div>
                  <div className="text-xs text-slate-400">{me.data.role.replaceAll('_', ' ')}</div>
                </div>
              </div>
            )}
            <button
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {logout.isPending ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
    </ToastProvider>
  );
}
