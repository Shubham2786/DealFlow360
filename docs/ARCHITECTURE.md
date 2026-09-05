# System Architecture — DealFlow360

> Authoritative architecture reference. Consolidated product design is in `/project.md`;
> executable tasks in `/tasks.md`. DealFlow360 incorporates the earlier inventory system
> as its Fulfillment/Allocation module (ADR-0010).

## System Overview

DealFlow360 is a modular monolith for B2B sales/order management covering the full deal
lifecycle: auth → quotation → approval → fulfillment/allocation → subscription/billing →
invoice → payment, plus negotiation, pricing/discount configuration, deal-health analytics,
reporting, and administration. A NestJS backend owns all business logic; a Next.js
dashboard displays state and triggers backend actions. PostgreSQL (local via Docker) is
accessed through Prisma.

The deal is a **stateful domain graph**, not a linear screen flow: the Quotation is the
aggregate root; approval, negotiation, fulfillment, subscription, billing, and invoice
attach as related aggregates depending on the deal (ADR-0013).

## Core Components & Modules

Auth/Users, Customers, Products/Catalog, Pricing/Pricelists, Discounts/ApprovalConfig,
Quotations (deal core), Approvals, Negotiation/CustomerPortal, Fulfillment/Inventory/
Allocation/Backorders, Subscriptions, Billing, Invoices, Payments, DealHealth, Reporting,
Admin, Audit. Full descriptions in `/project.md` §6.

## Architectural Patterns

Layered: **Controllers → Application Services → Domain Engines → Prisma → PostgreSQL**.

- Controllers validate DTOs, apply RBAC guards, translate HTTP.
- Services own transactions and orchestration.
- Engines are pure/near-pure: PricingEngine, DiscountEngine, ApprovalRuleEngine,
  AllocationEngine, BillingEngine, DealHealthEngine, DealStateMachine. Engines compute;
  services persist.
- AuditService writes append-only events within the same transaction as the action.
- Boundary rule (spec §29, §31): no critical business logic lives only in the frontend.

```text
Next.js (apps/web) → REST /api (JWT cookie) → NestJS (apps/api)
  Controllers(+RBAC) → Services → Engines → Prisma → PostgreSQL
                                   └→ AuditService
```

## Technology Stack

Next.js + React + TS + Tailwind + TanStack Query (web); NestJS + TS (api); Prisma (ORM);
PostgreSQL 16 (Docker); JWT access+refresh cookies with RBAC; pnpm workspaces; Jest
(+ optional Playwright). See `/project.md` §3 and ADR-0011.

## Data Flow

- **Quotation pricing**: line edits → PricingEngine (base→segment→qty→contract) → totals.
- **Submit → approval**: ApprovalRuleEngine computes chain from discount/value/margin/terms
  → ApprovalRequest + steps → decisions transition the quotation lifecycle transactionally.
- **Approved → fulfillment**: convert creates Fulfillment order → AllocationEngine allocates
  (row-locked) → reservations/backorders → statuses; receipts reprocess backorders.
- **Subscription/billing**: approved deal may create a subscription → BillingEngine schedules
  periods → invoices → payments.
- **Negotiation**: customer portal responses may cause a material change → quote re-enters
  approval (ADR-0015).
- **Deal health**: DealHealthEngine derives anomalies from live domain data (no copies).

## Lifecycle State Machines

Deal/Quotation, Approval, Fulfillment/Allocation, Subscription, Invoice — full transition
definitions in `/project.md` §11. `DealStateMachine` and module services are the sole
authority; invalid transitions are rejected; UI actions are state-aware (spec §23).

## Integration Points

v1 has no external integrations (payments/shipping/email are stubbed). Frontend↔backend
over REST `/api`; backend↔PostgreSQL via Prisma. Customer portal is a token-scoped,
field-filtered projection of the internal API (ADR-0014).

## Security Architecture

JWT access + refresh in HTTP-only cookies; backend-enforced RBAC via guards + policy
service (ADR-0011, supersedes prior no-auth decision). Frontend hiding is UX only, not
security. Unauthorized URL access is blocked server-side (401/403). Inputs validated at the
boundary; DB constraints as a second layer. No secrets committed; config via `.env`.

## Infrastructure & Deployment

Local-first: `docker-compose.yml` runs PostgreSQL (volume + healthcheck); Prisma migrations
+ seed establish a demonstrable full deal graph. Backend/frontend run via pnpm scripts. A
fresh clone runs end-to-end in a few commands (TASK-F10-05).
