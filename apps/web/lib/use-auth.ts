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
  });
}

/** Client-side guard: redirects to login when unauthenticated. */
export function useRequireAuth() {
  const router = useRouter();
  const query = useCurrentUser();

  useEffect(() => {
    if (!query.isLoading && query.data === null) {
      router.replace('/auth/login');
    }
  }, [query.isLoading, query.data, router]);

  return query;
}
