'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.auth.login(email, password),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.replace('/dashboard');
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
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
          className="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {mutation.isPending ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="border-t border-slate-200 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Quick Demo Logins (password: password123)
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => { setEmail('admin@dealflow.test'); setPassword('password123'); }}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700"
            >
              👑 Admin
            </button>
            <button
              type="button"
              onClick={() => { setEmail('morgan@dealflow.test'); setPassword('password123'); }}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700"
            >
              💼 Manager
            </button>
            <button
              type="button"
              onClick={() => { setEmail('fiona@dealflow.test'); setPassword('password123'); }}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700"
            >
              📊 Finance
            </button>
            <button
              type="button"
              onClick={() => { setEmail('sam@dealflow.test'); setPassword('password123'); }}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700"
            >
              🎯 Sales (User)
            </button>
            <button
              type="button"
              onClick={() => { setEmail('rita@acme.test'); setPassword('password123'); }}
              className="col-span-2 rounded border border-brand-200 bg-brand-50/50 px-2 py-1.5 text-left font-medium text-brand-800 hover:bg-brand-100"
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
