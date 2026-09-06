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
  variant: string; // USER | MANAGER | FINANCE | ADMIN | CUSTOMER
  kpis: Partial<{
    activeDeals: number;
    draftQuotations: number;
    pendingApprovals: number;
    approvedDeals: number;
    awaitingFulfillment: number;
    outstandingInvoices: number;
    overdueInvoices: number;
    totalCustomers: number;
    totalProducts: number;
    totalUsers: number;
    revenue: number;
    pipelineValue: number;
    activeProposals: number;
    activeSubscriptions: number;
  }>;
  customer?: {
    id: string;
    name: string;
    segment: string;
    contactName: string | null;
    contactEmail: string | null;
    accountManager: { name: string; email: string } | null;
    proposals: {
      id: string;
      number: string;
      total: number;
      status: string;
      validUntil: string | null;
      token?: string;
    }[];
    invoices: {
      id: string;
      number: string;
      total: number;
      paidAmount: number;
      status: string;
      dueDate: string | null;
    }[];
    subscriptions: {
      id: string;
      number: string;
      amount: number;
      frequency: string;
      status: string;
      nextBillingDate: string | null;
    }[];
  } | null;
  alerts: { severity: string; label: string; href: string }[];
  recentActivity: { id: string; action: string; message: string | null; actor: string | null; at: string }[];
  generatedAt: string;
}

export interface ReportData {
  revenue: { collected: number; outstanding: number; overdueAmount: number; overdueCount: number };
  pipeline: { value: number; activeDeals: number };
  deals: { total: number; completed: number; cancelled: number; conversionRate: number; byStatus: { status: string; count: number }[] };
  approvals: { pending: number; avgTurnaroundDays: number };
  fulfillment: { openBackorders: number };
  discounts: { avgDiscountPct: number };
  topCustomers: { customer: string; total: number }[];
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
  reports: () => apiFetch<ReportData>('/reports'),

  auth: {
    login: (email: string, password: string) =>
      apiFetch<{ ok: boolean; user?: CurrentUser }>('/auth/login', {
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
    create: (input: CreateQuotationPayload) =>
      apiFetch<QuotationDetail>('/quotations', { method: 'POST', body: JSON.stringify(input) }),
    preview: (input: CreateQuotationPayload) =>
      apiFetch<QuotationPreview>('/quotations/preview', { method: 'POST', body: JSON.stringify(input) }),
    submit: (id: string) => apiFetch(`/quotations/${id}/submit`, { method: 'POST' }),
    cancel: (id: string) => apiFetch(`/quotations/${id}/cancel`, { method: 'POST' }),
    revise: (id: string) => apiFetch(`/quotations/${id}/revise`, { method: 'POST' }),
    applyCounterDiscount: (id: string, discountPct: number, message?: string) =>
      apiFetch(`/quotations/${id}/apply-counter-discount`, {
        method: 'POST',
        body: JSON.stringify({ discountPct, message }),
      }),
    replyNegotiation: (id: string, message: string) =>
      apiFetch(`/quotations/${id}/negotiation/reply`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    createCustomerOrder: (input: { lines: { productId: string; qty: number }[]; notes?: string }) =>
      apiFetch<{ quotation: QuotationDetail; token: string; portalUrl: string }>('/quotations/customer-order', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
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

  negotiation: {
    sendToCustomer: (quotationId: string) =>
      apiFetch<{ token: string; expiresAt: string }>(`/quotations/${quotationId}/send-to-customer`, { method: 'POST' }),
  },

  portal: {
    view: (token: string) => apiFetch<PortalView>(`/portal/${token}`),
    accept: (token: string, message?: string) =>
      apiFetch(`/portal/${token}/accept`, { method: 'POST', body: JSON.stringify({ message }) }),
    reject: (token: string, message?: string) =>
      apiFetch(`/portal/${token}/reject`, { method: 'POST', body: JSON.stringify({ message }) }),
    requestChange: (token: string, message: string, requestedDiscountPct?: number) =>
      apiFetch(`/portal/${token}/request-change`, {
        method: 'POST',
        body: JSON.stringify({ message, requestedDiscountPct }),
      }),
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
    receive: (input: { warehouseId: string; productId: string; quantity: number }) =>
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

  subscriptions: {
    list: () => apiFetch<SubscriptionItem[]>('/subscriptions'),
    get: (id: string) => apiFetch<SubscriptionItem>(`/subscriptions/${id}`),
    create: (dto: {
      customerId: string;
      quotationId?: string;
      frequency?: string;
      startDate?: string;
      endDate?: string;
      notes?: string;
      lines: { productId: string; qty: number; unitPrice: number }[];
    }) => apiFetch<SubscriptionItem>('/subscriptions', { method: 'POST', body: JSON.stringify(dto) }),
    pause: (id: string) => apiFetch(`/subscriptions/${id}/pause`, { method: 'POST' }),
    resume: (id: string) => apiFetch(`/subscriptions/${id}/resume`, { method: 'POST' }),
    cancel: (id: string) => apiFetch(`/subscriptions/${id}/cancel`, { method: 'POST' }),
  },

  adminConfig: {
    get: () => apiFetch<AdminConfigData>('/admin/config'),
    update: (settings: Record<string, string>) =>
      apiFetch<AdminConfigData>('/admin/config', { method: 'PATCH', body: JSON.stringify({ settings }) }),
  },
};

export interface SubscriptionItem {
  id: string;
  number: string;
  customerId: string;
  status: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  nextBillingDate: string | null;
  recurringAmount: string;
  notes?: string | null;
  createdAt: string;
  customer?: { id: string; name: string } | null;
  quotation?: { id: string; number: string } | null;
  lines: {
    id: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
    product: { id: string; sku: string; name: string };
  }[];
}

export interface AdminConfigData {
  settings: Record<string, string>;
  system: {
    environment: string;
    databaseEngine: string;
    localization: string;
    rbacRoles: string[];
  };
  approvalPolicy: {
    level1: { role: string; triggers: string[] };
    level2: { role: string; triggers: string[] };
  };
}

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

export interface PortalView {
  quoteNumber: string;
  customer: string | null;
  status: string;
  negotiationStatus: string;
  validUntil: string | null;
  lines: { product: string; sku: string; qty: number; unitPrice: string; discountPct: string; lineTotal: string }[];
  subtotal: string;
  discountPct: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  messages: { author: string; body: string; at: string }[];
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
    customer: { id: string; name: string; segment?: string } | null;
    lines?: {
      id: string;
      qty: number;
      unitPrice: string;
      discountPct: string;
      taxRate: string;
      lineTotal: string;
      product: { id: string; sku: string; name: string; category?: string; basePrice?: string };
    }[];
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
    product: { id: string; sku: string; name: string; category?: string; basePrice?: string };
  }[];
  invoices: { id: string; number: string; status: string; total: string }[];
  negotiation?: {
    id: string;
    status: string;
    token?: { token: string } | null;
    messages: { id?: string; author: string; body: string; requestedDiscountPct?: number | null; createdAt: string }[];
  } | null;
}

export interface QuotationLineInput {
  productId: string;
  qty: number;
  unitPrice?: number;
  discountPct?: number;
}

export interface CreateQuotationPayload {
  customerId: string;
  salespersonId?: string;
  discountPct?: number;
  expiresAt?: string;
  lines: QuotationLineInput[];
}

export interface QuotationPreview {
  subtotal: number;
  discountPct: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  marginPct: number;
  lines: {
    productId: string;
    productName: string;
    category: string;
    sku: string;
    qty: number;
    basePrice: number;
    unitPrice: number;
    discountPct: number;
    taxRate: number;
    lineTotal: number;
  }[];
  governance: {
    chain: string[];
    reasons: string[];
    blendedRiskScore: number;
    lineAssessments: {
      productId?: string;
      category: string;
      effectiveDiscountPct: number;
      ceilingDiscountPct: number;
      exceeded: boolean;
      excessDiscountPct: number;
      unitPriceBypassDetected: boolean;
    }[];
  };
}
