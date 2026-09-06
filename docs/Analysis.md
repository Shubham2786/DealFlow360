# DealFlow360 — Systemic Architecture, Security & Governance Analysis

**Date:** September 2026  
**Status:** Remediated & Verified  
**Scope:** `apps/api`, `apps/web`, `packages/shared`, `prisma/`  

---

## 1. Executive Summary

This document synthesizes the systemic analysis of DealFlow360 covering architectural soundness, database schema consistency, authorization boundaries (RBAC), multi-tier governance, concurrency, and user experience workflows.

Prior to remediation, DealFlow360 suffered from four critical vulnerabilities/blockers:
1. **Schema Drift (P0)**: `Subscription` and `SubscriptionLine` models were defined in Prisma schema without a corresponding migration, causing deployment failures and 500 errors on `/subscriptions` and customer dashboards.
2. **Authorization Holes & Margin Leakage (P0)**: Mutations (`submit`, `cancel`, `revise` on quotations, subscription status changes, `POST /customers`) and operational reads (`/approvals`, `/fulfillment`, `/inventory`, `/warehouses`) only checked authentication (`JwtAuthGuard`), allowing unprivileged users or external `CUSTOMER` logins to cancel deals, mutate contracts, and view internal margin percentages.
3. **Governance & Discount Bypass Vulnerability (P0)**: Approval rules only evaluated header discount percentages and gross totals against a synthetic 70% cost model. Sales representatives could bypass discount governance entirely by lowering `unitPrice` with a 0% explicit discount. Furthermore, customer segment tiers (`STANDARD`, `SMB`, `ENTERPRISE`, `STRATEGIC`) and category discount ceilings were unenforced.
4. **React Hook Ordering Crash (P0)**: In `invoices/[id]/page.tsx`, `usePermissions()` was called conditionally after an early loading return, causing Next.js to crash with a React Hook violation upon auth resolution.

All identified vulnerabilities, concurrency races, and lifecycle dead-ends have been systematically remediated and verified.

---

## 2. Detailed Findings & Root-Cause Analysis

### 2.1 Database & Schema Drift [CRITICAL-01]
- **Issue**: Models `Subscription` and `SubscriptionLine` along with their relational links to `Customer`, `Quotation`, and `Product` were added to `prisma/schema.prisma` in commit `8f2673d`, but no SQL migration existed in `prisma/migrations/`.
- **Impact**: Running `prisma migrate deploy` in a clean environment skipped table creation; subsequent seed operations and API calls to `/subscriptions` failed with PostgreSQL relation missing errors (`table "subscriptions" does not exist`).
- **Remediation**: Added `prisma/migrations/20260905183000_subscriptions/migration.sql` creating `subscriptions` and `subscription_lines` tables with indexes, foreign keys, and relational constraints.

---

### 2.2 Broken Authorization & Cross-Tenant Data Leaks [SECURITY-02]
- **Issue**:
  - `QuotationsController`: `submit`, `cancel`, and `revise` lacked `@UseGuards(PermissionsGuard)` and `@RequirePermissions(Permission.DEAL_CREATE)`. Any authenticated user could cancel or revise another representative's quotation.
  - `CustomersController`: `list()` and `get()` returned all customers across the system to any authenticated caller, including `CUSTOMER` users. `POST /customers` was unshielded.
  - `ApprovalsController`: `GET /approvals` and `GET /approvals/:id` lacked role restrictions. External customer personas could inspect internal margin percentages and approver discussions.
  - `FulfillmentController`: Inventory stock and warehouse lists were exposed to external customer logins.
  - `SubscriptionsController`: `create`, `pause`, `resume`, and `cancel` had no permission requirements.
- **Remediation**:
  - Enforced `PermissionsGuard` and explicit permissions across all mutation endpoints.
  - Added deal ownership assertions (`assertCanModify`) restricting representatives to their own deals while permitting managers and admins team-wide control.
  - Restricted customer data and quotes for `CUSTOMER` role strictly to records matching their registered company contact email.
  - Gated approval, inventory, and fulfillment reads to internal staff (`user.role !== UserRole.CUSTOMER`).

---

### 2.3 Governance Model: Per-Line Ceilings, Tiers & UnitPrice Markdown [GOV-03]
- **Issue**:
  - `ApprovalRuleEngine` only inspected `discountPct`, `marginPct`, and `total`.
  - Representatives could discount a product from ₹1,00,000 to ₹10,000 by editing `unitPrice` while keeping `discountPct: 0`, bypassing the approval engine and auto-approving.
  - Category-specific discount thresholds (Hardware vs Services vs Subscriptions) and customer tiers (`STANDARD`, `SMB`, `ENTERPRISE`, `STRATEGIC`) were ignored.
- **Remediation**:
  - Re-engineered `ApprovalRuleEngine`:
    - Computes **Effective Line Discount**: detects when `unitPrice < basePrice` and combines unit markdown with explicit line and header discounts.
    - Evaluates category discount ceilings against the customer segment tier.
    - Calculates a 0–100 **Blended Risk Score** incorporating excess discounts, margin erosion below 20%, and deal value thresholds.
  - Added `POST /quotations/preview` allowing reps and the UI builder to preview pricing, taxes, margin, and the required approval chain in real time before submission.
  - Enforced mandatory decision comments when rejecting or requesting changes on deals.

---

### 2.4 React Rules of Hooks Crash [FRONTEND-04]
- **Issue**: `apps/web/app/invoices/[id]/page.tsx` invoked `const { can } = usePermissions()` after an early loading check (`if (auth.isLoading || auth.data === null)`).
- **Impact**: When the page mounted, React executed different numbers of hooks between renders, crashing the invoice detail page.
- **Remediation**: Moved `usePermissions()` unconditionally to the top of `InvoiceDetailPage`.

---

### 2.5 Non-Transactional Workflows & State Inconsistency [ARCH-05]
- **Issue**:
  - `QuotationsService.transition` / `cancel`: Inventory reservation releases, line status updates, backorder cancellations, and quotation status updates ran as disconnected queries without a database transaction.
  - `ApprovalsService`: Submitting, approving, and rejecting deals updated approval steps and quotation statuses sequentially outside `this.prisma.$transaction`.
- **Remediation**: Wrapped all multi-step state transitions in `this.prisma.$transaction(async (tx) => ...)`, ensuring ACID rollback if any step fails.

---

### 2.6 Inventory Allocation Race Condition [CONCURRENCY-06]
- **Issue**: In `FulfillmentService.allocate()`, `fulfillment.lines` were queried outside the transaction. Although row locks (`SELECT ... FOR UPDATE`) were acquired on inventory, the line's `allocatedQty` and `backorderedQty` were read outside the lock. Concurrent allocation calls could double-allocate stock.
- **Remediation**: Re-read `fulfillmentLine` inside the transaction lock (`tx.fulfillmentLine.findUnique`), calculating remaining outstanding quantity atomically.

---

### 2.7 Concurrency Collision in Sequential Numbering [CONCURRENCY-07]
- **Issue**: Number generation for quotations (`Q-1xxx`), invoices (`INV-3xxx`), fulfillment orders (`F-2xxx`), and subscriptions (`SUB-5xxx`) used `count() + 1`. Deleted rows or concurrent inserts caused primary/unique key collisions (`Unique constraint failed on the fields: (number)`).
- **Remediation**: Implemented sequential lookups based on `findFirst({ orderBy: { createdAt: 'desc' } })` parsing the latest sequence number monotonically.

---

### 2.8 Cancelled Invoice Dead-End [LIFECYCLE-08]
- **Issue**: Cancelling an invoice set `invoice.status = CANCELLED`, but left the parent quotation in `INVOICED`. Subsequent calls to `generateFromQuotation` returned the cancelled invoice or failed, dead-ending the deal.
- **Remediation**: When cancelling an invoice linked to a quotation in `INVOICED` or `BILLING`, the quotation status is rolled back to `FULFILLED`, enabling correction and re-invoicing. `generateFromQuotation` filters out cancelled invoices.

---

### 2.9 Customer Negotiation Re-Evaluation & Salesperson Actions [WORKFLOW-09]
- **Issue**: Customer counter-offers moved the deal to `NEGOTIATION`, but the sales representative had no mechanism in the API or UI to review messages, accept counter-discounts, re-route to approvals, or reply.
- **Remediation**:
  - Added backend endpoint `POST /quotations/:id/apply-counter-discount` allowing representatives to accept requested discounts, automatically recalculating totals and triggering approval evaluation.
  - Added `POST /quotations/:id/negotiation/reply` for representative communication.
  - Built an interactive Negotiation Thread Card on quotation detail.

---

### 2.10 UI/UX Persona Gaps & Quotation Builder [UIUX-10]
- **Issue**:
  - The web application lacked a Quotation Builder (`/quotations/new`), preventing sales representatives from creating deals in the UI.
  - Quotation lifecycle stepper failed to highlight active states for `NEGOTIATION`, `CONVERTED_TO_FULFILLMENT`, `FULFILLED`, and `PARTIALLY_FULFILLED`.
  - Misleading button: Customer accounts saw an "Open Customer Portal View" button that returned 403.
  - Approvers could not view line items, customer tiers, or risk scores when deciding on deals.
  - Mutations lacked toast notifications.
- **Remediation**:
  - Built full **Quotation Builder** at `/quotations/new` with customer tier selector, category-filtered product catalog, unit price & line discount controls, live GST & margin calculations, and dynamic approval preview chips.
  - Added "+ New Quotation" CTA on the quotations list.
  - Implemented `ToastProvider` and `useToast` for user mutation feedback.
  - Updated `LifecycleStepper` with support for all pipeline milestones and active branch pills (`🤝 Customer Negotiation`, `⚠️ Changes Requested`, `✕ Rejected`, `Cancelled`).
  - Enriched `ApprovalDetailPage` with line items, customer segment tier, highlighted active decision step, and mandatory comments.
