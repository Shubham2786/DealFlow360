# Architecture Decision Records (ADRs)

## Decision Record Format

Use the following template for all recorded architecture and technical decisions:

```markdown
### ADR-[NUMBER]: [Title]

* **Status**: [Proposed | Accepted | Rejected | Superseded]
* **Date**: [YYYY-MM-DD]
* **Deciders**: [List of contributors]

#### Context & Problem Statement
[Describe context and problem statement]

#### Considered Options
* [Option 1]
* [Option 2]

#### Decision Outcome
Chosen option: [Option], because [Justification].

#### Consequences
* Positive: [Benefits]
* Negative: [Trade-offs or risks]
```

---

## Accepted Decisions

### ADR-0001: Local PostgreSQL via Docker + Prisma (no Supabase)

* **Status**: Accepted
* **Date**: 2026-09-05
* **Deciders**: Project brief §4, §39

#### Context & Problem Statement
Allocation correctness depends on transactional consistency, FKs, constraints, and atomic
updates. The evaluator explicitly requires a locally hosted relational DB and no Supabase.

#### Considered Options
* Local PostgreSQL (Docker) + Prisma
* Supabase (rejected by requirement)
* SQLite (weaker concurrency/locking guarantees)

#### Decision Outcome
Chosen: local PostgreSQL via Docker Compose accessed through Prisma, because it satisfies
the requirement and provides row locking + CHECK constraints needed for correctness.

#### Consequences
* Positive: full transactional control; runs locally; reproducible.
* Negative: contributors must run Docker.

---

### ADR-0002: Monorepo with pnpm workspaces

* **Status**: Accepted
* **Date**: 2026-09-05

#### Context & Problem Statement
Frontend (Next.js) and backend (NestJS) plus shared types need coordinated local dev
without heavy tooling.

#### Considered Options
* pnpm workspaces (apps/web, apps/api, packages/shared, root prisma/)
* Turborepo / Nx (more infrastructure than needed)
* Two separate repos

#### Decision Outcome
Chosen: pnpm workspaces, because it is the simplest structure meeting the "modular
monolith, easy to run locally" goal without extra build orchestration.

#### Consequences
* Positive: shared types, single install, simple scripts.
* Negative: no advanced task caching (acceptable at this scale).

---

### ADR-0003: Multi-warehouse partial allocation with Priority-Fill strategy

* **Status**: Accepted
* **Date**: 2026-09-05

#### Context & Problem Statement
Allocation must be deterministic, explainable, partial-capable, and multi-warehouse, with
ranking not hardcoded in the UI.

#### Considered Options
* Priority-Fill: rank by warehouse `priority` then `code`, greedy fill
* Single-warehouse only
* Load-balancing across warehouses

#### Decision Outcome
Chosen: Priority-Fill selected via a named strategy id, so alternate strategies can be
added without touching controllers/UI.

#### Consequences
* Positive: deterministic, testable, explainable; supports partial + multi-warehouse.
* Negative: greedy fill may not optimize for balanced stock (acceptable for v1).

---

### ADR-0004: Concurrency via READ COMMITTED + SELECT ... FOR UPDATE

* **Status**: Accepted
* **Date**: 2026-09-05

#### Context & Problem Statement
Concurrent orders must never over-allocate the same stock.

#### Considered Options
* READ COMMITTED + explicit row locks (`SELECT ... FOR UPDATE`) ordered by inventory id
* SERIALIZABLE isolation with retry loops
* Optimistic version columns only

#### Decision Outcome
Chosen: READ COMMITTED with ordered `SELECT ... FOR UPDATE` inventory locks inside a
Prisma transaction, with DB CHECK (`reserved <= onHand`) as a backstop.

#### Consequences
* Positive: predictable, low retry churn, deadlock-safe via consistent lock ordering.
* Negative: locks held for transaction duration (short, acceptable).

---

### ADR-0005: Store reserved on inventory; derive available

* **Status**: Accepted
* **Date**: 2026-09-05

#### Decision Outcome
`inventory.reserved` and `inventory.onHand` are stored; `available = onHand - reserved` is
always derived, never persisted, to avoid drift and enforce invariants at one source.

#### Consequences
* Positive: single source of truth; invariants enforceable by CHECK constraints.
* Negative: availability computed per query (negligible cost).

---

### ADR-0006: Backorder prioritization order

* **Status**: Accepted
* **Date**: 2026-09-05

#### Decision Outcome
Process backorders by: (1) order priority (URGENT>HIGH>NORMAL>LOW), (2) backorder
`createdAt` ascending, (3) order `createdAt` ascending. Centralized in `BackorderService`.

#### Consequences
* Positive: deterministic FIFO with priority override; incoming stock not given to newest
  order blindly.

---

### ADR-0007: Idempotency via unique receipt reference + outstanding recomputation

* **Status**: Accepted
* **Date**: 2026-09-05

#### Decision Outcome
Receipts carry a unique `reference`; duplicates do not double inventory. Allocation and
backorder retry only act on recomputed outstanding/remaining quantities, so duplicate
requests do not create duplicate reservations.

#### Consequences
* Positive: safe retries; no double counting.
* Negative: callers must supply a stable reference for receipts.

---

### ADR-0008: No authentication in v1

* **Status**: Accepted
* **Date**: 2026-09-05

#### Context & Problem Statement
The system is for local demonstration of allocation logic; auth adds scope without serving
the evaluation criteria.

#### Decision Outcome
No authentication/authorization in v1. **Security note:** all endpoints are
network-exposed without access control; acceptable for local/demo only and must be
revisited before any shared or production deployment.

#### Consequences
* Positive: faster to demonstrate core domain.
* Negative: not deployable to shared environments as-is.

---

### ADR-0009: Multiple order lines for the same product allocated independently

* **Status**: Accepted
* **Date**: 2026-09-05

#### Decision Outcome
When an order has multiple lines for the same product, each line is allocated
independently against live product inventory, processed in line order.

#### Consequences
* Positive: simple, predictable per-line semantics.
* Negative: earlier lines may consume stock before later lines (documented, deterministic).

---

### ADR-0010: DealFlow360 is the product; inventory system is its Fulfillment module

* **Status**: Accepted
* **Date**: 2026-09-05

#### Context & Problem Statement
The project scope expanded from a standalone inventory-allocation system to DealFlow360, a
full B2B sales/order-management product spanning quotation → approval → fulfillment →
billing → invoice → payment.

#### Decision Outcome
DealFlow360 is the authoritative product. The prior inventory-allocation design
(allocation engine, reservations, ATP, backorders, row-lock concurrency) is incorporated
as the **Fulfillment / Allocation** module (Phase 5). `project.md`/`tasks.md` describe
DealFlow360; the prior `task.md` is retained for reference.

#### Consequences
* Positive: reuses proven allocation design; single coherent product.
* Negative: broader scope; docs refreshed to the product level.

---

### ADR-0011: JWT + refresh cookie sessions with backend-enforced RBAC

* **Status**: Accepted · **Date**: 2026-09-05 · **Supersedes**: ADR-0008

#### Context & Problem Statement
DealFlow360 has real roles (Salesperson, Sales Manager, Finance, Operations, Admin, plus
Customer portal) and permission-sensitive actions; the earlier no-auth decision no longer
holds.

#### Considered Options
* JWT access + refresh in HTTP-only cookies + RBAC guards
* Session store (server-side sessions)
* No auth (rejected — superseded)

#### Decision Outcome
Chosen: JWT access + rotating refresh tokens in HTTP-only cookies, with a `RolesGuard` +
policy service enforcing role/permission server-side. Frontend hiding is UX only.

#### Consequences
* Positive: stateless-ish auth, standard, testable RBAC.
* Negative: refresh rotation/replay handling required.

---

### ADR-0012: Configuration-driven discount tiers & approval chains

* **Status**: Accepted · **Date**: 2026-09-05

#### Decision Outcome
Discount tiers and approval rules are stored in the DB and read by the DiscountEngine /
ApprovalRuleEngine. Approval chains are computed dynamically from deal attributes
(discount, value, margin, category, segment, terms, contract duration). Rules are never
hardcoded or duplicated in frontend components.

#### Consequences
* Positive: business-configurable authority; single rule source.
* Negative: config changes affecting in-flight approvals need versioning consideration.

---

### ADR-0013: Quotation is the aggregate root of a Deal (stateful domain graph)

* **Status**: Accepted · **Date**: 2026-09-05

#### Decision Outcome
The Quotation is the central commercial aggregate; approval, negotiation, fulfillment,
subscription, billing, and invoice attach as related aggregates depending on the deal. The
backend `DealStateMachine` and domain relationships determine navigation and allowed
actions — not a linear screen-to-screen flow.

#### Consequences
* Positive: avoids brittle sequential UI; matches real deal behavior.
* Negative: requires explicit state-machine + guard logic.

---

### ADR-0014: Customer portal is a token-scoped, field-filtered projection

* **Status**: Accepted · **Date**: 2026-09-05

#### Decision Outcome
The customer portal is reached via a per-quote token and returns only customer-safe fields
(products, quantities, prices, discount, terms, total, validity, delivery). Internal
margin, approval thresholds, notes, risk scores, and allocation internals are never exposed.

#### Consequences
* Positive: safe external surface; clear internal/external boundary.
* Negative: separate DTO projection to maintain.

---

### ADR-0015: Material change to an approved quote forces re-approval

* **Status**: Accepted · **Date**: 2026-09-05

#### Decision Outcome
When a negotiation (or edit) introduces a material change to an already-approved quote
(e.g. additional discount), the quote transitions to NEGOTIATION/REVISION and must
re-enter approval per the ApprovalRuleEngine. Approval rules cannot be bypassed because a
prior version was approved.

#### Consequences
* Positive: preserves commercial authority controls.
* Negative: adds revision/versioning handling on the quote.

---

## Deprecated or Superseded Decisions

* **ADR-0008 (No authentication in v1)** — *Superseded by ADR-0011.* Auth and RBAC are now
  in scope because DealFlow360 has real roles and permission-sensitive actions.
