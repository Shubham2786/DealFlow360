# DealFlow360 — Codebase Documentation

> Developer reference for the implemented system: what libraries/tools are used and why,
> what each part does, how requests are routed, and how it all fits together. Updated as
> modules land. Companion docs: `/project.md` (design), `docs/WORKFLOW.md` (per-role
> flows), `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/DECISIONS.md`.

Context: the app is localized for **India** — currency is **INR (₹)** and tax is **GST**,
formatted with `en-IN`.

---

## 1. Project progress (status)

| Area | Status |
|------|--------|
| Foundation, monorepo, Docker Postgres, Prisma | ✅ Done |
| Auth (JWT access+refresh cookies, argon2) | ✅ Done |
| **RBAC** (Role/Permission tables, permission guards, signup→USER, admin role assignment, token versioning) | ✅ Done |
| Audit log + activity feed | ✅ Done |
| Customers, Products (catalog + activate/deactivate) | ✅ Done |
| Quotations + lifecycle (DealStateMachine) | ✅ Done |
| Approvals (ApprovalRuleEngine, dynamic chains, decisions) | ✅ Done |
| Fulfillment / Inventory / Allocation / Backorders | ✅ Done |
| Subscriptions | ⬜ Not started |
| Billing / Invoices / Payments (GST) | ✅ Done |
| Sales Dashboard + Deal Health analytics | ✅ Done (shared, not yet role-specific) |
| Real-time UI refresh (query invalidation + refetch) | ✅ Done |
| Resource ownership authorization (section 9 of RBAC spec) | ⬜ Not done (no `ownerId` on deals yet) |
| Role-specific dashboards | ⬜ Not started (depends on ownership) |
| Negotiation / Customer Portal | ⬜ Not started |
| Reporting, Admin config UI | ⬜ Not started |
| Local-Postgres host switch | ⏸ Paused (migration valid; running on Docker 5433) |
| Automated tests | ◐ Partial (permission guard + approval engine unit tests) |

---

## 2. Technology choices & rationale

| Tool | Used for |
|------|----------|
| **Next.js (App Router) + React** | Web UI; file-based routing; client components + TanStack Query |
| **TypeScript** | End-to-end types across web / api / shared |
| **Tailwind CSS** | Styling + a small shared component set (`components/ui.tsx`) |
| **TanStack Query** | Server-state cache, loading/error, mutations, and auto-refresh |
| **NestJS** | Backend structure: modules, controllers, services, guards, DI |
| **Prisma + PostgreSQL 16** | Type-safe DB access, migrations, constraints, row locking |
| **JWT + argon2 + cookies** | Auth: argon2 hashing; access+refresh JWTs in HTTP-only cookies; refresh rotation; token versioning |
| **Docker Compose** | Local PostgreSQL (port 5433) |
| **pnpm workspaces** | Monorepo: `apps/web`, `apps/api`, `packages/shared` |
| **Jest + ts-jest** | Unit tests (guard, engine) |

**Layering (the boundary):** Browser → NestJS Controllers (validate DTO + RBAC guard) →
Services (business logic + transactions) → Domain engines (pure: DealStateMachine,
ApprovalRuleEngine, AllocationEngine) → Prisma → PostgreSQL, with AuditService writing an
append-only activity log. No critical business logic lives in the frontend.

---

## 3. Repository map

```text
apps/api/src/
  main.ts, app.module.ts            bootstrap + module wiring
  prisma/                           PrismaService (global)
  health/                           GET /health
  auth/                             auth service/controller, guards, decorators, dtos
  users/                            admin user list + role assignment
  audit/                            AuditService (global) + activity feed
  customers/  products/             catalog + accounts
  quotations/                       deal core + DealStateMachine
  approvals/                        ApprovalRuleEngine + decisions
  fulfillment/                      AllocationEngine, inventory, reservations, backorders
  invoices/                         BillingService (invoices + payments, GST)
  analytics/                        dashboard metrics + deal-health engine
apps/web/
  app/                              routes (App Router) — see §7
  components/                       app-shell (nav + user menu), ui primitives
  lib/                              api client, use-auth (+permissions), format (INR/en-IN)
packages/shared/src/                enums (roles, permissions, statuses), Zod contracts
prisma/                            schema.prisma, migrations/, seed.ts
```

---

## 4. Authentication & Authorization (RBAC)

Privilege is **granted by the backend, never requested by the user.**

### Data model
Normalized RBAC: `roles`, `permissions`, `role_permissions` (join), and `users` carry
`roleId` (FK), `status`, and `tokenVersion`. Role names: **USER, MANAGER, FINANCE,
ADMIN**. The role→permission matrix lives in `packages/shared` (`ROLE_PERMISSIONS`) and is
seeded into the DB; ADMIN gets every permission.

Permissions: `DEAL_VIEW_OWN`, `DEAL_VIEW_TEAM`, `DEAL_CREATE`, `DEAL_APPROVE`,
`TASK_VIEW_OWN`, `TASK_ALLOCATE`, `TEAM_VIEW`, `FINANCE_DATA_VIEW`,
`FINANCE_TRANSACTION_APPROVE`, `FINANCE_REPORT_GENERATE`, `USER_MANAGE`, `ROLE_ASSIGN`,
`SYSTEM_CONFIG_MANAGE`.

### Guards & decorators (`auth/`)
- **`JwtAuthGuard`** (async) — verifies the JWT from the `df_access` cookie (or Bearer),
  then **loads the user + role + permissions from the DB**, checks `status === ACTIVE`,
  and enforces **token versioning** (rejects if the token's `tokenVersion` ≠ the user's
  current one). Attaches `req.user = { id, email, name, role, permissions[] }`.
- **`PermissionsGuard`** — reads `@RequirePermissions(...)` metadata and allows the request
  only if the user has all required permissions (ADMIN passes universally); else 403.
- **`@RequirePermissions(Permission…)`** — declares required permissions on a handler.
- **`@CurrentUser()`** — injects `req.user` into a handler param.

### AuthService functions
- `signup(dto)` — **always assigns the USER role** (looks up the Role row); the DTO has no
  `role` field and the global `ValidationPipe` (`forbidNonWhitelisted`) rejects any `role`
  a client tries to send (400).
- `login(dto)` — argon2 verify; issues tokens.
- `issueTokens(user)` — access JWT payload = `{ sub, email, name, role, tokenVersion }`;
  refresh JWT stored **hashed** with rotation.
- `refresh` / `logout` — rotate / revoke refresh tokens.
- `me(userId)` — safe projection incl. `role` + resolved `permissions[]`.

### UsersService (admin)
- `list()` / `listRoles()` — safe user + role listings.
- `assignRole(userId, roleName, actor)` — **ADMIN-only** (`ROLE_ASSIGN`); changes the
  user's role, **increments `tokenVersion`** and revokes refresh tokens so the change takes
  effect immediately (old sessions → 401). Audited.

### Auth/Users routes
| Route | Guard |
|-------|-------|
| `POST /auth/signup\|login\|refresh\|logout`, `GET /auth/me` | public / auth |
| `GET /users`, `GET /roles` | `USER_MANAGE` |
| `PATCH /users/:id/role` | `ROLE_ASSIGN` |

---

## 5. Domain modules — functions & routes

All routes are under `/api` and require authentication (`JwtAuthGuard`) unless noted;
permission-gated routes add `PermissionsGuard` + `@RequirePermissions`.

| Module | Key routes | Permission | Notes |
|--------|-----------|-----------|-------|
| Customers | `GET/POST /customers`, `GET /customers/:id` | auth | audits create |
| Products | `GET /products`, `GET /products/:id` | auth | |
| Products | `POST /products`, `PATCH /products/:id` | `SYSTEM_CONFIG_MANAGE` | create / activate-deactivate |
| Quotations | `GET /quotations`, `GET /quotations/:id` | auth | server-side pricing + margin |
| Quotations | `POST /quotations` | `DEAL_CREATE` | |
| Quotations | `POST /quotations/:id/submit\|cancel\|revise` | auth | `DealStateMachine` guards transitions; submit builds the approval chain |
| Approvals | `GET /approvals`, `GET /approvals/:id` | auth | |
| Approvals | `POST /approvals/:id/approve\|reject\|request-changes` | `DEAL_APPROVE` | advances steps + drives quote lifecycle |
| Fulfillment | `GET /fulfillment`, `GET /fulfillment/:id`, `GET /inventory`, `GET /warehouses` | auth | |
| Fulfillment | `POST /fulfillment/from-quotation/:id`, `/:id/allocate`, `/:id/fulfill`, `POST /inventory/receive` | `TASK_ALLOCATE` | transactional allocation + backorders |
| Invoices | `GET /invoices`, `GET /invoices/:id` | auth | GST line items + payments |
| Invoices | `POST /invoices/from-quotation/:id`, `/:id/payments`, `/:id/cancel` | `FINANCE_TRANSACTION_APPROVE` | drives lifecycle to PAID/COMPLETED |
| Analytics | `GET /dashboard/metrics`, `GET /deal-health` | auth | aggregation over live data |

### Domain engines (pure)
- **`DealStateMachine`** — authoritative quotation transition table; `assertTransition`
  rejects invalid moves.
- **`ApprovalRuleEngine.computeChain(facts)`** — from discount/margin/value returns an
  ordered approver chain (MANAGER → +FINANCE → +ADMIN) or `[]` for auto-approve.
  Thresholds are INR-scaled (₹2L finance, ₹10L executive).
- **`AllocationEngine.allocate(outstanding, availability)`** — deterministic priority-fill;
  returns the per-warehouse plan + backordered quantity. No I/O.

### Transactional services (highlights)
- **FulfillmentService** — `allocate` locks inventory rows with `SELECT … FOR UPDATE`
  (ordered) so concurrent orders can't over-reserve; creates reservations + allocations,
  updates lines, opens backorders; `receive` is idempotent (unique `reference`) and
  reprocesses backorders FIFO; `fulfill` consumes reservations and reduces on-hand.
- **BillingService** — `generateFromQuotation` builds a GST invoice from a fulfilled deal
  (FULFILLED → BILLING → INVOICED); `recordPayment` (PARTIALLY_PAID → PAID → deal
  COMPLETED) with an overpayment guard.

---

## 6. Data model (current)

Migrations in order: `init_auth → domain_dashboards → approvals → fulfillment →
inventory_checks → invoices_payments_inr → rbac`. Money columns are `Decimal` (serialize
to JSON as strings; the web coerces with `Number()`).

**RBAC / auth:** `roles`(name unique), `permissions`(name unique),
`role_permissions`(PK roleId+permissionId), `users`(email unique, roleId→roles, status,
tokenVersion), `refresh_tokens`(tokenHash unique, revoked).

**CRM / catalog:** `customers`(segment, contact…), `products`(sku unique, type,
basePrice, taxRate=GST%, currency=INR, active), `app_settings`.

**Deal:** `quotations`(number unique, customerId, salespersonId, status, subtotal/
discountPct/discountTotal/taxTotal/total/marginPct), `quotation_lines`.

**Approvals:** `approval_requests`(quotationId, status, reason),
`approval_steps`(level, role[string], status, approverId, comment, decidedAt).

**Fulfillment:** `warehouses`(code unique, priority), `inventory`(unique productId+
warehouseId, onHand, reserved; CHECK reserved≤onHand & non-negative),
`fulfillments`(number unique, quotationId unique, status), `fulfillment_lines`(ordered/
allocated/fulfilled/backordered qty; CHECK alloc+backorder≤ordered), `reservations`,
`allocations`(source INITIAL|BACKORDER), `backorders`(remainingQty), `inventory_receipts`
(reference unique).

**Billing:** `invoices`(number unique, status, subtotal/gstTotal/total/paidAmount,
paymentTerms), `invoice_lines`(gstRate), `payments`(method UPI/NEFT/…).

**Audit:** `audit_events`(actor, entityType, entityId, action, message) — no FK
(immutable log).

Enums (`QuotationStatus`, `FulfillmentStatus`, `InvoiceStatus`, …) are declared in
`schema.prisma` and mirrored in `packages/shared/src/enums.ts`. Roles/permissions are now
**data** (tables), with typed name references in `packages/shared` (`UserRole`,
`Permission`, `ROLE_PERMISSIONS`).

---

## 7. Frontend — routes, functions, real-time

### Routes (App Router)
`/` → redirect `/dashboard`; `/auth/login`, `/auth/signup`; `/dashboard`, `/deal-health`;
`/quotations` + `/quotations/:id`; `/approvals` + `/approvals/:id`; `/fulfillment` +
`/fulfillment/:id`; `/inventory`; `/invoices` + `/invoices/:id`; `/products`;
`/customers`; `/admin/users`.

### Key client modules
- **`lib/api.ts`** — `apiFetch<T>` (cookies + JSON, throws `ApiError`); grouped callers
  `api.auth/products/quotations/approvals/fulfillment/inventory/invoices/customers/admin/
  dashboard/dealHealth`.
- **`lib/use-auth.ts`** — `useCurrentUser()` (`['me']` query; 401 → `null`),
  `usePermissions()` (`can(permission)`, ADMIN passes), `useRequireAuth()` (redirects to
  login when unauthenticated).
- **`components/app-shell.tsx`** — sidebar filtered by permission, active-link highlight,
  header with **user avatar/name/role + Logout**.
- **`lib/format.ts`** — `inr()` (₹, en-IN), `formatDate/formatDateTime` (en-IN).

### Real-time updates
`app/providers.tsx` configures TanStack Query with `refetchOnWindowFocus`,
`refetchOnMount`, a short `staleTime`, and a `refetchInterval`. After mutations, detail
pages call `queryClient.invalidateQueries()` (broad) so an approval / allocation / payment
made on one screen is reflected on the dashboards, lists, and deal-health promptly.

### Auth navigation nuance
Login/guard use `router.replace()` (not `push`), so the login page is not left in the
back-history after signing in. Route protection is client-side (`useRequireAuth`); the
backend remains the real authority (401/403 on every protected endpoint).

---

## 8. Configuration & conventions

- `.env` (from `.env.example`): `DATABASE_URL` (Docker 5433 now; local 5432 documented,
  switch paused), `JWT_*`, `API_PORT`, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`,
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` (seed admin bootstrap).
- Passwords argon2-hashed; refresh tokens stored as SHA-256; no secrets in responses.
- Controllers validate + guard; services hold logic; engines are pure.
- Shared enums/permissions live in `@dealflow/shared` — never duplicated per app.
- Seeded logins (password `password123`): `admin@` (ADMIN), `morgan@` (MANAGER),
  `fiona@` (FINANCE), `sam@`/`uma@` (USER).

---

## 9. Known gaps / next steps

1. **Resource ownership** — add `createdById` to quotations + an ownership check so
   `DEAL_VIEW_OWN` truly means "own" (RBAC spec §9).
2. **Role-specific dashboards** — per-role metrics (USER=my deals, MANAGER=approvals/team,
   FINANCE=collections, ADMIN=full) once ownership exists.
3. **Negotiation/customer portal, reporting, subscriptions, admin config UI.**
4. **Local-Postgres host switch** (paused) and **fuller automated test coverage**.
