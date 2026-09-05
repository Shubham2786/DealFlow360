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
