# DealFlow360 — Workflow & How It Works

> How the system works end-to-end, what each technology is used for, and the workflow for
> each user role. Complements `project.md` (design), `docs/CODEBASE.md` (functions/routes),
> and `docs/ARCHITECTURE.md`.

---

## 1. What the system does

DealFlow360 manages a B2B **deal** through its whole life: a salesperson builds a
**quotation**, it goes through **approval** (based on discount/margin/value), an approved
deal is **fulfilled** from **inventory** (with allocation and backorders), and finally it
is **billed and invoiced**. Two analytical surfaces — the **Sales Dashboard** and
**Deal Health** — read live data across all of that.

The quotation is the center of gravity; approval, fulfillment, billing, and invoices
attach to it as the deal progresses (a stateful domain graph, not a linear wizard).

---

## 2. Tech stack — what each piece is used for

| Technology | Used for |
|------------|----------|
| **Next.js (App Router) + React** | The web UI: pages, routing, client components. Each folder under `apps/web/app` is a route. |
| **TypeScript** | Type safety shared across web, API, and the shared package. |
| **Tailwind CSS** | Styling — utility classes + a small shared component set (`components/ui.tsx`). |
| **TanStack Query** | Client-side server-state: fetching, caching, loading/error states, and mutations (`useQuery`/`useMutation`). |
| **NestJS** | The backend structure: modules, controllers (HTTP), services (logic), guards (auth/RBAC), dependency injection. |
| **Prisma** | Type-safe database access + migrations. `schema.prisma` defines models; `PrismaService` is injected everywhere. |
| **PostgreSQL** | The database. Enforces uniqueness, foreign keys, and (for inventory) CHECK constraints; supports row locking for safe allocation. |
| **Docker Compose** | Runs PostgreSQL locally (host port 5433). |
| **JWT + argon2 + cookies** | Auth: argon2 hashes passwords; access + refresh JWTs in HTTP-only cookies; refresh rotation; token versioning invalidates sessions on role change. |
| **RBAC (Role/Permission tables)** | Authorization: permissions resolved from the user's role and enforced by `@RequirePermissions` + `PermissionsGuard`. |
| **pnpm workspaces** | Monorepo: `apps/web`, `apps/api`, `packages/shared`. |
| **@dealflow/shared** | One source of truth for enums (statuses/roles) and DTO contracts, used by both apps. |

### Where the logic lives (the boundary)
```text
Browser (Next.js pages, TanStack Query)
   │  fetch with cookies → /api
   ▼
NestJS Controllers  → validate DTO + RBAC guard, translate HTTP only
   │
NestJS Services     → business logic + transactions
   │
Domain Engines      → pure decisions: DealStateMachine, ApprovalRuleEngine, AllocationEngine
   │
Prisma → PostgreSQL → persistence, constraints, row locks
   │
AuditService        → append-only activity log (recent activity feed)
```
Rule: no critical business logic in the frontend. The frontend shows state and triggers
backend actions.

---

## 3. End-to-end deal workflow

```text
1. LOGIN
   User authenticates → JWT cookies set → role loaded.

2. SETUP (Admin/Sales)
   Create Customers and Products (catalog + base price).

3. QUOTATION (Salesperson)
   Create a quotation for a customer with product lines.
   PricingEngine (currently in QuotationsService) computes subtotal, discount, tax,
   total, and margin.  Status: DRAFT.

4. SUBMIT → APPROVAL
   Submit the quote. ApprovalRuleEngine inspects discount / margin / value:
     • within authority (discount ≤5% & margin ≥20%) → AUTO-APPROVED
     • otherwise → an approval chain is built:
         SALES_MANAGER  (+FINANCE if discount>10% or margin<15% or value>20k)
                        (+ADMIN  if discount>20% or value>50k)
   Status: PENDING_APPROVAL. Each approver approves/rejects/requests-changes in order.
   Final approval → APPROVED. Reject → REJECTED. Request changes → CHANGES_REQUESTED.

5. FULFILLMENT (Operations)
   An APPROVED quote is converted to a Fulfillment order (one line per product).
   The AllocationEngine allocates stock from warehouses (ranked by priority) inside a
   DB transaction with row locks so two orders can never over-allocate the same stock:
     • enough stock  → ALLOCATED (reservations created, inventory.reserved increased)
     • not enough    → PARTIALLY_ALLOCATED + a BACKORDER for the shortfall
   Receiving new inventory reprocesses open backorders by priority.
   Fulfilling allocated stock → FULFILLED (reservations consumed, on-hand reduced).

6. BILLING & INVOICE (Finance)   [in progress]
   A fulfilled/committed deal is billed; invoices are issued and payments recorded;
   overdue invoices are flagged.

7. ANALYTICS (everyone)
   Sales Dashboard shows KPIs, alerts, activity. Deal Health flags anomalies
   (excessive discount, low margin, stuck approvals, overdue invoices, nearing expiry).
```

### Inventory invariants (enforced in the allocation transaction + DB CHECKs)
- `reserved ≤ onHand`, `onHand ≥ 0`, `reserved ≥ 0`
- `available = onHand − reserved` (derived, never stored)
- an allocation always has a matching reservation; cancelling releases it
- a line never allocates more than its outstanding quantity

---

## 4. Workflow per user role

Roles are **USER, MANAGER, FINANCE, ADMIN** (normalized RBAC). Authorization is enforced
on the backend via `@RequirePermissions` + `PermissionsGuard` (permissions resolved from
the user's role). ADMIN passes every check. Public signup always yields **USER**; only an
ADMIN can change roles. The UI hides actions a role lacks, but that's convenience only —
the API is the gate.

### USER (`sam@`, `uma@`) — permissions: DEAL_VIEW_OWN, DEAL_CREATE, TASK_VIEW_OWN
- Log in → Dashboard.
- Create/edit **quotations**; add product lines; see live pricing and margin.
- **Submit** a quote for approval; **revise** one sent back; **cancel**.
- Cannot approve deals, allocate stock, manage billing, or change roles/config.
- (Ownership scoping — "only my deals" — is a planned enhancement.)

### MANAGER (`morgan@`) — adds DEAL_APPROVE, TASK_ALLOCATE, TEAM_VIEW, DEAL_VIEW_TEAM
- First **approver**: Approve / Reject / Request Changes on the approval chain.
- Owns **Fulfillment**: convert approved deals, run **allocation**, handle **backorders**,
  **receive inventory**, mark orders **fulfilled**.
- Monitors **Deal Health**.

### FINANCE (`fiona@`) — FINANCE_DATA_VIEW/TRANSACTION_APPROVE/REPORT_GENERATE, DEAL_APPROVE
- **Finance-step approver** in the approval chain.
- Owns **Billing & Invoices**: generate GST invoices, record payments (UPI/NEFT/…),
  watch overdue balances.

### ADMIN (`admin@`) — all permissions
- Universal access (can act at any approval level, any module).
- **User & role management** (`/admin/users`): assign roles (invalidates the target's
  sessions via token versioning).
- Owns configuration (discount tiers, approval thresholds, pricing) — currently the
  thresholds live in the engines; a config UI is planned.

---

## 5. Concrete demo path (with seeded data)

1. Log in as `admin@dealflow.test / password123`.
2. **Dashboard** → see KPIs, alerts, recent activity.
3. **Quotations** → open a DRAFT (e.g. Q-1001) → **Submit for Approval**.
4. **Approvals** → open the request → step through Approve until **APPROVED**
   (as admin you can act on every level).
5. **Convert to Fulfillment** on the approved quote → **Fulfillment** detail.
6. **Allocate** → watch stock reserve; if short, a **backorder** appears.
7. **Inventory** → **Receive** stock for the backordered product → backorder reallocates.
8. **Deal Health** → anomalies update from the live data throughout.

---

## 6. Roles ↔ pages quick map

| Page | Visible to (permission) |
|------|-------------------------|
| `/dashboard`, `/deal-health`, `/customers` | all authenticated |
| `/quotations`, `/quotations/:id` | all (create needs DEAL_CREATE) |
| `/approvals`, `/approvals/:id` | MANAGER, FINANCE, ADMIN (DEAL_APPROVE) |
| `/fulfillment`, `/fulfillment/:id`, `/inventory` | MANAGER, ADMIN (TASK_ALLOCATE) |
| `/invoices`, `/invoices/:id` | FINANCE, ADMIN (FINANCE_DATA_VIEW) |
| `/products` | all (view); create/edit needs SYSTEM_CONFIG_MANAGE (ADMIN) |
| `/admin/users` | ADMIN (USER_MANAGE / ROLE_ASSIGN) |
