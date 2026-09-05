# DealFlow360 — Implementation Tasks

Dependency-ordered, phased tasks derived from `project.md`. Each task lists: **Build**,
**Deps**, **Entities**, **APIs**, **UI**, **Rules**, **Acceptance**, **Edge cases**.
Statuses mirrored into `tasks/BACKLOG.md`.

> Note: `task.md` (singular, prior inventory-only plan) is retained for reference; its
> Fulfillment tasks are folded into Phase 5 here.

---

## Phase 1 — Foundation (auth, database, app shell)

### TASK-F1-01 — Monorepo + tooling
- **Build**: pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`, root `prisma/`),
  shared tsconfig, lint/format, `.env.example`.
- **Deps**: none · **Entities**: – · **APIs**: – · **UI**: –
- **Rules**: no secrets committed. · **Acceptance**: `pnpm install` + `pnpm -r build` pass.
- **Edge**: version pinning for reproducibility.

### TASK-F1-02 — Docker Compose PostgreSQL + Prisma bootstrap
- **Build**: `docker-compose.yml` (postgres:16, volume, healthcheck), PrismaService,
  datasource/generator.
- **Deps**: F1-01 · **Entities**: – · **APIs**: `GET /health`
- **Acceptance**: `docker compose up -d` healthy; `prisma generate` works; health 200.
- **Edge**: DB not ready → API retries/health reflects it.

### TASK-F1-03 — NestJS shell + Next.js shell
- **Build**: NestJS `/api` prefix, global ValidationPipe, CORS, config; Next.js App Router
  + Tailwind + base layout, API client (TanStack Query), Zod contracts in shared.
- **Deps**: F1-01 · **UI**: AppShell (nav, header), theme tokens.
- **Acceptance**: web renders shell, calls `/api/health`.
- **Edge**: API unreachable → global error boundary + retry.

### TASK-F1-04 — Auth: schema, endpoints, sessions
- **Build**: User/Role/Permission schema; signup/login/refresh/logout; JWT access + refresh
  in HTTP-only cookies; password hashing (argon2/bcrypt); `GET /auth/me`.
- **Deps**: F1-02, F1-03 · **Entities**: User, Role, Permission, RefreshToken
- **APIs**: `POST /auth/signup|login|refresh|logout`, `GET /auth/me`
- **Rules**: passwords hashed; refresh rotation; lockout on repeated failures (basic).
- **Acceptance**: login sets cookie; `/auth/me` returns identity+role; logout clears.
- **Edge**: invalid creds, expired/replayed refresh, session-expired UX.

### TASK-F1-05 — RBAC guards + route protection
- **Build**: backend `RolesGuard`/policy service; web auth+role route guards; 401/403
  handling; login/forgot/reset/session-expired pages.
- **Deps**: F1-04 · **APIs**: guard all protected routes.
- **Rules**: unauthorized URL access blocked server-side (spec §3, §27).
- **Acceptance**: manual URL entry to protected route → redirected/403.
- **Edge**: role change mid-session; deep-link after login.

### TASK-F1-06 — Audit foundation
- **Build**: AuditEvent schema + AuditService (write within transaction), AuditHistory/
  ActivityTimeline components.
- **Deps**: F1-02 · **Entities**: AuditEvent
- **Acceptance**: helper records an event with actor/entity/action/metadata/timestamp.
- **Edge**: audit write must not silently fail inside a committed transaction.

---

## Phase 2 — Customer + Product + Pricing

### TASK-F2-01 — Customers module
- **Build**: Customer, Contact, Address, segment; CRUD + list/detail.
- **Deps**: F1-05 · **Entities**: Customer, Contact, Address
- **APIs**: `GET/POST /customers`, `GET /customers/:id`, `PATCH`
- **UI**: CustomerSummary, list (DataTable/Filter/Search), detail with related deals.
- **Acceptance**: create/list/get; detail shows related quotations (empty initially).
- **Edge**: duplicate customer, missing contact/address, inactive customer.

### TASK-F2-02 — Product catalog
- **Build**: Product (SKU unique, name, category, type one-time/recurring, UoM, active),
  tax config; CRUD + activate/deactivate.
- **Deps**: F1-05 · **Entities**: Product, ProductCategory, TaxRate
- **APIs**: `GET/POST/PATCH /products`, `/products/:id`
- **UI**: catalog list w/ filters (category/type/active/price/SKU), detail.
- **Rules**: shared entity, not duplicated per module (spec §18).
- **Acceptance**: duplicate SKU → 409; deactivate hides from new quotes but keeps history.
- **Edge**: product referenced by historical lines cannot be hard-deleted.

### TASK-F2-03 — Pricing & pricelists + PricingEngine
- **Build**: Price, Pricelist, PricelistEntry (segment/qty/contract); `PricingEngine`
  computing effective price; recompute endpoint.
- **Deps**: F2-01, F2-02 · **Entities**: Price, Pricelist, PricelistEntry
- **APIs**: `GET/PUT /pricing`, `POST /quotations/:id/price` (later wiring)
- **UI**: pricing config (admin), PriceBreakdown component.
- **Rules**: pricing math only in engine (spec §19); no UI hardcoding.
- **Acceptance**: base→segment→qty→contract yields deterministic effective price.
- **Edge**: no pricelist match → base price; overlapping rules resolved deterministically.

---

## Phase 3 — Quotation + pricing calculation

### TASK-F3-01 — Quotation schema + list
- **Build**: Quotation (number unique, customer, salesperson, status, dates, terms),
  QuotationLine (product, qty, unit price, discount, tax, subtotal); list w/ search/filters
  (status/date/customer/salesperson/value), status/approval/fulfillment/payment columns.
- **Deps**: F2-03 · **Entities**: Quotation, QuotationLine
- **APIs**: `GET/POST /quotations`, `GET /quotations/:id`
- **UI**: Quotations List (DataTable), QuoteSummary, DealStatusBadge.
- **Rules**: list reflects DB state, no fake FE state (spec §5).
- **Acceptance**: create quote with ≥1 line; list filters/search work.
- **Edge**: empty order, qty≤0, expired quote handling.

### TASK-F3-02 — Quotation detail + line pricing
- **Build**: detail page (header, customer info, lines, pricing summary, commercial terms,
  lifecycle stepper); wire PricingEngine per line; recompute on edit.
- **Deps**: F3-01, F2-03 · **UI**: LifecycleStepper, Price/Discount/TaxBreakdown, line editor.
- **Rules**: state-aware actions (Save/Submit/Edit/Send/Cancel per state, spec §23).
- **Acceptance**: totals = engine output; completed quote hides "Submit for approval".
- **Edge**: editing after submit blocked; concurrent edit conflict.

### TASK-F3-03 — Quotation lifecycle actions + DealStateMachine
- **Build**: `DealStateMachine`; submit/cancel/revise/duplicate/convert transitions with
  guards + audit.
- **Deps**: F3-02, F1-06 · **APIs**: `POST /quotations/:id/submit|cancel|revise|duplicate`
- **Rules**: invalid transitions rejected; every transition audited.
- **Acceptance**: transitions match §11.1; audit events created.
- **Edge**: submit with unpriced lines; cancel already-completed.

---

## Phase 4 — Approval (rules, chain, UI)

### TASK-F4-01 — Discount tiers & approval config
- **Build**: DiscountTier + ApprovalRule config schema (min/max discount, category,
  segment, deal value, margin, terms, required approver/level); admin config UI.
- **Deps**: F1-05 · **Entities**: DiscountTier, ApprovalRule, ApprovalLevel
- **APIs**: `GET/PUT /discount-rules`
- **Rules**: configuration-driven (ADR-0012); not duplicated in FE.
- **Acceptance**: tiers/rules persisted; validation of overlaps/gaps.
- **Edge**: overlapping tiers, missing approver for a tier.

### TASK-F4-02 — ApprovalRuleEngine + request creation
- **Build**: engine computing required approval chain from a quote's discount/value/margin/
  terms; create ApprovalRequest + steps on submit.
- **Deps**: F4-01, F3-03 · **Entities**: ApprovalRequest, ApprovalStep
- **APIs**: (invoked by submit); `GET /approvals`, `GET /approvals/:id`
- **Rules**: chain dynamic per deal (spec §8, §20); not every deal needs every level.
- **Acceptance**: e.g. 12% discount → Manager+Finance chain; 3% → none/salesperson.
- **Edge**: no approval needed (auto-approve); user cannot approve own beyond authority.

### TASK-F4-03 — Approval List + Detail + decisions
- **Build**: approval list (filters pending/approved/rejected/escalated, approver, date);
  detail (deal summary, reason, ApprovalChain, decision controls); approve/reject/
  request-changes/comment transactional + audit.
- **Deps**: F4-02 · **APIs**: `POST /approvals/:id/approve|reject|request-changes|comment`
- **UI**: ApprovalChain, decision panel, PermissionDenied for non-approvers.
- **Rules**: decisions modify quotation lifecycle (approve→next level/APPROVED; reject→
  REJECTED; changes→DRAFT); transactional + auditable (spec §8).
- **Acceptance**: multi-step chain advances; final approve → APPROVED → convertible.
- **Edge**: concurrent approvals on same step; approver lacking permission; escalation.

---

## Phase 5 — Fulfillment / Inventory / Allocation / Backorders

> Reuses the prior inventory-allocation design (allocation engine, reservations, ATP,
> backorders, row-lock concurrency).

### TASK-F5-01 — Inventory + warehouses
- **Build**: Warehouse (code, priority, active), Inventory (onHand, reserved, unique
  product×warehouse), CHECK constraints, receipts (idempotent by reference); availability
  derived = onHand−reserved.
- **Deps**: F2-02 · **Entities**: Warehouse, Inventory, InventoryReceipt
- **APIs**: `GET /inventory`, `POST /inventory/receive`
- **UI**: InventoryAvailability component.
- **Rules**: invariants reserved≤onHand, available≥0.
- **Edge**: zero stock, duplicate receipt reference (no double count).

### TASK-F5-02 — Fulfillment order from approved quote
- **Build**: Fulfillment(Order) + FulfillmentLine created on convert-to-fulfillment;
  list w/ filters (pending/allocated/partial/backordered/ready/fulfilled/failed).
- **Deps**: F4-03, F5-01 · **Entities**: Fulfillment, FulfillmentLine
- **APIs**: `GET /fulfillment`, `GET /fulfillment/:id`
- **UI**: fulfillment list, FulfillmentProgress.
- **Rules**: only APPROVED deals convert (spec §9).
- **Edge**: convert non-approved; multi-line, same product lines.

### TASK-F5-03 — AllocationEngine + reservations + backorders (transactional)
- **Build**: priority-fill allocation across warehouses inside a transaction with ordered
  `SELECT ... FOR UPDATE`; reservations; backorders for shortfall; allocation history.
- **Deps**: F5-02 · **Entities**: Allocation, Reservation, Backorder, AllocationHistory
- **APIs**: `POST /fulfillment/:id/allocate|reallocate|fulfill|backorder|cancel-allocation`
- **UI**: AllocationStatus, BackorderIndicator, fulfillment detail (ordered/available/
  allocated/fulfilled/backordered per line).
- **Rules**: never claim fulfilled without real allocation (spec §10); over-allocation
  impossible; cancel-allocation releases reservation + inventory.
- **Acceptance**: ordered 100/avail 60 → allocated 60, backordered 40 shown explicitly.
- **Edge**: concurrent allocation of same stock; receipt triggers backorder reprocessing.

### TASK-F5-04 — Receipt-triggered backorder reallocation
- **Build**: on receipt, process eligible backorders by priority through the engine within
  one transaction; update lines/orders/statuses + audit.
- **Deps**: F5-03 · **Acceptance**: receiving stock fulfills oldest/priority backorders.
- **Edge**: multiple backorders competing for received stock; partial fulfillment.

---

## Phase 6 — Subscription + Billing + Invoices + Payments

### TASK-F6-01 — Subscriptions
- **Build**: Subscription (plan, freq, qty, start/end, recurring amount, status, next
  billing) created optionally from approved quote; list; pause/resume/cancel.
- **Deps**: F4-03 · **Entities**: Subscription, SubscriptionLine
- **APIs**: `GET/POST /subscriptions`, `GET /subscriptions/:id`, `POST .../pause|resume|cancel`
- **Rules**: one-time products bypass subscription (spec §11).
- **Edge**: pause active, cancel past-due, expire.

### TASK-F6-02 — Billing + BillingEngine
- **Build**: BillingAgreement + BillingPeriod schedule; billing detail (customer billing
  info, subscription info, schedule, upcoming/previous invoices); controls generate/adjust/
  pause/resume/cancel.
- **Deps**: F6-01 · **Entities**: BillingAgreement, BillingPeriod
- **APIs**: `GET /billing/:id`, `POST /billing/:id/generate-invoice|adjust|pause|resume`
- **Rules**: all financial actions backend-validated (spec §12).
- **Edge**: generate invoice for already-billed period (idempotent); pause mid-cycle.

### TASK-F6-03 — Invoices + Payments
- **Build**: Invoice (number, dates, amounts, status) + InvoiceLine; Payment; list/detail;
  issue/send/cancel/record-payment; statuses incl. OVERDUE.
- **Deps**: F6-02 · **Entities**: Invoice, InvoiceLine, Payment
- **APIs**: `GET /invoices`, `/invoices/:id`, `POST /invoices/:id/issue|send|cancel|payments`
- **UI**: InvoiceSummary, related-entity nav (customer/quote/order/subscription/billing).
- **Rules**: outstanding = total − paid; transactional payment recording + audit.
- **Edge**: overpayment, partial payment, cancel issued invoice, overdue detection.

---

## Phase 7 — Negotiation / Customer Portal

### TASK-F7-01 — Tokenized customer portal (filtered projection)
- **Build**: portal token issuance from a quote; token-scoped read of customer-safe fields
  only (products, qty, prices, discount, terms, total, validity, delivery); no internal
  data.
- **Deps**: F3-02 · **Entities**: PortalToken · **APIs**: `GET /portal/:token`
- **Rules**: never expose margin/thresholds/notes/risk/allocation internals (ADR-0014).
- **Acceptance**: portal payload contains no internal fields.
- **Edge**: expired/invalid token; revoked after acceptance.

### TASK-F7-02 — Negotiation workflow + re-approval
- **Build**: Negotiation thread + messages; customer actions accept/reject/request-change/
  comment/quantity/price/terms; internal revision creates new quote version.
- **Deps**: F7-01, F4-02 · **Entities**: Negotiation, NegotiationMessage
- **APIs**: `POST /portal/:token/accept|reject|request-change|comment`
- **Rules**: material change to an approved quote → NEGOTIATION/REVISION and **re-enters
  approval** (ADR-0015; spec §13). No bypassing approval rules.
- **Acceptance**: extra-discount request on approved quote forces re-approval.
- **Edge**: concurrent customer + internal edits; accept during pending approval.

---

## Phase 8 — Analytics: Deal Health + Anomaly + Reporting

### TASK-F8-01 — DealHealthEngine + dashboard
- **Build**: engine computing health (Healthy/Warning/Critical) + anomalies (commercial/
  operational/financial/lifecycle) from live domain data; anomaly list w/ severity,
  explanation, recommended action, drill-down link.
- **Deps**: Phases 3–6 · **Entities**: none new (derives from existing) (spec §22)
- **APIs**: `GET /deal-health`
- **Rules**: read/analysis oriented; corrections happen in operational modules (spec §16).
- **Acceptance**: excessive discount → drills to Quote/Approval; low inventory → Fulfillment;
  overdue invoice → Invoice.
- **Edge**: deals stuck in approval/fulfillment; quote nearing expiry; slow negotiation.

### TASK-F8-02 — Reporting dashboard
- **Build**: metrics (revenue, pipeline, approval turnaround, fulfillment perf, backorder
  rate, collections, subscription revenue, discount trends, conversion).
- **Deps**: F8-01 · **APIs**: `GET /reports` · **Rules**: RBAC (mgr/finance/admin).
- **Edge**: empty ranges; large datasets (pagination/aggregation).

---

## Phase 9 — Administration

### TASK-F9-01 — Users/roles/permissions admin
- **Build**: manage users, assign roles, view permissions; RBAC-guarded.
- **Deps**: F1-05 · **APIs**: `GET/POST /admin/users|roles`
- **Edge**: cannot remove last admin; self role-downgrade guard.

### TASK-F9-02 — Config admin (pricing, discount, approval, settings)
- **Build**: admin surfaces for pricing/discount/approval config + system settings.
- **Deps**: F2-03, F4-01 · **Rules**: admin-only; changes audited.
- **Edge**: config change affecting in-flight approvals (versioning note).

---

## Phase 10 — Hardening

### TASK-F10-01 — Permission + audit coverage pass
- **Build**: verify every mutating endpoint is guarded + audited; policy tests.
- **Deps**: Phases 1–9 · **Acceptance**: guard/audit coverage report green.

### TASK-F10-02 — Error/loading/empty/state coverage
- **Build**: ensure every major page implements the §32 states + confirm dialogs.
- **Deps**: Phase 8 · **Acceptance**: each page shows loading/empty/error/unauthorized/404.

### TASK-F10-03 — Responsive pass
- **Build**: responsive layouts; dense tables → horizontal scroll/drawers/cards (spec §33).
- **Deps**: F10-02.

### TASK-F10-04 — Testing (unit/integration/e2e/concurrency)
- **Build**: engine unit tests (pricing, discount, approval-rule, allocation, deal-health,
  state machine); integration (quote→approval→fulfillment→invoice); allocation concurrency
  tests; portal re-approval test.
- **Deps**: all · **Acceptance**: critical-path suites pass against test DB.
- **Edge**: concurrency, idempotency, invalid transitions.

### TASK-F10-05 — Seed demo + one-command local run + README
- **Build**: seed exercising the full deal graph (draft/pending/approved/negotiation/
  partial-fulfillment/backorder/subscription/invoice/overdue); README with docker+migrate+
  seed+run.
- **Deps**: all · **Acceptance**: fresh clone runs end-to-end in a few commands; demo shows
  full lifecycle incl. re-approval and backorder paths.
