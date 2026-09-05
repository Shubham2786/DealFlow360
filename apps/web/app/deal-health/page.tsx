'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard, StatTile } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-auth';

export default function DealHealthPage() {
  const auth = useRequireAuth();
  const health = useQuery({ queryKey: ['deal-health'], queryFn: api.dealHealth });

  if (auth.isLoading || auth.data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }

  const s = health.data?.summary;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Deal Health &amp; Anomalies</h1>
          <p className="text-sm text-slate-500">
            Cross-cutting analysis derived from live deal, approval, and invoice data.
          </p>
        </div>

        {health.isLoading && <EmptyState message="Analyzing deals…" />}
        {health.isError && (
          <p className="text-sm text-red-600">Could not load deal health. Is the API running?</p>
        )}

        {s && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatTile label="Total Deals" value={s.totalDeals} />
              <StatTile label="Healthy" value={s.HEALTHY} tone="success" />
              <StatTile label="Warning" value={s.WARNING} tone="warning" />
              <StatTile label="Critical" value={s.CRITICAL} tone="critical" />
            </div>

            <SectionCard title={`Detected Anomalies (${health.data!.anomalies.length})`}>
              {health.data!.anomalies.length === 0 ? (
                <EmptyState message="No anomalies detected. All deals are healthy." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Deal</th>
                        <th className="py-2 pr-3">Customer</th>
                        <th className="py-2 pr-3">Anomaly</th>
                        <th className="py-2 pr-3">Severity</th>
                        <th className="py-2 pr-3">Explanation</th>
                        <th className="py-2 pr-3">Recommended</th>
                        <th className="py-2 pr-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.data!.anomalies.map((a, i) => (
                        <tr key={i} className="border-b border-slate-100 align-top">
                          <td className="py-2 pr-3 font-medium text-slate-800">{a.dealRef}</td>
                          <td className="py-2 pr-3 text-slate-600">{a.customer}</td>
                          <td className="py-2 pr-3 text-slate-700">{a.type.replaceAll('_', ' ')}</td>
                          <td className="py-2 pr-3">
                            <Badge kind={a.severity}>{a.severity}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-slate-600">{a.explanation}</td>
                          <td className="py-2 pr-3 text-slate-500">{a.recommendedAction}</td>
                          <td className="py-2 pr-3">
                            <Link href={a.drilldown} className="text-brand-600 hover:underline">
                              Open →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </AppShell>
  );
}
