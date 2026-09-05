# DealFlow360 — Deployment on Kubernetes (EKS) with Docker & AWS

> A production-grade Kubernetes strategy for the monorepo (NestJS API + Next.js web +
> PostgreSQL). Complements `docs/DEPLOYMENT-AWS.md` (ECS Fargate). Choose **ECS Fargate**
> if you want the least ops; choose **EKS (this doc)** if you want Kubernetes portability,
> a rich ecosystem (Helm, operators, HPA/KEDA), or multi-cloud flexibility.

---

## 1. Target architecture

```text
                 Route 53  →  ACM TLS
                     │
              ┌──────▼───────┐        WAF
              │  CloudFront  │◀───────────────  (web static/_next cache)
              └──────┬───────┘
                     │
             ┌───────▼────────────────────────┐
             │  AWS Load Balancer Controller   │  (creates an ALB from Ingress)
             │            Ingress              │
             └───────┬─────────────────┬───────┘
                     │ host: app.*     │ host: api.*
        ┌────────────▼───────┐  ┌──────▼────────────┐     EKS cluster
        │ Service: web (ClusterIP)  Service: api      │     (managed control plane)
        │  Deployment web    │  │  Deployment api     │     nodes in PRIVATE subnets
        │  HPA 2..N          │  │  HPA 2..N           │
        └────────────────────┘  └──────┬─────────────┘
                                        │ 5432 (SG + NetworkPolicy)
                               ┌────────▼─────────┐
                               │ RDS PostgreSQL   │  managed, Multi-AZ, private
                               │ (+ RDS Proxy)    │  (NOT in-cluster)
                               └──────────────────┘
   IRSA · Secrets(External Secrets → Secrets Manager) · ECR · CloudWatch/Prometheus
```

Key decisions:
- **EKS** managed control plane; worker nodes via **managed node groups** (or **Fargate
  profiles** for serverless pods) in **private subnets** across ≥2 AZs.
- **Database stays managed (RDS)**, not in-cluster. Running stateful Postgres in k8s is
  possible (operators/StatefulSets) but adds real operational risk; RDS gives HA, backups,
  and PITR for free. Reach it from pods via a **VPC-internal** endpoint + **RDS Proxy**.
- **Ingress via the AWS Load Balancer Controller**, which provisions an **ALB** from
  `Ingress` objects (TLS from ACM, path/host routing). CloudFront + WAF in front for edge
  caching and protection.

---

## 2. Containers (Docker)

Two images in **Amazon ECR**, built multi-stage, small, non-root, arm64 (Graviton) where
possible:

- **api**: build workspace → `pnpm --filter @dealflow/api build` + `prisma generate`; ship
  `dist/`, `node_modules` (prod), and `prisma/` (schema + migrations). `CMD node dist/main.js`.
  Expose 3001. Add a liveness path `/api/health`.
- **web**: `pnpm --filter @dealflow/web build` with Next.js `output: 'standalone'`; ship the
  standalone server. `CMD node server.js`. Expose 3000.

Image hygiene: pinned Node, `pnpm` frozen lockfile, distroless/alpine runtime, read-only
root filesystem, drop Linux capabilities, run as UID != 0, healthchecks, SHA-tagged images.

---

## 3. Kubernetes objects (per service)

For **api** and **web**, a Helm chart (or Kustomize) with:

- **Deployment** — 2+ replicas, rolling update (`maxUnavailable: 0`, `maxSurge: 1`) for
  zero downtime, resource `requests/limits`, `readinessProbe` (gates traffic) +
  `livenessProbe`, `securityContext` (non-root, read-only FS), topology spread across AZs.
- **Service** (ClusterIP) — stable in-cluster endpoint.
- **Ingress** — host rules `api.dealflow360.com` → api, `app.dealflow360.com` → web; TLS via
  ACM annotation; the ALB controller realizes it.
- **HorizontalPodAutoscaler** — scale on CPU + custom metric (RPS/p95 latency via
  Prometheus Adapter or KEDA).
- **PodDisruptionBudget** — keep ≥1 available during node drains/upgrades.
- **NetworkPolicy** — default-deny; allow web→api, api→RDS, ingress→web/api only.
- **ServiceAccount + IRSA** — pod-scoped AWS IAM (least privilege) instead of node creds.

Config & secrets:
- **ConfigMap** for non-secrets (`API_PORT`, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`,
  `NODE_ENV=production`).
- **External Secrets Operator** syncs `JWT_*`, `DATABASE_URL`, `ADMIN_*` from **AWS Secrets
  Manager** into k8s Secrets (nothing sensitive in git or images).

---

## 4. Database migrations

Migrations must run **before** the new app version serves traffic — never on pod start
(N replicas would race). Options:
- **Helm pre-upgrade hook Job** running `pnpm prisma migrate deploy` against RDS. The
  rollout waits for the Job to succeed.
- Or an **Argo CD PreSync hook** Job (if using GitOps).
Use **expand/contract** migrations so old and new pods stay schema-compatible during the
rolling update. Point the Job (and pods) at **RDS Proxy** and keep total pod count ×
Prisma pool size under the RDS connection cap.

---

## 5. Ingress, TLS, edge

- **AWS Load Balancer Controller** → internet-facing **ALB** from the `Ingress`; TLS certs
  from **ACM**; HTTP→HTTPS redirect; HSTS. This makes the app's `secure` auth cookies valid.
- **CloudFront** in front for global caching of web assets/`_next`; **WAF** (managed rules +
  login rate limiting) on CloudFront and/or the ALB.
- CORS: set `WEB_ORIGIN` to the exact web URL; cookies `secure` + appropriate `SameSite`
  (same registrable domain for `app.` and `api.` keeps auth cookies working).

---

## 6. CI/CD (GitOps recommended)

```text
GitHub Actions (OIDC → AWS role, no static keys)
  build/test → build+push api & web images to ECR (SHA tag)
  update image tags in the Helm values / env overlay (git commit to a config repo)
        │
   Argo CD (or Flux) watches the config repo
        └─ syncs to EKS: runs migrate-deploy Job (hook) → rolling update → health-gated
```

- **GitOps (Argo CD/Flux)** gives declarative, auditable, easily-rolled-back deploys; the
  cluster state always matches git.
- Progressive delivery: **Argo Rollouts** (canary/blue-green) with automated analysis on
  error rate/latency → auto-rollback.
- Provision the platform (VPC, EKS, node groups, RDS, IAM/IRSA, ALB controller, add-ons)
  with **Terraform** (or `eksctl` + Terraform); app deploys via Helm/Argo.

---

## 7. Cluster add-ons (baseline)

- AWS Load Balancer Controller, **ExternalDNS** (Route 53 records from Ingress),
  **External Secrets Operator**, **cluster-autoscaler**/**Karpenter** (node scaling),
  **metrics-server** (HPA), **Prometheus + Grafana** (or CloudWatch Container Insights),
  **Fluent Bit** → CloudWatch/OpenSearch (logs), **cert-manager** (if not using ACM at ALB),
  **OpenTelemetry Collector** → X-Ray/Tempo.

---

## 8. Scaling & availability

- **HPA** on api/web (CPU + RPS/latency); **Karpenter** provisions right-sized nodes on
  demand and consolidates for cost.
- Multi-AZ node groups + topology spread + PDBs → survives AZ/node loss.
- RDS Multi-AZ + optional read replica for heavy reporting; RDS Proxy handles connection
  storms during scale/rollout.
- App tiers are **stateless** (JWT in cookies, refresh tokens in DB) → clean horizontal
  scale, no sticky sessions.

---

## 9. Security

- Nodes/pods in **private subnets**; **NetworkPolicies** default-deny; SGs restrict ALB→pods
  and pods→RDS(5432) only.
- **IRSA** for least-privilege pod IAM; no node-wide creds.
- Secrets via External Secrets + KMS; RDS/EBS/logs encrypted; **TLS everywhere**.
- Pod hardening: non-root, read-only rootfs, dropped capabilities, seccomp; scan images
  (ECR scanning/Trivy) and enforce with an admission policy (Kyverno/OPA Gatekeeper).
- Cluster: private API endpoint (or restricted CIDRs), audit logging to CloudWatch,
  GuardDuty EKS protection.
- App-level (already built): argon2, RBAC permission guards, token versioning, refresh
  rotation, DTO validation; ensure `NODE_ENV=production` + strong JWT secrets + strict CORS.

---

## 10. Observability & DR

- **Metrics**: Prometheus/Grafana or CloudWatch Container Insights; alarms on 5xx, p95,
  pod restarts, HPA saturation, RDS connections/CPU/storage.
- **Logs**: Fluent Bit → CloudWatch/OpenSearch (structured JSON).
- **Tracing**: OpenTelemetry → X-Ray/Tempo; propagate request ids.
- **Health**: `/api/health` on readiness/liveness + CloudWatch Synthetics canary.
- **DR**: RDS automated backups + PITR + cross-region snapshot copy; EKS + Helm/Argo means
  the cluster is reproducible in another region from git + IaC. Define RPO/RTO and
  **test restores** regularly.

---

## 11. Environments & cost

- `dev` / `staging` / `prod` as separate namespaces or (better) separate clusters/accounts.
- Cost levers: **Karpenter** consolidation + **Spot** for stateless web/api (with on-demand
  base), Graviton (arm64) images, single shared NAT where acceptable, CloudFront for assets,
  RDS Graviton + gp3, scheduled scale-down of non-prod.
- Note: EKS has a control-plane hourly cost + node costs; for a small footprint ECS Fargate
  (see `DEPLOYMENT-AWS.md`) is often cheaper/simpler. Pick EKS when you need k8s itself.

---

## 12. Go-live checklist (EKS)

- [ ] Terraform: VPC, EKS, node groups/Karpenter, RDS (Multi-AZ, PITR), IAM/IRSA, ECR.
- [ ] Add-ons: ALB controller, ExternalDNS, External Secrets, metrics-server, logging,
      monitoring installed and healthy.
- [ ] api + web images build in CI, scanned, pushed to ECR (SHA tags).
- [ ] Helm charts: Deployments (2+), Services, Ingress (ACM TLS), HPA, PDB, NetworkPolicy,
      probes, resource limits, non-root securityContext.
- [ ] `migrate deploy` runs as a pre-upgrade Job and gates the rollout.
- [ ] CloudFront + WAF in front; HTTPS enforced; `WEB_ORIGIN`/`NEXT_PUBLIC_API_URL`/cookie
      domain validated end-to-end (login → refresh → logout).
- [ ] Argo Rollouts canary + auto-rollback verified in staging.
- [ ] Alarms, dashboards, on-call; synthetic canary on `/api/health` + login.
- [ ] DR runbook + tested cross-region restore.
- [ ] Seed initial ADMIN once via a Job (using `ADMIN_EMAIL`/`ADMIN_PASSWORD`), then rotate.

---

## 13. When to pick which

| Need | Choose |
|------|--------|
| Lowest ops, fastest to prod, small team | **ECS Fargate** (`DEPLOYMENT-AWS.md`) |
| Kubernetes ecosystem, GitOps, portability, many services | **EKS** (this doc) |
| In-cluster Postgres | Avoid — use **RDS** either way |
