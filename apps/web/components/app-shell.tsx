import Link from 'next/link';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/quotations', label: 'Quotations' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/fulfillment', label: 'Fulfillment' },
  { href: '/subscriptions', label: 'Subscriptions' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/deal-health', label: 'Deal Health' },
  { href: '/products', label: 'Products' },
  { href: '/reports', label: 'Reports' },
  { href: '/admin', label: 'Admin' },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
        <div className="px-5 py-4 text-lg font-bold text-brand-700">DealFlow360</div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="text-sm text-slate-500">B2B Sales &amp; Order Management</div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
