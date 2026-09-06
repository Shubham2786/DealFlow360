# Completed Tasks

This file tracks finished, verified, and accepted work.

## Completed Task Template

```markdown
### [TASK-ID]: Task Title

* **Description**: Summary of completed work.
* **Owner**: [Assignee]
* **Status**: Completed
* **Priority**: [Low | Medium | High | Critical]
* **Completed Date**: [YYYY-MM-DD]
* **Dependencies**: [None | Task-ID]
* **Acceptance Criteria**:
  - [x] Criterion 1
  - [x] Criterion 2
* **Notes**: Verification summary, PR links, or deployment notes.
```

---

## Completed Tasks Archive

> DealFlow360 implementation progress. All items below are built and verified on the Docker
> Postgres dev DB and pushed to `main` (except the most recent RBAC/consistency batch — see
> CURRENT.md). Full detail in `docs/CODEBASE.md`.

### Foundation & platform
- **F1** Monorepo (pnpm workspaces), Docker Postgres, Prisma bootstrap, NestJS + Next.js shells.
- **F4** Auth: JWT access+refresh cookies, argon2 hashing, refresh rotation. Verified e2e.

### RBAC (normalized)
- Role / Permission / RolePermission tables; `User.roleId/status/tokenVersion`.
- Roles USER/MANAGER/FINANCE/ADMIN + permission matrix seeded.
- Public signup always → USER (client `role` rejected 400).
- `@RequirePermissions` + `PermissionsGuard`; `JwtAuthGuard` loads role+permissions and
  enforces token versioning.
- Admin-only `PATCH /users/:id/role` (bumps tokenVersion, revokes refresh tokens).
- Verified: signup→USER, escalation→403, session invalidation→401, re-login reflects role.

### Core domain
- **Audit** log + activity feed (global service).
- **Customers**, **Products** (catalog, create, activate/deactivate).
- **Quotations** + lifecycle (`DealStateMachine`), list/detail UI, server-side pricing/margin.
- **Approvals** — `ApprovalRuleEngine` (discount/margin/value → dynamic chain), decisions
  drive quotation lifecycle; list/detail UI. Verified multi-step + RBAC.
- **Fulfillment / Inventory / Allocation / Backorders** — `AllocationEngine`, row-locked
  transactional allocation, reservations, idempotent receipts, backorder reprocessing,
  fulfill. Verified e2e (allocate 8 / backorder 2 / receive → reallocate / fulfill).
### Core domain & lifecycle extensions
- **Resource Ownership** (`DEAL_VIEW_OWN`): Quotations carry `createdById`; list queries and detail fetches are strictly scoped to the creator unless `DEAL_VIEW_TEAM` or `ADMIN` is held.
- **Negotiation / Customer Portal** (`TASK-F7`): Tokenized portal projection (`/portal/:token`) for external customer counter-offers, discount requests, acceptance, and quotation status synchronization.
- **Subscriptions** (`TASK-F6-01`): `Subscription` and `SubscriptionLine` data models, `SubscriptionsService` with lifecycle controls (`pause`, `resume`, `cancel`), and `/subscriptions` management UI with frequency, INR totals, and status filters.
- **Billing / Invoices / Payments** — GST invoices from fulfilled deals, partial/full payments → deal COMPLETED, overpayment guard. Verified e2e.

### Analytics, Administration & UX
- **Role-Specific Dashboards**: Variant-aware metrics for `USER` (My Deals), `MANAGER` (approvals/fulfillment), `FINANCE` (collections/overdue), and `ADMIN` (system overview).
- **Reports Dashboard** (`TASK-F8-02`): Comprehensive company-wide performance metrics, deal conversion rates, and revenue breakdowns at `/reports`.
- **Admin Configuration UI** (`TASK-F9-02`): Dedicated interface at `/admin/config` for system settings, policy thresholds, and environment inspection.
- **Edge Cases & Multi-Persona Dashboards Hardening**:
  - Added dedicated `CUSTOMER` role & Customer Portal & Dashboard variant (`VARIANT_META.CUSTOMER`) showing company-scoped commercial proposals, invoices, subscriptions, and dedicated account manager contact card.
  - Implemented ADR-0014 margin redaction: internal profit margins (`marginPct`) and cost estimates are strictly hidden from customer API endpoints and UI surfaces.
  - Fixed inventory reservation leaks on deal cancellation: active reservations are un-reserved and released (`ReservationStatus.RELEASED`), fulfillment marked `FAILED`, and backorders `CANCELLED`.
  - Added strict pricing and validation floors: discounts validated between `0%` and `100%`, unit prices >= 0, and customer existence verified before quote creation.
  - Enforced idempotency on approval decisions: `reject` and `requestChanges` reject already finalized requests.
  - Guarded public portal negotiations against duplicate accept/reject actions.
  - Added quick demo persona switcher on login page for Admin, Manager, Finance, Sales, and Customer testing.
  - 5 test suites (27 unit tests) passing with 100% success rate.
- **Sales Dashboard** (KPIs/alerts/activity) + **Deal Health** anomaly dashboard.
- India localization: INR (₹) + GST + en-IN formatting; INR-scaled approval thresholds.
- UX: header user menu + Logout, active-nav highlight, permission-filtered nav, Customers, Admin Users, Subscriptions, and Admin Config pages.
- Real-time refresh: TanStack Query refetch + broad invalidation after mutations.

- **Production Hardening, Governance Engine & Quotation Builder** (`TASK-F10`):
  - Created missing Prisma migration for `Subscription` & `SubscriptionLine` models (`20260905183000_subscriptions`).
  - Fixed frontend crash: moved `usePermissions()` unconditionally to top in `invoices/[id]/page.tsx`.
  - Advanced `ApprovalRuleEngine` with blended risk scoring (0-100), category-specific discount ceilings across customer tiers (STANDARD, SMB, ENTERPRISE, STRATEGIC), and automatic detection of `unitPrice` markdown bypasses.
  - Interactive Quotation Builder at `/quotations/new` with product catalog, category tabs, +/- quantity controls, unit price discount detection, live pricing totals, margin badge, and live approval tier preview chip.
  - Closed backend authorization holes on quotation actions (`submit`, `cancel`, `revise`), subscriptions mutations, customer creation, and gated inventory/fulfillment reads against `CUSTOMER` role.
  - Transactional state machines in `submitQuotation`, `approve`, `reject`, `requestChanges`, and `payments`.
  - Re-read quotation lines inside transaction lock during fulfillment allocation to eliminate race conditions.
  - Converted quotation and invoice numbering to safe monotonically increasing sequence generation.
  - Fixed invoice cancellation dead-end: reverted quotation state from `INVOICED` to `FULFILLED` to enable re-invoicing.
  - Rep negotiation workflow: added counter-discount application (`apply-counter-discount`) and salesperson reply endpoint (`reply`).
  - Upgraded `LifecycleStepper` with all pipeline states and active branch status badges (`NEGOTIATION`, `CHANGES_REQUESTED`, `REJECTED`, `CANCELLED`).
  - Global `ToastProvider` and `useToast` integrated into `AppShell` for user action feedback.
  - Complete analysis documentation published to `docs/Analysis.md`.
- **Dynamic Configuration & UX Lifecycle Hardening** (`TASK-F11`):
  - **Truthful Cost & Margins**: Added `costPrice` to Prisma `Product` schema (`20260906010000_product_cost_price`), seeded realistic cost prices for all SKUs, and eliminated all hardcoded `* 0.7` cost assumptions.
  - **Dynamic In-Memory Cached Configuration**: Created `@Global()` `AppSettingsService` backed by database table `app_settings` with 60s TTL cache, atomic batch updates, and `GET /api/admin/config/public` endpoint.
  - **Zero-Hardcoding Governance Engine**: `ApprovalRuleEngine` dynamically pulls discount auto-approval thresholds, manager/finance/exec ceilings, margin floors, deal value limits, and category ceilings matrix from `AppSettingsService`.
  - **Configurable Prefixes & Terms**: Dynamic generation of `quotation_prefix` (e.g. `Q-`), `invoice_prefix` (e.g. `INV-`), `subscription_prefix` (e.g. `SUB-`), and dynamic due date calculation via `default_payment_terms_days`.
  - **Customer Portal Navigation & UX Flow**: Eliminated dead-end in customer portal with header navigation bar (`← Back to Dashboard`, `My Proposals`), full counter-negotiation audit thread, and active negotiation status banners.
  - **Calculation Integrity**: Healed seeded quotation line items and dynamic discount/subtotal rendering across customer and internal quotation views.
  - **Enhanced Admin Settings UI**: Upgraded `/admin/config` with dedicated controls for document prefixes, payment due days, tiered discount thresholds, margin floors, deal value triggers, and category ceiling JSON editor.

- **Security Vulnerability Audit & Enterprise Hardening** (`TASK-F12`):
  - **Separation of Duties (SoD) / Self-Approval Prevention**: Enforced the Four-Eyes Principle in `ApprovalsService.assertCanAct`, disallowing deal authors or salespersons from approving their own quotations unless acting as system `ADMIN`.
  - **Negotiation IDOR & Portal Token Exposure**: Injected `QuotationsService` into `NegotiationController` to enforce ownership and access control; stripped raw customer portal tokens from internal API thread responses.
  - **Invoice & Subscription Access Scoping**: Replaced unrestricted wildcard queries with rep-scoped filters (`createdById`/`salespersonId`) in `BillingService` and `SubscriptionsService` so non-finance users cannot access other customers' financial records.
  - **Payment TOCTOU Race Condition Remediation**: Wrapped payment recording in atomic transactions with row-level locking (`SELECT ... FOR UPDATE`), eliminating double-spending and balance-overflow vulnerabilities.
  - **Customer Tier Escalation Guard**: Restricted assignment of privileged customer segments (`ENTERPRISE`, `STRATEGIC`) to `MANAGER` / `ADMIN` in `CustomersController`.
  - **Quotation Expiry Enforcement**: Customer portal now checks and rejects acceptance of expired proposals.
  - **Refresh Token Replay Defense**: Re-presentation of an already-revoked refresh token now invalidates all active sessions for the user account.
  - **Config DTO Validation**: Converted `UpdateConfigDto` into a class with `class-validator` decorators and prototype pollution protection.

### Authentication & Navigation Hardening
- **Login Single-Entry & Session Stability**:
  - Eliminated the double credential entry bug by preventing browser native form GET reload (`action="javascript:void(0);"`, form submit event suppression, and type="submit" safeguarding).
  - Prevented auth cache race condition between TanStack Query and HTTP cookie set by adding `staleTime: 60_000` to `useCurrentUser` and transitioning directly with browser window location.
  - Implemented 1-click demo login buttons for seamless testing across Admin, Manager, Finance, Sales, and Customer roles without manual multi-click delays.
  - Added automatic redirect to `/dashboard` for users who navigate to `/auth/login` while already authenticated.
- **Universal Back Navigation**:
  - Added `← Back to Dashboard` navigation button on `/deal-health`.
  - Added `← Back to Dashboard` navigation button on `/reports`.
  - Added `← Back to Dashboard` navigation button on `/admin/config`.
  - Added `← Back to Configuration` and `Dashboard` navigation buttons on `/admin/users`.
  - Added `← Back to Sign in` navigation button on `/auth/signup`.
  - Upgraded and standardized prominent pill back buttons across detail pages (`/quotations/new`, `/quotations/[id]`, `/invoices/[id]`, `/fulfillment/[id]`, `/approvals/[id]`).

### Customer Self-Service Ordering & Inbound RFQ
- **Dedicated Customer Order Endpoint**: Added `POST /quotations/customer-order` restricted to `UserRole.CUSTOMER`. Auto-resolves customer entity from `user.email`, assigns dedicated salesperson, validates products against active catalog, creates quotation in `NEGOTIATION` with truthful GST/pricing, and issues active customer portal token.
- **Interactive Catalog & Order Builder (`/products`)**:
  - Exposed `Order Products` in `CUSTOMER_NAV` for customers.
  - Implemented customer self-service order mode with category filter tabs, product search, stepper quantity selectors (`-` / `+`), and "Add to Order".
  - Live Order Request Summary panel with subtotal, 18% GST calculation, and purchase notes input.
  - Direct instant navigation to digital customer portal (`/customer-portal/[token]`) upon order submission for review & signing.
- **Prominent Navigation Entrypoints**:
  - Added `+ Place New Order` button on Customer Dashboard header (`/dashboard`).
  - Added `+ Place New Order` button on Customer Proposals list (`/quotations`).

### Tests & Verification
- Unit & Security tests:
  - `PermissionsGuard` (allow/deny/admin/unauth)
  - `ApprovalRuleEngine` (blended risk score, category ceilings, customer tiers, unitPrice bypass)
  - `DealStateMachine` (valid transitions, terminal state enforcement, illegal transition rejection)
  - `AllocationEngine` (priority warehouse allocation, partial splits, backorder generation)
  - `QuotationsEdgeCases` (validation floors, discount ranges, customer existence, customer role margin redaction, customer self-service order request validation)
  - `ApprovalsSecurity` (Separation of Duties self-approval rejection, admin break-glass, IDOR scoping)
  - `NegotiationSecurity` (Quotation expiry rejection on portal acceptance, valid acceptance)
  - `BillingSecurity` (Invoice IDOR scoping for sales reps, payment overpayment prevention)
  - `AuthSecurity` (Refresh token replay attack detection and user session family revocation)
  - 9 test suites (44 unit and security tests) passing green with 100% success rate.
  - Next.js production build (`next build`) passing clean with zero errors across all 20 routes.

