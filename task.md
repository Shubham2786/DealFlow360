# Task Breakdown — Inventory Allocation & Backorder Management System

Dependency-ordered, independently executable tasks derived from `project.md`. Each task
is small enough to implement without re-deciding architecture. Statuses are mirrored into
`tasks/BACKLOG.md` / `CURRENT.md` / `COMPLETED.md`.

Legend: **Deps** = prerequisite task IDs. Priority: Critical/High/Medium/Low.

---

## Phase 1 — Foundation

### TASK-FND-001 — Initialize pnpm monorepo
- **Objective**: Create the monorepo skeleton (`apps/web`, `apps/api`, `packages/shared`,
  root `prisma/`, `docker/`) with pnpm workspaces and shared TS config.
- **Deps**: none · **Priority**: Critical
- **Files**: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`,
  `.editorconfig`, `README.md`
- **Requirements**: workspace globs for apps/* and packages/*; root scripts to run
  api/web/prisma; Node/TS versions pinned.
- **Acceptance**: `pnpm install` succeeds; `pnpm -r list` shows all workspaces.
- **Testing**: n/a (scaffold); verify install + workspace resolution.

### TASK-FND-002 — Docker Compose for local PostgreSQL
- **Objective**: Local PostgreSQL via Docker Compose with a named volume and healthcheck.
- **Deps**: TASK-FND-001 · **Priority**: Critical
- **Files**: `docker-compose.yml`, `docker/`, `.env.example`
- **Requirements**: postgres:16, env-driven credentials, port 5432, persistent volume,
  healthcheck. `DATABASE_URL` documented in `.env.example`.
- **Acceptance**: `docker compose up -d` starts a healthy postgres; connection succeeds.
- **Testing**: manual `pg_isready` / psql connect.

### TASK-FND-003 — Scaffold NestJS backend (apps/api)
- **Objective**: Baseline NestJS app with config module, global validation pipe, `/api`
  prefix, health endpoint.
- **Deps**: TASK-FND-001 · **Priority**: Critical
- **Files**: `apps/api/*` (main.ts, app.module.ts, health controller), `apps/api/tsconfig`
- **Requirements**: `ValidationPipe({whitelist,transform})` global; env via `@nestjs/config`;
  CORS enabled for the web origin.
- **Acceptance**: `pnpm --filter api start:dev` boots; `GET /api/health` returns 200.
- **Testing**: e2e smoke test hitting `/api/health`.

### TASK-FND-004 — Scaffold Next.js frontend (apps/web)
- **Objective**: Baseline Next.js (App Router) + Tailwind, API base URL via env, shared
  layout shell.
- **Deps**: TASK-FND-001 · **Priority**: High
- **Files**: `apps/web/*`, Tailwind config, `app/layout.tsx`, API client util.
- **Acceptance**: `pnpm --filter web dev` serves a page reading `NEXT_PUBLIC_API_URL`.
- **Testing**: manual load; lint passes.

### TASK-FND-005 — Integrate Prisma + PrismaService
- **Objective**: Add Prisma to the API with a `PrismaService` (connect/disconnect
  lifecycle) and generate client.
- **Deps**: TASK-FND-002, TASK-FND-003 · **Priority**: Critical
- **Files**: `prisma/schema.prisma` (datasource+generator only initially),
  `apps/api/src/prisma/*`
- **Acceptance**: `pnpm prisma generate` works; PrismaService connects on boot.
- **Testing**: integration test that runs a trivial `$queryRaw SELECT 1`.

---

## Phase 2 — Database

### TASK-DB-001 — Define full Prisma domain schema
- **Objective**: Model Product, Warehouse, Inventory, Order, OrderLine, Reservation,
  Allocation, Backorder, InventoryReceipt, AllocationHistory + enums per `project.md` §7.
- **Deps**: TASK-FND-005 · **Priority**: Critical
- **Files**: `prisma/schema.prisma`, `packages/shared` enum mirrors
- **Requirements**: relations, unique constraints (`sku`, `code`, `orderNumber`,
  `inventory(productId,warehouseId)`, `receipt.reference`), enums for all statuses/priority.
- **Acceptance**: `prisma validate` passes; relations match domain diagram.
- **Testing**: schema validation; generated client compiles.

### TASK-DB-002 — CHECK constraints & indexes migration
- **Objective**: Add CHECK constraints (`onHand>=0`, `reserved>=0`, `reserved<=onHand`,
  positive quantities, `allocatedQty+backorderedQty<=requestedQty`) and required indexes.
- **Deps**: TASK-DB-001 · **Priority**: Critical
- **Files**: `prisma/migrations/*` (raw SQL for CHECKs), schema `@@index` directives
- **Requirements**: indexes from `project.md` §8; CHECKs added via migration SQL.
- **Acceptance**: `prisma migrate dev` applies cleanly; inserting violating rows fails.
- **Testing**: integration test asserting constraint violations are rejected.

### TASK-DB-003 — Seed data script
- **Objective**: Idempotent `prisma/seed.ts` producing products, warehouses, inventory
  distributions, and demo orders per `project.md` §21.
- **Deps**: TASK-DB-002 · **Priority**: High
- **Files**: `prisma/seed.ts`, seed npm script
- **Acceptance**: `pnpm prisma db seed` populates deterministic demo data; re-running does
  not duplicate.
- **Testing**: run seed twice; assert row counts stable.

---

## Phase 3 — Core CRUD

### TASK-CRUD-001 — Products module
- **Objective**: CRUD for products with SKU uniqueness + validation.
- **Deps**: TASK-DB-002 · **Priority**: High
- **Files**: `apps/api/src/products/*` (controller, service, DTOs)
- **Requirements**: `GET/POST /products`, `GET/PATCH /products/:id`; duplicate SKU →
  409; `active` toggle.
- **Acceptance**: endpoints work; duplicate SKU rejected with clear error.
- **Testing**: integration tests for create/list/get/patch + duplicate SKU.

### TASK-CRUD-002 — Warehouses module
- **Objective**: CRUD for warehouses with code uniqueness + `priority`.
- **Deps**: TASK-DB-002 · **Priority**: High
- **Files**: `apps/api/src/warehouses/*`
- **Requirements**: `GET/POST /warehouses`, `GET/PATCH /warehouses/:id`; duplicate code →
  409; `active` toggle.
- **Acceptance**: endpoints work; duplicate code rejected.
- **Testing**: integration tests incl. duplicate code.

### TASK-CRUD-003 — Inventory read + availability
- **Objective**: Inventory queries with derived `available = onHand - reserved`.
- **Deps**: TASK-CRUD-001, TASK-CRUD-002 · **Priority**: High
- **Files**: `apps/api/src/inventory/*`
- **Requirements**: `GET /inventory` (filter by product/warehouse), `GET /inventory/:id`;
  `available` computed, never persisted.
- **Acceptance**: available reflects onHand/reserved correctly.
- **Testing**: unit test for availability calc; integration for listing.

### TASK-CRUD-004 — Orders + order lines creation
- **Objective**: Create orders with ≥1 line; generate `orderNumber`; initial status
  `CREATED`/`PENDING_ALLOCATION`.
- **Deps**: TASK-CRUD-001 · **Priority**: High
- **Files**: `apps/api/src/orders/*`, `apps/api/src/order-lines/*`
- **Requirements**: `POST /orders` validates ≥1 line, qty>0, product exists;
  `GET /orders`, `GET /orders/:id` with lines.
- **Acceptance**: order with lines persisted; empty order / qty<=0 rejected.
- **Testing**: integration for create/list/get + validation failures.

---

## Phase 4 — Allocation Engine

### TASK-ALLOC-001 — Inventory availability calculation (pure)
- **Objective**: Pure function computing available quantity and per-warehouse snapshot.
- **Deps**: TASK-CRUD-003 · **Priority**: Critical
- **Files**: `apps/api/src/allocation/engine/availability.ts`
- **Acceptance**: `available = onHand - reserved`, clamped ≥0; inactive warehouses/products
  excluded.
- **Testing**: unit tests incl. zero, reserved==onHand, inactive exclusion.

### TASK-ALLOC-002 — Deterministic warehouse ranking (pure)
- **Objective**: Rank eligible warehouses by `priority` asc, tiebreak `code` asc; strategy
  id parameter.
- **Deps**: TASK-ALLOC-001 · **Priority**: Critical
- **Files**: `apps/api/src/allocation/engine/ranking.ts`
- **Acceptance**: stable deterministic ordering; configurable, not hardcoded in UI.
- **Testing**: unit tests for ordering and tiebreaks.

### TASK-ALLOC-003 — Allocation plan computation (pure engine)
- **Objective**: Given outstanding qty + ranked availability, produce `AllocationPlan`
  (per-warehouse quantities, totalAllocated, backordered, reason[]).
- **Deps**: TASK-ALLOC-002 · **Priority**: Critical
- **Files**: `apps/api/src/allocation/engine/allocation-engine.ts`
- **Acceptance**: full allocation, partial allocation, and full-backorder cases match
  `project.md` examples; `allocated+backordered == requested`.
- **Testing**: unit tests: requested=10/avail=6 → alloc 6 backorder 4; multi-warehouse
  split; zero availability.

### TASK-ALLOC-004 — Transactional reservation + allocation persistence
- **Objective**: `ReservationService` + `AllocationService` persist a plan inside one
  transaction with `SELECT ... FOR UPDATE` inventory locks.
- **Deps**: TASK-ALLOC-003, TASK-CRUD-004 · **Priority**: Critical
- **Files**: `apps/api/src/reservations/*`, `apps/api/src/allocation/allocation.service.ts`
- **Requirements**: lock inventory rows ordered by id; create reservations + allocations;
  increment `inventory.reserved`; update order line qty; write audit; enforce invariant 5.
- **Acceptance**: reserved increments exactly; invariants 1–5, 7 hold; over-allocation
  impossible.
- **Testing**: integration: allocate order, assert reservations/inventory/line state.

### TASK-ALLOC-005 — Allocate order endpoint + lifecycle wiring
- **Objective**: `POST /orders/:id/allocate` and `POST /allocation/order/:orderId` invoke
  AllocationService for all lines and update order status.
- **Deps**: TASK-ALLOC-004, TASK-LIFE-001 · **Priority**: Critical
- **Files**: `apps/api/src/allocation/allocation.controller.ts`, orders controller
- **Requirements**: idempotent (only outstanding qty allocated); sets FULLY/PARTIALLY
  allocated / backordered.
- **Acceptance**: repeated calls do not double-allocate; status reflects result.
- **Testing**: integration incl. repeat-call idempotency.

### TASK-ALLOC-006 — Allocation history / audit
- **Objective**: `AuditService` writes `AllocationHistory` for every allocation decision;
  expose `GET /allocation/history` and `GET /allocation/order/:orderId`.
- **Deps**: TASK-ALLOC-004 · **Priority**: High
- **Files**: `apps/api/src/audit/*`
- **Requirements**: capture warehouse, inventory, qty, source, strategy, reason, timestamp.
- **Acceptance**: history entries created within the same transaction as allocation.
- **Testing**: integration asserting audit rows per allocation.

---

## Phase 5 — Backorders

### TASK-BO-001 — Backorder creation + lifecycle
- **Objective**: `BackorderService` creates/updates backorders from allocation shortfall;
  status derived from `remainingQty`.
- **Deps**: TASK-ALLOC-004 · **Priority**: Critical
- **Files**: `apps/api/src/backorders/*`
- **Requirements**: OPEN/PARTIALLY_ALLOCATED/FULFILLED/CANCELLED; invariant 6 enforced.
- **Acceptance**: shortfall creates backorder with correct qty/status; no duplication on
  re-allocation.
- **Testing**: unit for status derivation; integration for creation.

### TASK-BO-002 — Backorder prioritization
- **Objective**: Deterministic ordering: order priority → backorder createdAt → order
  createdAt.
- **Deps**: TASK-BO-001 · **Priority**: High
- **Files**: `apps/api/src/backorders/prioritization.ts`
- **Acceptance**: ordering matches `project.md` §15.
- **Testing**: unit tests for priority vs FIFO tiebreaks.

### TASK-BO-003 — Backorder retry endpoint
- **Objective**: `POST /backorders/:id/retry` re-runs the engine for a single backorder's
  remaining qty.
- **Deps**: TASK-BO-001, TASK-ALLOC-004 · **Priority**: Medium
- **Files**: backorders controller
- **Acceptance**: allocates only remaining qty; fulfilled backorder retry is a no-op.
- **Testing**: integration incl. no-op on fulfilled.

---

## Phase 6 — Inventory Receipts

### TASK-RCPT-001 — Idempotent inventory receipt
- **Objective**: `POST /inventory/receive` creates a receipt (unique `reference`) and
  increases `onHand` transactionally.
- **Deps**: TASK-CRUD-003 · **Priority**: Critical
- **Files**: `apps/api/src/receipts/*`
- **Requirements**: qty>0; duplicate `reference` does not double inventory.
- **Acceptance**: onHand increases once per reference; duplicate is no-op/conflict.
- **Testing**: integration incl. duplicate reference idempotency.

### TASK-RCPT-002 — Receipt-triggered backorder allocation
- **Objective**: After a receipt, within the same transaction, process eligible backorders
  by priority through the engine, creating reservations and reducing remaining qty.
- **Deps**: TASK-RCPT-001, TASK-BO-002, TASK-ALLOC-004 · **Priority**: Critical
- **Files**: `apps/api/src/receipts/receipt.service.ts`
- **Requirements**: locks inventory; updates lines/orders/backorders/statuses; audits with
  `source=BACKORDER`.
- **Acceptance**: matches end-to-end scenario in brief §21 (receive 4 → backorder 3
  fulfilled → 1 remains).
- **Testing**: integration replicating the brief scenario.

---

## Phase 7 — Lifecycle & Cancellation

### TASK-LIFE-001 — Order lifecycle state machine
- **Objective**: `OrderLifecycleService` with an explicit transition table; reject invalid
  transitions.
- **Deps**: TASK-CRUD-004 · **Priority**: Critical
- **Files**: `apps/api/src/orders/lifecycle.service.ts`
- **Acceptance**: transition table matches `project.md` §10; invalid transitions throw.
- **Testing**: unit tests for valid + rejected transitions.

### TASK-LIFE-002 — Order cancellation with reservation release
- **Objective**: `POST /orders/:id/cancel` releases ACTIVE reservations, decrements
  `inventory.reserved`, cancels allocations/backorders, sets order CANCELLED, optionally
  reprocesses waiting backorders.
- **Deps**: TASK-LIFE-001, TASK-ALLOC-004, TASK-BO-001 · **Priority**: Critical
- **Files**: orders controller/service
- **Requirements**: invariant 7; cannot cancel FULFILLED; double-cancel is a no-op.
- **Acceptance**: released inventory becomes available; reserved never goes negative.
- **Testing**: integration: allocate → cancel → assert inventory/reservations restored.

---

## Phase 8 — Frontend

### TASK-FE-001 — API client + shared types
- **Objective**: Typed fetch client in web consuming `packages/shared` contracts.
- **Deps**: TASK-CRUD-004, TASK-FND-004 · **Priority**: High
- **Files**: `apps/web/lib/api/*`
- **Acceptance**: typed calls for all endpoints; error handling surface.
- **Testing**: manual + type-check.

### TASK-FE-002 — Dashboard page
- **Objective**: Summary tiles + recent activity per `project.md` §19.
- **Deps**: TASK-FE-001, TASK-ALLOC-006 · **Priority**: High
- **Files**: `apps/web/app/(dashboard)/page.tsx`
- **Acceptance**: shows counts, awaiting/partial orders, open backorders, recent receipts +
  allocations; loading/empty states.
- **Testing**: manual against seeded data.

### TASK-FE-003 — Orders list + order detail
- **Objective**: Orders table and detail with lines, allocation breakdown, reservations,
  lifecycle history.
- **Deps**: TASK-FE-001, TASK-ALLOC-006 · **Priority**: High
- **Files**: `apps/web/app/orders/*`
- **Acceptance**: detail explains why fully/partially/backordered; allocate + cancel actions
  with confirm dialog.
- **Testing**: manual full flow.

### TASK-FE-004 — Inventory & Warehouses pages
- **Objective**: Inventory matrix (product × warehouse, on-hand/reserved/available with
  shortage highlight) and warehouse list.
- **Deps**: TASK-FE-001, TASK-CRUD-003 · **Priority**: Medium
- **Files**: `apps/web/app/inventory/*`, `apps/web/app/warehouses/*`
- **Acceptance**: shortages visually distinct.
- **Testing**: manual.

### TASK-FE-005 — Backorders page
- **Objective**: Backorder table (order, product, original/remaining, priority, created,
  status) with reason inspection.
- **Deps**: TASK-FE-001, TASK-BO-001 · **Priority**: Medium
- **Files**: `apps/web/app/backorders/*`
- **Acceptance**: reflects live backorder state.
- **Testing**: manual.

### TASK-FE-006 — Inventory receipt form + result
- **Objective**: Form (warehouse, product, quantity, reference); after submit, show
  resulting backorder processing summary.
- **Deps**: TASK-FE-001, TASK-RCPT-002 · **Priority**: High
- **Files**: `apps/web/app/receipts/*`
- **Acceptance**: submitting shows increased inventory + which orders got allocated.
- **Testing**: manual replicating brief §26 example.

### TASK-FE-007 — Allocation history page
- **Objective**: Audit trail view of allocation decisions.
- **Deps**: TASK-FE-001, TASK-ALLOC-006 · **Priority**: Low
- **Files**: `apps/web/app/allocation-history/*`
- **Acceptance**: lists decisions with source/strategy/reason.
- **Testing**: manual.

---

## Phase 9 — Testing

### TASK-TEST-001 — Allocation engine unit tests
- **Objective**: Cover availability, ranking, full/partial/backorder math, priority,
  invalid transitions.
- **Deps**: TASK-ALLOC-003, TASK-BO-002, TASK-LIFE-001 · **Priority**: Critical
- **Files**: `apps/api/**/*.spec.ts`
- **Acceptance**: all engine branches covered; deterministic.
- **Testing**: `pnpm --filter api test`.

### TASK-TEST-002 — Integration tests
- **Objective**: Order+allocation, allocation+reservation, receipt+backorder,
  cancellation+release, multi-warehouse, multi-line.
- **Deps**: TASK-ALLOC-005, TASK-RCPT-002, TASK-LIFE-002 · **Priority**: Critical
- **Files**: `apps/api/test/*.e2e-spec.ts`
- **Acceptance**: scenarios pass against a test DB.
- **Testing**: `pnpm --filter api test:e2e`.

### TASK-TEST-003 — Concurrency tests
- **Objective**: Two orders allocating one pool simultaneously; competing backorders on
  receipt.
- **Deps**: TASK-ALLOC-004, TASK-RCPT-002 · **Priority**: Critical
- **Files**: `apps/api/test/concurrency.e2e-spec.ts`
- **Acceptance**: final state valid; total allocated never exceeds available; no invariant
  breach.
- **Testing**: parallel-request harness against test DB.

---

## Phase 10 — Polish

### TASK-POL-001 — Error handling & validation pass
- **Objective**: Consistent error responses (404/409/422), DTO validation messages per
  brief §27–28.
- **Deps**: Phase 3–7 · **Priority**: High
- **Acceptance**: documented error shapes returned; invalid inputs rejected clearly.

### TASK-POL-002 — Loading/empty states & confirm dialogs
- **Objective**: Frontend polish across pages.
- **Deps**: Phase 8 · **Priority**: Medium

### TASK-POL-003 — Docs + one-command local run + demo scenario
- **Objective**: README with setup, `docker compose up` + migrate + seed + run; scripted
  demo reproducing brief §21.
- **Deps**: all prior · **Priority**: High
- **Acceptance**: a fresh clone runs end-to-end with a small number of commands; demo
  reproduces the documented lifecycle.
