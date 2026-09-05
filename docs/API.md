# API Specification — DealFlow360

> Authoritative API reference. Context in `/project.md` §13. REST over HTTP, JSON, `/api`
> prefix. DTO validation via class-validator + shared Zod contracts. RBAC guards on all
> protected routes.

## API Overview & Protocols

Business logic lives in services/engines; controllers validate, guard (RBAC), and translate
HTTP. Mutations are transactional and audited. Idempotency keys used where practical
(allocation, receipt reference, per-period invoice generation).

## Authentication & Authorization

JWT access + refresh in HTTP-only cookies (ADR-0011). `RolesGuard` + policy service enforce
role/permission per route and action. Unauthorized access returns 401 (unauthenticated) or
403 (forbidden) server-side — never relies on frontend hiding.

## Base URLs & Environments

- Local API: `http://localhost:3001/api` (port configurable).
- Web reads base URL from `NEXT_PUBLIC_API_URL`.
- Customer portal endpoints are token-scoped and return a filtered projection.

## Endpoints

### Auth & Users
`POST /auth/signup|login|refresh|logout` · `GET /auth/me` · `GET/POST /admin/users|roles` (admin)

### Customers & Products & Config
`GET/POST /customers` · `GET /customers/:id` · `PATCH /customers/:id`
`GET/POST/PATCH /products` · `GET /products/:id`
`GET/PUT /pricing` (admin) · `GET/PUT /discount-rules` (admin)

### Quotations
`GET/POST /quotations` · `GET /quotations/:id`
`POST /quotations/:id/price` · `POST /quotations/:id/submit|send|cancel|revise|duplicate|convert`

### Approvals
`GET /approvals` · `GET /approvals/:id`
`POST /approvals/:id/approve|reject|request-changes|comment`

### Fulfillment / Inventory
`GET /fulfillment` · `GET /fulfillment/:id`
`POST /fulfillment/:id/allocate|reallocate|fulfill|backorder|cancel-allocation`
`GET /inventory` · `POST /inventory/receive` (idempotent by `reference`)

### Subscriptions / Billing / Invoices / Payments
`GET/POST /subscriptions` · `GET /subscriptions/:id` · `POST /subscriptions/:id/pause|resume|cancel`
`GET /billing/:id` · `POST /billing/:id/generate-invoice|adjust|pause|resume`
`GET /invoices` · `GET /invoices/:id` · `POST /invoices/:id/issue|send|cancel|payments`

### Analytics / Admin
`GET /deal-health` · `GET /reports` (mgr/finance/admin)

### Customer Portal (token-scoped)
`GET /portal/:token` · `POST /portal/:token/accept|reject|request-change|comment`
Payload excludes internal margin, thresholds, notes, risk scores, and allocation internals.

## Request / Response Formats

JSON. Quantities are positive integers; discount percentages in [0,100]. Responses include
ids, timestamps, status enums, derived fields (availability, outstanding), and — for
quotations — engine-computed pricing breakdown. List endpoints support search, filters,
sort, and pagination.

## Error Handling & Status Codes

| Case | Status | Example |
|------|--------|---------|
| Unauthenticated | 401 | session expired |
| Forbidden (role/permission) | 403 | not an approver for this level |
| Not found | 404 | `Quotation Q-1024 not found` |
| Duplicate unique key | 409 | `SKU already exists` |
| Validation failure | 400/422 | `Quantity must be greater than zero` |
| Invalid state transition | 409 | `Cannot submit a completed quotation` |
| Allocation/concurrency conflict | 409 | retry-able; never corrupts inventory |

Consistent JSON error shape (`statusCode`, `message`, `error`). Concurrency conflicts are
handled via row locking so competing requests observe reduced availability.

## Rate Limiting & Quotas

Basic auth-endpoint throttling (login attempts) in v1; general rate limiting out of scope
for local demonstration.
