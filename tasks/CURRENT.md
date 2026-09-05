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
* **Subscriptions Module**: Model, service, controller, and UI with pause/resume/cancel.
* **Admin Configuration UI**: System settings, approval thresholds, and environment overview at `/admin/config`.
* **Testing & Hardening**: 4 test suites (21 unit tests) covering guards, state machine, approval rules, and allocation engine.
