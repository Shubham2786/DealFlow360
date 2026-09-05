// Minimal typed fetch client for the DealFlow360 API.
// Sends cookies (credentials) for JWT session auth.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = Array.isArray(body?.message) ? body.message.join(', ') : (body?.message ?? message);
    } catch {
      /* ignore parse errors */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface HealthResponse {
  status: string;
  db: string;
  timestamp: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export interface DashboardMetrics {
  kpis: {
    activeDeals: number;
    draftQuotations: number;
    pendingApprovals: number;
    approvedDeals: number;
    awaitingFulfillment: number;
    outstandingInvoices: number;
    overdueInvoices: number;
    totalCustomers: number;
    totalProducts: number;
    revenue: number;
    pipelineValue: number;
  };
  alerts: { severity: string; label: string; href: string }[];
  recentActivity: { id: string; action: string; message: string | null; actor: string | null; at: string }[];
  generatedAt: string;
}

export interface DealHealthOverview {
  summary: { totalDeals: number; HEALTHY: number; WARNING: number; CRITICAL: number };
  anomalies: {
    dealId: string;
    dealRef: string;
    customer: string;
    type: string;
    severity: 'WARNING' | 'CRITICAL';
    detectedAt: string;
    explanation: string;
    recommendedAction: string;
    drilldown: string;
  }[];
  generatedAt: string;
}

export const api = {
  health: () => apiFetch<HealthResponse>('/health'),

  dashboard: {
    metrics: () => apiFetch<DashboardMetrics>('/dashboard/metrics'),
  },
  dealHealth: () => apiFetch<DealHealthOverview>('/deal-health'),

  auth: {
    login: (email: string, password: string) =>
      apiFetch<{ ok: boolean }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    signup: (input: { email: string; password: string; name: string; role?: string }) =>
      apiFetch<{ ok: boolean }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    logout: () => apiFetch<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    me: () => apiFetch<CurrentUser>('/auth/me'),
  },

  quotations: {
    list: () => apiFetch<QuotationListItem[]>('/quotations'),
    get: (id: string) => apiFetch<QuotationDetail>(`/quotations/${id}`),
    submit: (id: string) => apiFetch(`/quotations/${id}/submit`, { method: 'POST' }),
    cancel: (id: string) => apiFetch(`/quotations/${id}/cancel`, { method: 'POST' }),
    revise: (id: string) => apiFetch(`/quotations/${id}/revise`, { method: 'POST' }),
  },

  approvals: {
    list: (status?: string) =>
      apiFetch<ApprovalRequestItem[]>(`/approvals${status ? `?status=${status}` : ''}`),
    get: (id: string) => apiFetch<ApprovalRequestItem>(`/approvals/${id}`),
    approve: (id: string, comment?: string) =>
      apiFetch(`/approvals/${id}/approve`, { method: 'POST', body: JSON.stringify({ comment }) }),
    reject: (id: string, comment?: string) =>
      apiFetch(`/approvals/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) }),
    requestChanges: (id: string, comment?: string) =>
      apiFetch(`/approvals/${id}/request-changes`, { method: 'POST', body: JSON.stringify({ comment }) }),
  },
};

export interface ApprovalStepItem {
  id: string;
  level: number;
  role: string;
  status: string;
  comment: string | null;
  decidedAt: string | null;
  approver: { id: string; name: string } | null;
}

export interface ApprovalRequestItem {
  id: string;
  status: string;
  reason: string | null;
  createdAt: string;
  quotation: {
    id: string;
    number: string;
    total: string;
    discountPct: string;
    marginPct: string;
    status: string;
    customer: { id: string; name: string } | null;
  };
  steps: ApprovalStepItem[];
}

export interface QuotationListItem {
  id: string;
  number: string;
  status: string;
  total: string;
  discountPct: string;
  marginPct: string;
  createdAt: string;
  expiresAt: string | null;
  customer: { id: string; name: string } | null;
  salesperson: { id: string; name: string } | null;
}

export interface QuotationDetail extends QuotationListItem {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  customer: { id: string; name: string; segment: string; contactName: string | null; contactEmail: string | null } | null;
  lines: {
    id: string;
    qty: number;
    unitPrice: string;
    discountPct: string;
    taxRate: string;
    lineTotal: string;
    product: { id: string; sku: string; name: string };
  }[];
  invoices: { id: string; number: string; status: string; total: string }[];
}
