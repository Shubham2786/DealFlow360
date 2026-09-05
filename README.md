# DealFlow360

End-to-end B2B sales/order management: deal lifecycle from authentication → quotation →
approval → fulfillment/allocation → subscription/billing → invoice → payment, with
negotiation, pricing/discount configuration, deal-health analytics, reporting, and
administration.

See [`project.md`](./project.md) for the full design and [`tasks.md`](./tasks.md) for the
implementation plan. Architecture, database, API, design, and decisions live under
[`docs/`](./docs).

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, TanStack Query
- **Backend:** NestJS, TypeScript
- **ORM / DB:** Prisma + PostgreSQL 16 (local via Docker)
- **Auth:** JWT access + refresh (HTTP-only cookies), backend-enforced RBAC
- **Monorepo:** pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`, root `prisma/`)

## Repository Layout

```text
apps/web            # Next.js frontend
apps/api            # NestJS backend
packages/shared     # shared enums + Zod DTO contracts
prisma/             # schema, migrations, seed
docker-compose.yml  # local PostgreSQL
```

## Local Development

Prerequisites: Node 20+, pnpm 11+, Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up             # start PostgreSQL in Docker
pnpm prisma:migrate    # apply migrations
pnpm prisma:seed       # seed demo data
pnpm dev:api           # start NestJS API (http://localhost:3001/api)
pnpm dev:web           # start Next.js web (http://localhost:3000)
```

## Demo (two dashboards)

After `pnpm db:up`, `pnpm prisma:migrate`, and `pnpm prisma:seed`, start both apps:

```bash
pnpm dev:api   # http://localhost:3001/api
pnpm dev:web   # http://localhost:3000
```

Sign in at `/auth/login` with a seeded account:

| Email | Password | Role |
|-------|----------|------|
| admin@dealflow.test | password123 | ADMIN |
| morgan@dealflow.test | password123 | SALES_MANAGER |
| sam@dealflow.test | password123 | SALESPERSON |

Two working, data-backed dashboards:
- **Sales Dashboard** (`/dashboard`) — KPIs (active deals, approvals, revenue, pipeline,
  overdue invoices), alerts, and a recent-activity feed, all aggregated from the database.
- **Deal Health & Anomalies** (`/deal-health`) — health summary plus derived anomalies
  (excessive discount, low margin, stuck approvals, nearing expiry, overdue invoices) with
  severity and drill-down links.

## Build Approach

The application is built module by module following `tasks.md` (Phases 1–10). Each module
is committed independently.
