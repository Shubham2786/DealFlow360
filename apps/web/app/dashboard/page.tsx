'use client';

import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/app-shell';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sales Dashboard</h1>
          <p className="text-sm text-slate-500">
            Operational overview. Modules are added incrementally.
          </p>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            API Connectivity
          </h2>
          {health.isLoading && <p className="text-sm text-slate-400">Checking API…</p>}
          {health.isError && (
            <p className="text-sm text-red-600">
              API unreachable. Start it with <code>pnpm dev:api</code>.
            </p>
          )}
          {health.data && (
            <div className="flex items-center gap-3 text-sm">
              <span
                className={
                  health.data.status === 'ok'
                    ? 'inline-flex rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700'
                    : 'inline-flex rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700'
                }
              >
                {health.data.status}
              </span>
              <span className="text-slate-500">database: {health.data.db}</span>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
