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

### Tests
- Unit tests:
  - `PermissionsGuard` (allow/deny/admin/unauth)
  - `ApprovalRuleEngine` (multi-level dynamic chains)
  - `DealStateMachine` (valid transitions, terminal state enforcement, illegal transition rejection)
  - `AllocationEngine` (priority warehouse allocation, partial splits, backorder generation)
  - All 4 test suites (21 unit tests) passing green.
