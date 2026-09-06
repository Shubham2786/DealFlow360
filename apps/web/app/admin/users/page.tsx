'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, EmptyState, SectionCard } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { usePermissions, useRequireAuth } from '@/lib/use-auth';

const ROLE_KIND: Record<string, string> = {
  ADMIN: 'critical',
  FINANCE: 'warning',
  MANAGER: 'info',
  USER: 'success',
};

export default function AdminUsersPage() {
  const auth = useRequireAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['admin-users'], queryFn: api.admin.users, enabled: can('USER_MANAGE') });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: api.admin.roles, enabled: can('USER_MANAGE') });

  const assign = useMutation({
    mutationFn: (v: { id: string; role: string }) => api.admin.assignRole(v.id, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  if (auth.isLoading || auth.data === null) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!can('USER_MANAGE')) {
    return (
      <AppShell>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You don’t have permission to manage users. (Requires an administrator.)
        </div>
      </AppShell>
    );
  }

  const rows = users.data ?? [];
  const roleNames = (roles.data ?? []).map((r) => r.name);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Link
              href="/admin/config"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg px-3 py-1.5 transition"
            >
              ← Back to Configuration
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-1.5 transition"
            >
              Dashboard
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500">Assign roles. Changing a role signs the user out of existing sessions.</p>
        </div>

        <SectionCard title="Users">
          {users.isLoading && <EmptyState message="Loading…" />}
          {users.data && rows.length === 0 && <EmptyState message="No users." />}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Joined</th>
                    <th className="py-2 pr-3">Assign role</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium">{u.name}</td>
                      <td className="py-2 pr-3 text-slate-600">{u.email}</td>
                      <td className="py-2 pr-3"><Badge kind={ROLE_KIND[u.role] ?? 'info'}>{u.role}</Badge></td>
                      <td className="py-2 pr-3 text-slate-500">{formatDate(u.createdAt)}</td>
                      <td className="py-2 pr-3">
                        <select
                          defaultValue={u.role}
                          disabled={assign.isPending}
                          onChange={(e) => {
                            if (e.target.value !== u.role && confirm(`Change ${u.name} to ${e.target.value}?`)) {
                              assign.mutate({ id: u.id, role: e.target.value });
                            }
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                        >
                          {roleNames.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {assign.isError && <p className="mt-2 text-sm text-red-600">{(assign.error as Error).message}</p>}
        </SectionCard>
      </div>
    </AppShell>
  );
}
