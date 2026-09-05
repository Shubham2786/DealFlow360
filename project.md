# DealFlow360 — Project Design

> Source of truth for the DealFlow360 product design. Executable, dependency-ordered
> work items are in `tasks.md`. Concern-specific detail lives under `docs/`.
>
> **Scope note:** DealFlow360 is the full B2B sales/order-management product. The earlier
> inventory-allocation framing is incorporated here as the **Fulfillment / Allocation**
> module (Phase 5); its allocation engine, reservations, and backorder rules are reused.
> See ADR-0010.

---

## 1. Product Purpose

DealFlow360 manages the complete lifecycle of a customer **deal** in a B2B environment:
authentication → sales dashboard → quotation → approval → fulfillment/allocation →
subscription/billing → invoice → payment. Supporting modules cover negotiation
(customer portal), product/pricing configuration, discount/approval configuration, deal
health/anomaly analytics, reporting, and administration.

The lifecycle is **not linear**. The correct mental model is a **stateful domain graph**:
the **Quotation (Deal)** is the central commercial entity; approval, negotiation,
fulfillment, allocation, subscription, billing, and invoice are processes/entities that
attach to it depending on the deal. A backend **state machine** and domain relationships
determine where a user can go and what actions are permitted — pages are **not** isolated
CRUD screens.

## 2. Goals & Non-Goals

**Goals:** deterministic deal state machine; server-authoritative pricing, discount,
approval, allocation, billing, and invoicing engines; RBAC enforced on the backend;
auditable history for every material action; context-preserving navigation across related
entities; consistent design system with full loading/empty/error/unauthorized states;
responsive enterprise-SaaS UI.

**Non-Goals (v1):** real payment-gateway integration, shipping-carrier integration,
multi-currency FX, email/PDF delivery infrastructure beyond stubs, multi-tenant billing
at scale, ML-based forecasting. Admin/Reporting is architected-for but can ship minimal.

## 3. Tech Stack

| Layer     | Choice |
|-----------|--------|
| Frontend  | Next.js (App Router), React, TypeScript, Tailwind CSS, headless UI primitives |
| Backend   | NestJS, TypeScript |
| ORM       | Prisma |
| Database  | PostgreSQL 16 (local via Docker) |
| Auth      | JWT access + refresh, HTTP-only cookies, RBAC guards |
| Data fetch (web) | TanStack Query (server state), Zod-validated DTO contracts in `packages/shared` |
| Infra     | Docker Compose, pnpm workspaces, Git |
| Testing   | Jest (unit/integration/e2e), Playwright (optional UI smoke) |

Rationale and continuity with prior decisions in `docs/DECISIONS.md`.

## 4. High-Level Architecture

Layered modular monolith. Business logic is server-side; the frontend displays state and
triggers backend actions.

```text
Next.js (apps/web)
   │  REST /api  (JWT cookie)
   ▼
NestJS (apps/api)
   Controllers (validate DTO, RBAC guard, translate HTTP)
        │
   Application Services (Quotation, Approval, Fulfillment, Subscription,
        │                Billing, Invoice, Negotiation, DealHealth, Admin)
        ▼
   Domain Engines (pure/near-pure):
     • PricingEngine        • DiscountEngine
     • ApprovalRuleEngine   • AllocationEngine
     • BillingEngine        • DealHealthEngine
     • DealStateMachine
        │
   Prisma → PostgreSQL (transactions, row locks, constraints)
        │
   AuditService (writes audit events within the same transaction)
```

Boundary rule (spec §29, §31): controllers → services → engines. Engines compute; services
persist inside transactions. No critical business logic lives only in React.

## 5. Repository Structure

```text
project-root/
├── apps/
│   ├── web/                      # Next.js frontend
│   │   └── app/                  # route groups per §12
│   └── api/                      # NestJS backend
│       └── src/
│           ├── auth/             ├── users/          ├── customers/
│           ├── products/         ├── pricing/        ├── discounts/
│           ├── quotations/       ├── approvals/      ├── negotiation/
│           ├── fulfillment/      ├── inventory/      ├── allocation/
│           ├── subscriptions/    ├── billing/        ├── invoices/
│           ├── payments/         ├── deal-health/    ├── reporting/
│           ├── admin/            ├── audit/          └── prisma/
├── packages/shared/              # Zod schemas, enums, TS contracts, status maps
├── prisma/                       # schema.prisma, migrations/, seed.ts
├── docker/  ├── docker-compose.yml
├── project.md  ├── tasks.md  └── README.md
```

## 6. Domain Modules

- **Auth & Users** — login/signup/reset, sessions, roles/permissions.
- **Customers** — accounts, contacts, addresses, segment.
- **Products & Catalog** — sellable goods/services, type (one-time/recurring), UoM, tax.
- **Pricing & Pricelists** — base price → segment pricelist → qty/contract discounts →
  effective price via **PricingEngine**.
- **Discounts & Approval Config** — discount tiers and approval-rule configuration that
  drive the **ApprovalRuleEngine**.
- **Quotations (Deal core)** — quote header + lines; central commercial entity.
- **Approvals** — approval requests, dynamic approval chains, decisions.
- **Negotiation / Customer Portal** — tokenized customer-facing review & responses.
- **Fulfillment / Allocation / Inventory / Backorders** — allocation engine, reservations,
  ATP, backorders (incorporates the prior inventory system).
- **Subscriptions & Billing** — recurring plans, billing schedules.
- **Invoices & Payments** — invoice generation, payment recording, statuses.
- **Deal Health & Anomaly** — cross-cutting analytical engine over live domain data.
- **Reporting & Admin** — metrics, user/role/config administration.
- **Audit** — append-only audit events for material actions.

## 7. User Roles & Permission Model (RBAC)

Roles: **Salesperson, Sales Manager, Finance, Operations, Admin** (+ **Customer** for the
portal token context). Permissions are action-scoped and enforced on the backend via
guards; the frontend hides/disables unauthorized actions for UX only (spec §27).

| Capability (examples) | Sales | Mgr | Finance | Ops | Admin |
|---|---|---|---|---|---|
| Create/edit own quotation, submit | ✓ | ✓ | | | ✓ |
| Approve eligible deals | | ✓ | ✓ (financial) | | ✓ |
| Approve own high-discount deal | ✗ | ✓* | ✓* | | ✓ |
| Manage fulfillment / allocate / backorder | | | | ✓ | ✓ |
| Billing / invoices / payments | | | ✓ | | ✓ |
| Configure products / pricing / discount rules / approval chains | | | | | ✓ |
| Users / roles / reporting | | | | | ✓ |
| Deal health (view) | ✓ | ✓ | ✓ | ✓ | ✓ |

`*` subject to approval-chain rules; a user may not be the sole approver of their own deal
above their authority. Permission checks are centralized (guard + policy service), never
duplicated in components (spec §20, §27).

## 8. Page Architecture

Domain pages (each with loading/empty/error/unauthorized/not-found states per §32):
Sales Dashboard; Quotations List/Detail; Approval List/Detail; Fulfillment List/Detail;
Subscriptions List; Billing Detail; Customer Portal/Negotiation; Invoices List/Detail;
Deal Health & Anomaly Dashboard; Admin/Reporting; Product Catalog; Product & Pricelist
Config; Discount Tiers & Approval Chains.

Standard pages: 404/403/500, login/signup/forgot/reset, session-expired, profile
settings, notifications, generic search, confirmation dialogs.

Every **detail** page exposes related entities for forward/back navigation with preserved
context (spec §24): e.g. Invoice → Order → Quotation → Customer.

## 9. Route Structure (with guards)

```text
/auth/login  /auth/signup  /auth/forgot  /auth/reset          (public)
/customer-portal/:token                                        (token-scoped, public)
/dashboard                                                     (auth)
/quotations                 /quotations/:quotationId
/approvals                  /approvals/:approvalId             (approver roles)
/fulfillment                /fulfillment/:fulfillmentId        (ops/admin)
/subscriptions              /subscriptions/:subscriptionId
/billing/:billingId                                            (finance/admin)
/invoices                   /invoices/:invoiceId
/deal-health                                                   (auth)
/reports                                                       (mgr/finance/admin)
/products                   /products/:productId
/pricing                    /discount-rules                    (admin)
/admin                                                         (admin)
```

Route guards: authenticated guard + role guard per segment; unauthorized URL access is
blocked server-side (401/403), not merely hidden (spec §3, §27).

## 10. Core Entity Relationships

```text
Customer 1─N Quotation 1─N QuotationLine ─N:1 Product
Quotation 1─N ApprovalRequest 1─N ApprovalStep
Quotation 1─N Negotiation(Thread) 1─N NegotiationMessage
Quotation 1─1? Fulfillment(Order) 1─N FulfillmentLine
FulfillmentLine 1─N Allocation ─N:1 Inventory ─N:1 Warehouse
FulfillmentLine 1─N Backorder
Quotation 1─N Subscription 1─1 Billing(Agreement) 1─N BillingPeriod
Billing/Subscription/Quotation 1─N Invoice 1─N InvoiceLine
Invoice 1─N Payment
Product 1─N Price / PricelistEntry / Inventory / QuotationLine / SubscriptionLine / InvoiceLine
Any entity 1─N AuditEvent
```

Products are a single shared domain entity referenced everywhere (spec §18, §30) — never
duplicated per module. Deal Health derives from these entities, holding no independent
copies (spec §22).

## 11. Lifecycle State Machines

### 11.1 Deal / Quotation
```text
DRAFT → SUBMITTED → PENDING_APPROVAL
   → (approve all levels) APPROVED
   → (reject) REJECTED → (revise) DRAFT
   → (request changes) CHANGES_REQUESTED → DRAFT
PENDING_APPROVAL ⇄ NEGOTIATION (customer portal)
APPROVED → CONVERTED_TO_FULFILLMENT → FULFILLING
   → FULFILLED / PARTIALLY_FULFILLED(+BACKORDERED)
→ BILLING → INVOICED → PAID → COMPLETED
Any non-terminal → CANCELLED (with guards)
```
Key rule (spec §13): a **material change** to an already-approved quote (e.g. extra
discount from negotiation) forces re-entry into approval. Approval cannot be bypassed
because the prior version was approved.

### 11.2 Approval Request
`PENDING → (per-step) APPROVED_STEP → … → APPROVED | REJECTED | CHANGES_REQUESTED | ESCALATED`.
Chain is computed dynamically from discount/value/margin/terms via ApprovalRuleEngine.

### 11.3 Fulfillment / Allocation
`PENDING → ALLOCATING → ALLOCATED | PARTIALLY_ALLOCATED | BACKORDERED → READY_TO_SHIP →
FULFILLED | FAILED`. Reservations: `ACTIVE → RELEASED/FULFILLED/CANCELLED`. Backorders:
`OPEN → PARTIALLY_ALLOCATED → FULFILLED | CANCELLED`.

### 11.4 Subscription
`DRAFT → ACTIVE → (PAUSED ⇄ ACTIVE) → EXPIRED | CANCELLED | PAST_DUE`.

### 11.5 Invoice
`DRAFT → ISSUED → PARTIALLY_PAID → PAID` ; `ISSUED → OVERDUE` ; `→ CANCELLED`.

All transitions validated by `DealStateMachine`/module services; invalid transitions
rejected with meaningful errors. Actions shown in the UI are **state-aware** (spec §23).

## 12. Business Rules / Engines (server-authoritative)

- **PricingEngine** (spec §19): effective price = base → customer/segment pricelist → qty
  discount → contract discount. No pricing math in UI pages.
- **DiscountEngine + ApprovalRuleEngine** (spec §20): discount tiers and approval rules are
  configuration-driven (tier ranges, category, segment, deal value, margin, terms,
  contract duration) and determine the approval chain. Not duplicated in frontend.
- **AllocationEngine** (spec §9–10, reused from prior work): deterministic priority-fill
  across warehouses; partial allocation; backorders; transactional with row locks; ATP
  = onHand − reserved. UI never claims fulfilled without real allocation.
- **BillingEngine**: generates billing periods and invoices from subscription terms.
- **DealHealthEngine** (spec §16, §22): computes per-deal health (Healthy/Warning/Critical)
  and anomalies (commercial/operational/financial/lifecycle) from live data with severity,
  explanation, recommended action, and drill-down target.
- **DealStateMachine**: single authority for lifecycle transitions + guards.

## 13. API Boundaries

REST under `/api`, JSON, DTO validation (class-validator + shared Zod contracts), RBAC
guards. Representative endpoints (full list in `docs/API.md`):

```text
POST /auth/login|signup|refresh|logout   GET /auth/me
GET/POST /customers  GET /customers/:id
GET/POST/PATCH /products  /products/:id
GET/PUT /pricing  /discount-rules              (admin)
GET/POST /quotations  GET /quotations/:id
POST /quotations/:id/submit|send|cancel|revise|convert
POST /quotations/:id/price  (recompute via engine)
GET /approvals  GET /approvals/:id  POST /approvals/:id/approve|reject|request-changes|comment
GET /fulfillment  /fulfillment/:id  POST /fulfillment/:id/allocate|reallocate|fulfill|backorder|cancel-allocation
GET/POST /subscriptions  GET /subscriptions/:id  POST /subscriptions/:id/pause|resume|cancel
GET /billing/:id  POST /billing/:id/generate-invoice|adjust|pause|resume
GET /invoices  /invoices/:id  POST /invoices/:id/issue|send|cancel|payments
GET /deal-health  GET /reports  (metrics)
GET/POST /admin/users|roles  ...
# customer portal (token-scoped, filtered payload — no internal fields)
GET /portal/:token  POST /portal/:token/accept|reject|request-change|comment
```

The customer-portal payload excludes internal margin, thresholds, notes, risk scores, and
allocation internals (spec §13).

## 14. Component Architecture (shared, spec §25)

- **Data:** DataTable, Pagination, SearchBar, FilterBar, SortControls, EmptyState,
  ErrorState, LoadingSkeleton.
- **Entity summaries:** CustomerSummary, ProductSummary, QuoteSummary, OrderSummary,
  InvoiceSummary, DealStatusBadge.
- **Workflow:** LifecycleStepper, ApprovalChain, StatusTimeline, ActivityTimeline,
  AuditHistory.
- **Financial:** PriceBreakdown, DiscountBreakdown, TaxBreakdown, InvoiceSummary.
- **Operational:** InventoryAvailability, AllocationStatus, BackorderIndicator,
  FulfillmentProgress.
- **UX:** ConfirmModal, Toast, FormField/validation, ErrorBoundary, PermissionDenied.

Reuse over duplication; a `useDeal(id)` style hook exposes the shared domain state so pages
consume/modify one source of truth (spec §31).

## 15. UI States (every major page, spec §32)

Loading (skeletons), Empty (with next action), Error (explain + retry), Unauthorized
(clear message), Not Found (entity-specific), Partial data (degrade gracefully), Mutation
loading (disable double-submit, progress, success/failure), Success feedback (toast/state
transition). Destructive actions require confirmation (spec §34).

## 16. Design System (spec §34, `docs/DESIGN.md`)

Modern enterprise SaaS feel — **not** the wireframe's look. Priorities: clear hierarchy,
strong typography, consistent spacing, accessible contrast, unambiguous status indicators,
fast navigation, minimal clutter. Semantic status color system (draft/pending/approved/
rejected/warning/critical/paid/overdue). Dense operational tables use horizontal scroll,
responsive columns, and detail drawers rather than being crushed into mobile (spec §33).
The reference image is used only as a page-map, never as visual direction.

## 17. Auditability (spec §26)

`AuditService` writes append-only `AuditEvent`s within the same transaction as the action
for: quotation created/edited/submitted; approval requested/approved/rejected; negotiation
started / customer change requested; allocation created/released; backorder created;
fulfillment completed; subscription created; invoice generated; payment recorded; pricing/
discount changes. Surfaced via ActivityTimeline/AuditHistory on detail pages.

## 18. Concurrency & Transactions

Allocation, approval decisions, invoice generation, and payment recording are transactional
and auditable. Inventory allocation uses `READ COMMITTED` + ordered `SELECT ... FOR UPDATE`
row locks (reused from the prior inventory design; ADR-0004) with CHECK constraints as a
backstop. Mutations are idempotent where practical (idempotency keys on allocation, receipt
reference, invoice generation per period).

## 19. Resolved Decisions (see `docs/DECISIONS.md`)

- ADR-0001..0009 (carried over): local Postgres+Docker+Prisma, pnpm monorepo, priority-fill
  allocation, row-lock concurrency, derived availability, backorder priority, idempotent
  receipts, no-auth-in-v1 → **superseded by ADR-0011** (auth is now in scope), independent
  per-line allocation.
- **ADR-0010**: DealFlow360 is the product; the inventory system is its Fulfillment module.
- **ADR-0011**: JWT + refresh cookie sessions with backend-enforced RBAC (supersedes the
  no-auth decision now that the product has real roles).
- **ADR-0012**: Configuration-driven discount tiers & approval chains stored in DB; engines
  read config, never hardcoded rules.
- **ADR-0013**: Quotation is the aggregate root of a Deal; approval/negotiation/fulfillment/
  subscription/billing/invoice attach as related aggregates — stateful domain graph, not
  linear screen flow.
- **ADR-0014**: Customer portal is a token-scoped, field-filtered projection; internal data
  never leaves the internal API surface.
- **ADR-0015**: A material change to an approved quote resets it to require re-approval.

## 20. Definition of Done

Auth + RBAC enforced server-side; customer/product/pricing configurable; quotations create/
price/submit through engines; approval chains computed from config and decided transactionally;
fulfillment reflects real allocation with backorders; subscriptions/billing/invoices/payments
flow with correct statuses; negotiation via portal can force re-approval; deal health derives
anomalies from live data; every major page implements the required UI states; navigation
preserves entity context; audit events recorded for material actions; critical operations
transactional and concurrency-safe; seeded demo data exercises the full deal graph; runs
locally via Docker with a few commands.
