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
  permissions: string[];
  status: string;
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

  products: {
    list: () => apiFetch<ProductItem[]>('/products'),
    get: (id: string) => apiFetch<ProductItem>(`/products/${id}`),
    create: (input: Record<string, unknown>) =>
      apiFetch<ProductItem>('/products', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: Record<string, unknown>) =>
      apiFetch<ProductItem>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  },

  fulfillment: {
    list: () => apiFetch<FulfillmentItem[]>('/fulfillment'),
    get: (id: string) => apiFetch<FulfillmentItem>(`/fulfillment/${id}`),
    fromQuotation: (quotationId: string) =>
      apiFetch<FulfillmentItem>(`/fulfillment/from-quotation/${quotationId}`, { method: 'POST' }),
    allocate: (id: string) => apiFetch<FulfillmentItem>(`/fulfillment/${id}/allocate`, { method: 'POST' }),
    fulfill: (id: string) => apiFetch<FulfillmentItem>(`/fulfillment/${id}/fulfill`, { method: 'POST' }),
  },

  invoices: {
    list: () => apiFetch<InvoiceItem[]>('/invoices'),
    get: (id: string) => apiFetch<InvoiceItem>(`/invoices/${id}`),
    generateFromQuotation: (quotationId: string) =>
      apiFetch<InvoiceItem>(`/invoices/from-quotation/${quotationId}`, { method: 'POST' }),
    pay: (id: string, amount: number, method?: string, reference?: string) =>
      apiFetch<InvoiceItem>(`/invoices/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount, method, reference }),
      }),
    cancel: (id: string) => apiFetch<InvoiceItem>(`/invoices/${id}/cancel`, { method: 'POST' }),
  },

  customers: {
    list: () => apiFetch<CustomerItem[]>('/customers'),
    create: (input: Record<string, unknown>) =>
      apiFetch<CustomerItem>('/customers', { method: 'POST', body: JSON.stringify(input) }),
  },

  admin: {
    users: () => apiFetch<AdminUserItem[]>('/users'),
    roles: () => apiFetch<{ id: string; name: string; description: string | null }[]>('/roles'),
    assignRole: (userId: string, role: string) =>
      apiFetch<AdminUserItem>(`/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  },

  inventory: {
    list: () => apiFetch<InventoryItem[]>('/inventory'),
    warehouses: () => apiFetch<{ id: string; code: string; name: string; priority: number }[]>('/warehouses'),
    receive: (input: { warehouseId: string; productId: string; quantity: number; reference: string }) =>
      apiFetch('/inventory/receive', { method: 'POST', body: JSON.stringify(input) }),
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

export interface InvoiceItem {
  id: string;
  number: string;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  paymentTerms: string;
  subtotal: string;
  gstTotal: string;
  total: string;
  paidAmount: string;
  customer?: { id: string; name: string } | null;
  quotation?: { id: string; number: string } | null;
  lines?: { id: string; description: string; qty: number; unitPrice: string; gstRate: string; lineTotal: string }[];
  payments?: { id: string; amount: string; method: string; reference: string | null; receivedAt: string }[];
}

export interface CustomerItem {
  id: string;
  name: string;
  segment: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  active: boolean;
}

export interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface ProductItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  type: string;
  basePrice: string;
  currency: string;
  uom: string;
  taxRate: string;
  active: boolean;
}

export interface FulfillmentLineItem {
  id: string;
  productId: string;
  orderedQty: number;
  allocatedQty: number;
  fulfilledQty: number;
  backorderedQty: number;
  status: string;
  product?: { id: string; sku: string; name: string };
  allocations?: { id: string; quantity: number; source: string; warehouse: { code: string } }[];
  backorders?: { id: string; remainingQty: number; status: string }[];
}

export interface FulfillmentItem {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  customer?: { id: string; name: string } | null;
  quotation?: { id: string; number: string; status?: string } | null;
  lines: FulfillmentLineItem[];
}

export interface InventoryItem {
  id: string;
  onHand: number;
  reserved: number;
  product: { id: string; sku: string; name: string };
  warehouse: { id: string; code: string; name: string };
}

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
