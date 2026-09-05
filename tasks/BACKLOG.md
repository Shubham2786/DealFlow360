# Task Backlog

This file tracks planned, unstarted tasks for future work across the team.

## Task Template

```markdown
### [TASK-ID]: Task Title

* **Description**: Brief explanation of the goal and context.
* **Owner**: Unassigned / [Assignee]
* **Status**: Backlog
* **Priority**: [Low | Medium | High | Critical]
* **Dependencies**: [None | Task-ID]
* **Acceptance Criteria**:
  - [ ] Criterion 1
  - [ ] Criterion 2
* **Notes**: Additional context, references, or constraints.
```

---

> **Live status:** The entire functional scope is delivered and verified — see `tasks/COMPLETED.md`
> for full details and `tasks/CURRENT.md` for active status. Delivered: foundation, auth, **RBAC**,
> audit, customers, products, pricing, quotations+lifecycle, approvals, fulfillment/allocation/
> backorders, billing/invoices/payments, India (INR/GST) localization, resource ownership,
> role-specific dashboards, negotiation portal, reporting, subscriptions, admin config UI,
> and engine tests. Only the local-Postgres host switch remains paused.

## Backlog Items — DealFlow360

> Full specifications (Build, Deps, Entities, APIs, UI, Rules, Acceptance, Edge cases) for
> every task live in `/tasks.md`. Items below track status and dependencies in dependency
> order. DealFlow360 is the authoritative product (ADR-0010); the earlier inventory-only
> backlog is folded into Phase 5 (Fulfillment).

### Phase 1 — Foundation

### TASK-F1-01: Monorepo + tooling
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: None
### TASK-F1-02: Docker Compose PostgreSQL + Prisma bootstrap
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F1-01
### TASK-F1-03: NestJS shell + Next.js shell
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F1-01
### TASK-F1-04: Auth — schema, endpoints, sessions
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F1-02, TASK-F1-03
### TASK-F1-05: RBAC guards + route protection
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F1-04
### TASK-F1-06: Audit foundation
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: TASK-F1-02

### Phase 2 — Customer + Product + Pricing

### TASK-F2-01: Customers module
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: TASK-F1-05
### TASK-F2-02: Product catalog
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: TASK-F1-05
### TASK-F2-03: Pricing & pricelists + PricingEngine
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: TASK-F2-01, TASK-F2-02

### Phase 3 — Quotation + pricing calculation

### TASK-F3-01: Quotation schema + list
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F2-03
### TASK-F3-02: Quotation detail + line pricing
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F3-01, TASK-F2-03
### TASK-F3-03: Quotation lifecycle actions + DealStateMachine
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F3-02, TASK-F1-06

### Phase 4 — Approval

### TASK-F4-01: Discount tiers & approval config
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F1-05
### TASK-F4-02: ApprovalRuleEngine + request creation
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F4-01, TASK-F3-03
### TASK-F4-03: Approval List + Detail + decisions
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F4-02

### Phase 5 — Fulfillment / Inventory / Allocation / Backorders

### TASK-F5-01: Inventory + warehouses
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F2-02
### TASK-F5-02: Fulfillment order from approved quote
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F4-03, TASK-F5-01
### TASK-F5-03: AllocationEngine + reservations + backorders (transactional)
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F5-02
### TASK-F5-04: Receipt-triggered backorder reallocation
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: TASK-F5-03

### Phase 6 — Subscription + Billing + Invoices + Payments

### TASK-F6-01: Subscriptions
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: TASK-F4-03
### TASK-F6-02: Billing + BillingEngine
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: TASK-F6-01
### TASK-F6-03: Invoices + Payments
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F6-02

### Phase 7 — Negotiation / Customer Portal

### TASK-F7-01: Tokenized customer portal (filtered projection)
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: TASK-F3-02
### TASK-F7-02: Negotiation workflow + re-approval
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: TASK-F7-01, TASK-F4-02

### Phase 8 — Analytics: Deal Health + Reporting

### TASK-F8-01: DealHealthEngine + dashboard
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: Phases 3–6
### TASK-F8-02: Reporting dashboard
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Medium · **Dependencies**: TASK-F8-01

### Phase 9 — Administration

### TASK-F9-01: Users/roles/permissions admin
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: TASK-F1-05
### TASK-F9-02: Config admin (pricing, discount, approval, settings)
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Medium · **Dependencies**: TASK-F2-03, TASK-F4-01

### Phase 10 — Hardening

### TASK-F10-01: Permission + audit coverage pass
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: Phases 1–9
### TASK-F10-02: Error/loading/empty/state coverage
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: Phase 8
### TASK-F10-03: Responsive pass
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Medium · **Dependencies**: TASK-F10-02
### TASK-F10-04: Testing (unit/integration/e2e/concurrency)
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: Critical · **Dependencies**: All
### TASK-F10-05: Seed demo + one-command local run + README
* **Owner**: Unassigned · **Status**: Backlog · **Priority**: High · **Dependencies**: All
