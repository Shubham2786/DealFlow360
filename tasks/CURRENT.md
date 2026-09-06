# Current Tasks

This file tracks active work in progress by developers and AI agents.

## Task Template

```markdown
### [TASK-ID]: Task Title

* **Description**: Brief explanation of the active goal.
* **Owner**: [Assignee]
* **Status**: In Progress
* **Priority**: [Low | Medium | High | Critical]
* **Dependencies**: [None | Task-ID]
* **Acceptance Criteria**:
  - [ ] Criterion 1
  - [ ] Criterion 2
* **Notes**: Implementation notes or blockers.
```

---

## Active Tasks

### Local-Postgres host switch — PAUSED
* **Status**: Paused (by request)
* **Notes**: App runs on Docker Postgres (port 5433). `.env.example` documents the local
  (5432) option; the database schema is synchronized and tested. No blocker — decoupled from feature work.

---

## Finished Work (Verified & Complete)
* **RBAC & Real-Time Updates**: Verified end-to-end with token versioning and permission guards.
* **Resource Ownership**: Scoped deals with `createdById` and creator visibility constraints.
* **Role-Specific Dashboards**: Dynamic KPI variants for USER, MANAGER, FINANCE, ADMIN.
* **Customer Negotiation Portal**: Tokenized projection, counter-offers, and status updates.
* **Subscriptions Module**: Model, service, controller, and UI with pause/resume/cancel + migration.
* **Admin Configuration UI**: System settings, approval thresholds, and environment overview at `/admin/config`.
* **Hardening & Governance Engine**: Blended risk score (0-100), category discount ceilings across customer tiers, unitPrice bypass detection, transactional safety, authorization guards, safe sequence generation, and invoice cancellation reversion.
* **Testing**: 5 test suites (29 unit tests) covering guards, state machine, approval rules, allocation engine, and quotation validation passing green. Full Next.js production build passing clean with zero errors across 20 routes.
* **Dynamic Configuration Architecture & Zero-Hardcoding Engine**: Centralized in-memory cached `AppSettingsService`, dynamic prefixes (`quotation_prefix`, `invoice_prefix`, `subscription_prefix`), dynamic due days, dynamic multi-tier discount ceilings, and dynamic category ceiling matrices.
* **Truthful Margins & Cost Engine**: Prisma `costPrice` on `Product`, real cost accounting, eliminating arbitrary `* 0.7` cost fixtures.
* **Customer UX & Negotiation Portal Overhaul**: Complete navigation pathing, conversation thread audit trail, real-time negotiation status, and mathematical discount calculation integrity.
