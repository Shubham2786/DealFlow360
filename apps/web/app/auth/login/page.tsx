'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/lib/use-auth';

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: currentUser, isLoading: authLoading } = useCurrentUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (!authLoading && currentUser) {
      window.location.href = '/dashboard';
    }
  }, [currentUser, authLoading]);

  const mutation = useMutation({
    mutationFn: async (credentials?: { email?: string; password?: string }) => {
      const loginEmail = (credentials?.email ?? email).trim();
      const loginPassword = credentials?.password ?? password;
      const res = await api.auth.login(loginEmail, loginPassword);
      if (res?.user) return res.user;
      return await api.auth.me();
    },
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      window.location.href = '/dashboard';
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!email || !password || mutation.isPending) return;
    mutation.mutate({ email, password });
  };

  const handleQuickLogin = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('password123');
    mutation.mutate({ email: demoEmail, password: 'password123' });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        action="javascript:void(0);"
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-bold text-brand-700">DealFlow360</h1>
          <p className="text-sm text-slate-500">Sign in to your account</p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
          />
        </label>

        {mutation.isError && (
          <p className="text-sm text-red-600">{(mutation.error as Error).message}</p>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60 transition"
        >
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="border-t border-slate-200 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Quick Demo Logins (1-Click Sign-in)
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => handleQuickLogin('admin@dealflow.test')}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700 transition disabled:opacity-50"
            >
              👑 Admin
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => handleQuickLogin('morgan@dealflow.test')}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700 transition disabled:opacity-50"
            >
              💼 Manager
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => handleQuickLogin('fiona@dealflow.test')}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700 transition disabled:opacity-50"
            >
              📊 Finance
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => handleQuickLogin('sam@dealflow.test')}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700 transition disabled:opacity-50"
            >
              🎯 Sales (User)
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => handleQuickLogin('rita@acme.test')}
              className="col-span-2 rounded border border-brand-200 bg-brand-50/50 px-2 py-1.5 text-left font-medium text-brand-800 hover:bg-brand-100 transition disabled:opacity-50"
            >
              🏢 Customer (Rita @ Acme Corp)
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-slate-500">
          No account?{' '}
          <Link href="/auth/signup" className="font-medium text-brand-600 hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
