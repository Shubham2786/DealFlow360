import type { ReactNode } from 'react';

/** KPI tile for dashboards. */
export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warning' | 'critical' | 'success';
}) {
  const toneRing =
    tone === 'critical'
      ? 'border-red-200'
      : tone === 'warning'
        ? 'border-amber-200'
        : tone === 'success'
          ? 'border-green-200'
          : 'border-slate-200';
  return (
    <div className={`rounded-lg border ${toneRing} bg-white p-4`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700',
  WARNING: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
  success: 'bg-green-100 text-green-700',
};

export function Badge({ children, kind = 'info' }: { children: ReactNode; kind?: string }) {
  const cls = SEVERITY_STYLES[kind] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">{message}</p>;
}

const STATUS_KIND: Record<string, string> = {
  DRAFT: 'info',
  SUBMITTED: 'info',
  PENDING_APPROVAL: 'warning',
  CHANGES_REQUESTED: 'warning',
  NEGOTIATION: 'warning',
  APPROVED: 'success',
  REJECTED: 'critical',
  CONVERTED_TO_FULFILLMENT: 'info',
  FULFILLING: 'info',
  PARTIALLY_FULFILLED: 'warning',
  FULFILLED: 'success',
  BILLING: 'info',
  INVOICED: 'info',
  PAID: 'success',
  COMPLETED: 'success',
  CANCELLED: 'critical',
};

export function DealStatusBadge({ status }: { status: string }) {
  return <Badge kind={STATUS_KIND[status] ?? 'info'}>{status.replaceAll('_', ' ')}</Badge>;
}

interface LifecycleStage {
  id: string;
  label: string;
  statuses: string[];
}

const LIFECYCLE_STAGES: LifecycleStage[] = [
  { id: 'draft', label: 'Draft', statuses: ['DRAFT'] },
  { id: 'approval', label: 'Approval', statuses: ['SUBMITTED', 'PENDING_APPROVAL'] },
  { id: 'approved', label: 'Approved', statuses: ['APPROVED'] },
  { id: 'fulfillment', label: 'Fulfillment', statuses: ['CONVERTED_TO_FULFILLMENT', 'FULFILLING', 'PARTIALLY_FULFILLED', 'FULFILLED'] },
  { id: 'invoiced', label: 'Invoiced', statuses: ['BILLING', 'INVOICED'] },
  { id: 'paid', label: 'Paid', statuses: ['PAID'] },
  { id: 'completed', label: 'Completed', statuses: ['COMPLETED'] },
];

export function LifecycleStepper({ status }: { status: string }) {
  const currentStageIndex = LIFECYCLE_STAGES.findIndex((stage) => stage.statuses.includes(status));
  const isBranch = ['NEGOTIATION', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED'].includes(status);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {LIFECYCLE_STAGES.map((stage, i) => {
        const isDone = currentStageIndex >= 0 && i < currentStageIndex;
        const isCurrent = currentStageIndex >= 0 && i === currentStageIndex;
        return (
          <span
            key={stage.id}
            className={`rounded px-2.5 py-1 text-xs font-semibold tracking-wide transition-colors ${
              isCurrent
                ? 'bg-brand-600 text-white shadow-sm'
                : isDone
                  ? 'bg-brand-100 text-brand-800'
                  : 'bg-slate-100 text-slate-400'
            }`}
          >
            {stage.label}
          </span>
        );
      })}

      {status === 'NEGOTIATION' && (
        <span className="rounded bg-amber-100 border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-800 animate-pulse">
          🤝 Customer Negotiation
        </span>
      )}
      {status === 'CHANGES_REQUESTED' && (
        <span className="rounded bg-amber-100 border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-800">
          ⚠️ Changes Requested
        </span>
      )}
      {status === 'REJECTED' && (
        <span className="rounded bg-rose-100 border border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-800">
          ✕ Rejected
        </span>
      )}
      {status === 'CANCELLED' && (
        <span className="rounded bg-slate-200 border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 line-through">
          Cancelled
        </span>
      )}
    </div>
  );
}
