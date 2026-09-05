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

### RBAC + real-time consistency — verified, pending commit
* **Status**: In Progress (code complete + verified; **not yet committed** to `main`)
* **Notes**: Normalized RBAC, permission guards, signup→USER, admin role assignment with
  token versioning, permission-gated frontend, and broad query invalidation for real-time
  updates. Needs commit + push. See `docs/CODEBASE.md` §1.

### Local-Postgres host switch — PAUSED
* **Status**: Paused (by request)
* **Notes**: App runs on Docker Postgres (port 5433). `.env.example` documents the local
  (5432) option; the `rbac` migration is valid and will apply via `prisma migrate deploy`
  when switched. No blocker — decoupled from feature work.

### Next up (not started)
* **Resource ownership** — add `createdById` to quotations + ownership check so
  `DEAL_VIEW_OWN` means "own" (RBAC spec §9). Prerequisite for role dashboards.
* **Role-specific dashboards** — USER=my deals, MANAGER=approvals/team, FINANCE=collections,
  ADMIN=full overview.
