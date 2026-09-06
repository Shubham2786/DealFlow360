'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api, ApiError, type CurrentUser } from './api';

/** Fetches the current user; used by pages/components to react to auth state. */
export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.auth.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * Returns a permission checker for the current user (UX gating only — the backend is the
 * real authority). ADMIN implicitly passes every check.
 */
export function usePermissions() {
  const { data } = useCurrentUser();
  const role = data?.role;
  const perms = new Set(data?.permissions ?? []);
  const can = (permission: string) => role === 'ADMIN' || perms.has(permission);
  return { role, can, permissions: perms };
}

/** Client-side guard: redirects to login when unauthenticated. */
export function useRequireAuth() {
  const router = useRouter();
  const query = useCurrentUser();

  useEffect(() => {
    if (!query.isLoading && !query.isFetching && query.data === null) {
      router.replace('/auth/login');
    }
  }, [query.isLoading, query.isFetching, query.data, router]);

  return query;
}
