# DealFlow360 — Production Deployment on AWS

> A production-grade reference for deploying the monorepo (NestJS API + Next.js web +
> PostgreSQL) to AWS. It maps the current architecture to AWS services, with security,
> scaling, CI/CD, migrations, observability, and DR. Two viable topologies are given; the
> **recommended** one is Topology A (containers on ECS Fargate).

---

## 1. What we're deploying

| Component | Today | Runtime needs |
|-----------|-------|---------------|
| `apps/api` (NestJS) | Node HTTP server on `:3001`, `/api` prefix | Long-lived container, DB access, JWT secrets, CORS to web origin |
| `apps/web` (Next.js App Router) | Node server (SSR + client) on `:3000` | Long-lived container (or static/edge), needs `NEXT_PUBLIC_API_URL` |
| PostgreSQL | Docker (dev) / local | Managed, HA, backups, private |
| Prisma migrations | `migrate dev` (dev) | `migrate deploy` as a release step |

App specifics that shape the deployment:
- Auth uses **HTTP-only cookies** (`df_access`/`df_refresh`) → requires **HTTPS end-to-end**
  and a coherent cookie domain; set `secure` cookies in production (already gated on
  `NODE_ENV=production`) and `SameSite`. If web and API are on different subdomains, use a
  parent-domain cookie or keep them same-site.
- API CORS is driven by `WEB_ORIGIN` (`credentials: true`) → must be the exact web URL.
- Secrets: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `ADMIN_*`.

---

## 2. Recommended architecture (Topology A — ECS Fargate)

```text
                 Route 53 (dealflow360.com,  api.dealflow360.com)
                          │
                     ACM TLS certs
                          │
                   ┌──────▼───────┐        ┌─────────────────┐
   Internet ─────▶ │  CloudFront  │◀──WAF──│  (static assets)│
                   └──────┬───────┘        └─────────────────┘
                          │  (web)                 (api)
                   ┌──────▼───────────────────────────▼──────┐
                   │       Application Load Balancer (HTTPS)  │  public subnets
                   └──────┬───────────────────────────┬──────┘
                          │ target: web                │ target: api
              ┌───────────▼─────────┐      ┌───────────▼──────────┐  private subnets
              │ ECS Fargate: web    │      │ ECS Fargate: api     │
              │ (Next.js, autoscale)│      │ (NestJS, autoscale)  │
              └─────────────────────┘      └───────────┬──────────┘
                                                        │ 5432 (SG-restricted)
                                              ┌─────────▼─────────┐
                                              │  RDS PostgreSQL   │  private, Multi-AZ
                                              │  (+ RDS Proxy)    │
                                              └───────────────────┘
   Secrets Manager · SSM Parameter Store · ECR · CloudWatch · GuardDuty
```

- **VPC** with public subnets (ALB, NAT GW) and **private subnets** (ECS tasks, RDS) across
  ≥2 AZs. ECS tasks reach the internet (ECR pulls, external calls) via **NAT Gateway**; DB
  and app tiers are never publicly reachable.
- **ALB** terminates TLS (ACM), routes `api.dealflow360.com` → api target group and the web
  host → web target group. Health checks: `/api/health` (api), `/` (web).
- **CloudFront** in front of the web (and static/`_next` assets) for caching + global edge;
  **WAF** attached (managed rule sets + rate limiting) at CloudFront and/or ALB.
- **RDS PostgreSQL** (Multi-AZ) in private subnets; **RDS Proxy** for pooled, resilient
  connections (Prisma opens a pool per task; Proxy protects the DB during deploys/scale).

### Topology B (simpler / lower-ops)
- **Web** on **AWS Amplify Hosting** or **Vercel** (managed Next.js SSR + CDN).
- **API** on **AWS App Runner** (container, autoscaling, HTTPS, no ALB/VPC wiring) with a
  VPC connector to reach RDS.
- **RDS PostgreSQL** as above.
- Trade-off: less control/tuning than ECS, faster to stand up. Good for staging or small
  prod; move to Topology A when you need fine-grained networking, blue/green, or WAF at ALB.

---

## 3. Build & artifacts

Two container images from the monorepo, pushed to **Amazon ECR**:
- `dealflow360-api` — multi-stage: install workspace deps → `pnpm --filter @dealflow/api build`
  → run `node dist/main.js`. Include the generated Prisma client (run `prisma generate` in
  build) and the `prisma/` folder (schema + migrations) so the release task can
  `prisma migrate deploy`.
- `dealflow360-web` — multi-stage: `pnpm --filter @dealflow/web build` → Next.js
  **standalone** output (`output: 'standalone'`) → run `node server.js`. Bake
  `NEXT_PUBLIC_API_URL` at build time (it's inlined) or use runtime env with a small entry
  script.

Pin Node 20/22; use `pnpm` with a frozen lockfile; leverage BuildKit cache. Tag images with
the git SHA (immutable) plus `:staging`/`:prod` moving tags.

---

## 4. Database & migrations

- **RDS for PostgreSQL 16**, Multi-AZ, storage encrypted (KMS), automated backups (7–35
  days) + **PITR**, deletion protection on, minor-version auto-upgrade in a maintenance
  window. Right-size instance (start `db.t4g`/`db.m6g`), enable Performance Insights.
- **Connection creds in Secrets Manager**; rotate periodically. `DATABASE_URL` is composed
  from the secret and injected into ECS task definitions as a `secret` (never plaintext env).
- **Migrations as a release step**, not on app boot: run a one-off **ECS task** (or a
  CodeBuild/CodeDeploy hook) that executes `pnpm prisma migrate deploy` against RDS **before**
  routing traffic to the new app version. This keeps schema changes atomic and auditable.
  - Order the pipeline: build image → run migrate-deploy task → deploy api → deploy web.
  - For destructive migrations, use expand/contract (add column → backfill → switch reads →
    drop) so rolling deploys stay compatible.
- **RDS Proxy** in front of the DB for pooling; set Prisma `connection_limit` sensibly per
  task and cap ECS task count so total connections stay under the RDS max.

---

## 5. Configuration & secrets

- **Secrets Manager**: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, DB credentials, `ADMIN_*`.
- **SSM Parameter Store**: non-secret config (`API_PORT`, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`,
  `NODE_ENV=production`, feature flags).
- Injected into ECS task definitions via `secrets` (from Secrets Manager/SSM) and
  `environment`. Nothing sensitive in the image or in git.
- Per-environment isolation: separate `dev` / `staging` / `prod` accounts (or at least VPCs +
  parameter paths) via AWS Organizations. Never share a prod DB with lower envs.

---

## 6. CI/CD pipeline

Recommended: **GitHub Actions** (repo already on GitHub) with OIDC → assume an AWS role
(no long-lived keys).

```text
push/tag → GitHub Actions
  1. install (pnpm, frozen lockfile) · lint · typecheck · unit tests (pnpm -r test)
  2. build + push images to ECR (api, web) tagged with git SHA
  3. deploy to STAGING: run migrate-deploy ECS task → update ECS services → smoke tests
  4. manual approval gate
  5. deploy to PROD: migrate-deploy → ECS rolling or CodeDeploy blue/green → health checks
```

- Use **ECS blue/green via CodeDeploy** (or rolling with circuit breaker + auto-rollback)
  for zero-downtime and instant rollback on failed health checks.
- Keep DB migrations **backward-compatible** within a deploy so old + new tasks coexist
  briefly.
- Infra as code: **Terraform** or **AWS CDK** for VPC, ECS, ALB, RDS, IAM, WAF, CloudFront,
  Route 53 — reviewed in PRs, applied via the pipeline.

---

## 7. Security

- **Network**: app + DB in private subnets; security groups least-privilege — ALB SG →
  ECS SGs on the app ports only; ECS api SG → RDS SG on 5432 only; no 0.0.0.0/0 to app/DB.
- **TLS everywhere**: ACM certs on CloudFront + ALB; HSTS; redirect HTTP→HTTPS. This also
  makes the `secure` auth cookies valid.
- **WAF** managed rules (OWASP, bad inputs) + rate limiting on the login/signup paths.
- **IAM**: task roles scoped to exactly the secrets/logs they need; separate execution role
  for pulling ECR + reading secrets; GitHub OIDC role limited to deploy actions.
- **Secrets**: Secrets Manager with rotation; KMS-encrypted RDS, EBS, logs.
- **App-level** (already implemented): argon2 hashing, RBAC permission guards, token
  versioning, refresh-token rotation, DTO validation. In prod ensure `NODE_ENV=production`
  (secure cookies), strict `WEB_ORIGIN` CORS, and strong random JWT secrets.
- **Account hygiene**: GuardDuty, CloudTrail, Config, Security Hub; restrict console access
  with SSO + MFA.

---

## 8. Scaling & availability

- **ECS Service Auto Scaling** on CPU/memory and ALB request count / p95 latency; min 2
  tasks per service across AZs for HA. Set sensible task CPU/mem and health-check grace.
- **RDS**: Multi-AZ for failover; add a **read replica** if reporting/dashboards get heavy
  and route read-only queries there. RDS Proxy smooths failover + connection storms.
- **CloudFront** offloads static/`_next` assets and caches cacheable GETs.
- Stateless app tiers (JWT in cookies, no server session store) → horizontal scaling is
  clean. Refresh tokens live in the DB, so no sticky sessions needed.

---

## 9. Observability

- **CloudWatch Logs** (structured JSON from Nest/Next), **Container Insights** for ECS,
  RDS **Performance Insights**, ALB access logs to S3.
- **Metrics/alarms**: 5xx rate, p95 latency, task health, CPU/mem, RDS connections/CPU/free
  storage, DLQ depth if queues added. Alarms → SNS → Slack/PagerDuty.
- **Tracing**: OpenTelemetry from the API (and Next.js) → AWS X-Ray or an APM. Propagate a
  request id.
- **Health**: `/api/health` already reports DB connectivity — wire it to ALB + a synthetic
  canary (CloudWatch Synthetics) hitting login + a read endpoint.

---

## 10. Backups & disaster recovery

- RDS automated backups + manual snapshots before major migrations; **PITR** enabled.
- **Cross-region snapshot copy** for DR; document RPO/RTO (e.g., RPO ≤ 5 min with PITR,
  RTO defined by restore + redeploy time).
- IaC + immutable images mean the whole stack can be rebuilt in a second region.
- Periodically **test restores** (a backup you haven't restored is not a backup).

---

## 11. Environments & cost notes

- **dev / staging / prod** with identical IaC, smaller instances in non-prod; scale-to-min
  or scheduled scale-down for non-prod to save cost.
- Cost levers: Fargate right-sizing + Graviton (arm64) images, Savings Plans/RIs for steady
  load, single NAT per AZ vs one shared, S3/CloudFront for assets, RDS Graviton + gp3.
- Rough steady-state small-prod footprint: 2× small Fargate tasks per service, 1 Multi-AZ
  `db.t4g.small`, ALB, CloudFront, NAT — a few hundred USD/month; grows with traffic.

---

## 12. Go-live checklist

- [ ] VPC, subnets, SGs, NAT, Route 53 zone, ACM certs issued/validated.
- [ ] RDS Multi-AZ up, encrypted, backups + PITR, creds in Secrets Manager, RDS Proxy.
- [ ] ECR repos; api + web images build in CI and pass lint/typecheck/tests.
- [ ] `migrate deploy` release task wired **before** app rollout.
- [ ] ECS services (min 2 tasks), ALB target groups + health checks green.
- [ ] CloudFront + WAF in front of web; HTTPS enforced; HSTS.
- [ ] `NODE_ENV=production`, strong JWT secrets, exact `WEB_ORIGIN`, correct
      `NEXT_PUBLIC_API_URL`, cookie domain/SameSite validated (login → refresh → logout).
- [ ] Alarms + dashboards + on-call routing; synthetic canary on `/api/health` + login.
- [ ] Blue/green or rolling deploy with auto-rollback verified in staging.
- [ ] DR runbook + a tested cross-region restore.
- [ ] Seed the initial ADMIN once (via a one-off task using `ADMIN_EMAIL`/`ADMIN_PASSWORD`),
      then rotate that password.

---

## 13. Mapping to the current codebase

| Current | Production change |
|---------|-------------------|
| `docker-compose.yml` Postgres | RDS PostgreSQL (Multi-AZ) + RDS Proxy |
| `.env` `DATABASE_URL` | From Secrets Manager, injected into ECS task |
| `pnpm prisma migrate dev` | `pnpm prisma migrate deploy` as a pipeline release task |
| API on `:3001`, web on `:3000` | Same ports inside containers; ALB/CloudFront front them on 443 |
| `WEB_ORIGIN` CORS + cookies | Exact HTTPS origins; `secure`+`SameSite` cookies (prod) |
| Local `next dev` / `nest start` | Immutable ECR images run on Fargate |
| `docs/CODEBASE.md` boundary rules | Unchanged — the app is already stateless + config-driven, which suits this deployment |

> Start with **Topology B** (Amplify/App Runner + RDS) to get a secure prod URL quickly,
> then graduate to **Topology A** (ECS Fargate + ALB + CloudFront + WAF + IaC) for full
> control, blue/green, and fine-grained networking.
