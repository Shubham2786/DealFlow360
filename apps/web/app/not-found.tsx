import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm max-w-md w-full">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-4 font-bold text-lg">
          404
        </div>
        <h1 className="text-xl font-bold text-slate-900">Page Not Found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you are looking for doesn’t exist or may have been moved.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/dashboard"
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
