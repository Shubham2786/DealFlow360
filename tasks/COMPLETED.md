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
- **Billing / Invoices / Payments** — GST invoices from fulfilled deals, partial/full
  payments → deal COMPLETED, overpayment guard. Verified e2e.

### Analytics & UX
- **Sales Dashboard** (KPIs/alerts/activity) + **Deal Health** anomaly dashboard.
- India localization: INR (₹) + GST + en-IN formatting; INR-scaled approval thresholds.
- UX: header user menu + Logout, active-nav highlight, permission-filtered nav,
  Customers + Admin Users pages.
- Real-time refresh: TanStack Query refetch + broad invalidation after mutations.

### Tests
- Unit tests: `PermissionsGuard` (allow/deny/admin/unauth), `ApprovalRuleEngine` (chains).
