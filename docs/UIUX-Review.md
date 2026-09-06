# DealFlow360 — UI/UX Review & Improvement Plan

**Scope:** `apps/web` at commit `8f2673d` (Next.js App Router, Tailwind, TanStack Query). Reviewed against the hackathon brief's screens (B1–B9) and against the five personas (Sales Rep, Sales Manager, Finance/Ops, Customer, Admin).
**Method:** static review of every page/component; no design mock-ups were available beyond the brief, and the sandbox could not run the app against a live database, so findings are code-derived.

---

## 1. Summary

The UI is clean, consistent and fast to scan: one shell, one table style, badge/status vocabulary reused everywhere, INR/en-IN formatting centralised, sensible empty states. That is a good base.

But it is a **read-mostly console over the API** rather than the *working tool* the brief describes. The centrepiece of the product — the quotation builder with live margin, upsell panel, approval preview, warehouse split, billing schedule — does not exist in the web app; a rep cannot create a quotation from the UI at all. Several screens mislead users about what will happen (buttons that always fail, buttons that do nothing), error feedback is generic, and the customer portal is minimal but sound.

Priorities: (1) build the quotation builder and the "next action" model; (2) make every action truthful (only show what can succeed, explain what happened); (3) give managers/finance/ops queues instead of tables; (4) polish feedback, accessibility and responsiveness.

---

## 2. Persona journeys — what works, what breaks

### Sales Rep (USER)
| Step (brief §5/§9) | Today | Gap |
|---|---|---|
| Log in | Login page with demo shortcuts | Demo shortcuts leak credentials; fine for hackathon, must be gated. |
| Open workspace / create quotation | **No create page.** `api.quotations` has no `create`. Rep must use the API directly. | **Critical UX gap** — the primary job of the primary persona is impossible. |
| Add products, +/- qty, line/order discounts, live margin | — | Not built (B3). |
| Upsell / cross-sell panel with margin delta | — | Not built (B5). |
| Confirm → auto-routes to approval | "Submit for Approval" on detail page works; the *why/where* (chain preview, blended score) is not shown before submitting. | Rep cannot predict whether Finance will be involved. |
| Track approval & fulfillment status | Status badge + 8-step linear stepper | Stepper omits NEGOTIATION / CONVERTED / FULFILLED / PARTIALLY_FULFILLED so those states show *no* highlighted step; there is no link from a quote to its approval request or fulfillment order. |
| Respond to customer negotiation | Nothing — rep sees no thread, no counter-offer, no "apply counter-discount" action. | B8 second half missing. |
| Pipeline (Kanban) view | Table with a status dropdown | B2 asks for cards/kanban; table is acceptable but there is no grouping by stage, no totals per stage. |

### Sales Manager / Approver
| Need | Today | Gap |
|---|---|---|
| Queue of things awaiting *me* | `/approvals` lists **all** requests (all statuses, all levels); manager has to open each row to learn if it is their turn. | Needs "My queue" default filter (pending & current step role = mine), count in nav badge, oldest-first. |
| Decide with context | Detail page shows value/discount/margin/reason and chain ✅ | No line items, no customer tier, no historical rep discount average, no blended score (B4). Comment box is optional and not distinguished between approve/reject reasons. |
| Confirmation with audit entry (B4) | After deciding the page just refreshes; no toast, no "what happens next". | Add success state + audit row + link to quote. |
| Deal health monitoring | `/deal-health` table with drilldown links ✅ | No "nudge/escalate" actions (B9); anomalies list is flat, no grouping by deal, no filters, no time trend. |
| Configure tiers/chains | `/admin/config` (admin only) edits key/value settings | Settings do not affect behaviour (see Analysis H-11); UI presents them as policy — misleading. |

### Finance / Operations
| Need | Today | Gap |
|---|---|---|
| Second-level approvals | Same approvals page | Same queue problem. |
| Warehouse split screen: recommended split, accept/override, shipment count & cost (B6) | Fulfillment detail shows allocations *after* the fact; "Allocate" is a blind action. | No preview, no override, no cost. Allocate button visible on BACKORDERED orders but does nothing (Analysis M-06). |
| Backorder decisions / "Consolidate remaining backorder" prompt | Receive-stock form on Inventory page; success message shows count fulfilled. | No backorder list/queue, no per-deal backorder view, no consolidate prompt. |
| Billing: one-time vs recurring lines, schedule, proration, credit notes (B7) | Invoices list/detail + record payment; Subscriptions list with pause/resume/cancel. | No billing schedule, no proration, no link between a quote's recurring lines and a subscription, no credit note UI. |
| Reports with filters & export (A7) | Static KPI cards | No period/rep/status/product filters, no export. |

### Customer (portal + CUSTOMER login)
| Need | Today | Gap |
|---|---|---|
| Separate, restricted view | `/customer-portal/[token]` public page without app shell ✅ Clean, minimal, safe fields only. | Statuses shown raw (`PENDING_APPROVAL`, `CONVERTED_TO_FULFILLMENT`) — brief asks for Sent / Under Negotiation / Confirmed. |
| Line-level comments & counter discount | Single free-text + one discount field for the whole quote | No per-line comment/change request (B8). |
| Confirm with one click | "Accept" records acceptance but the deal does not progress; customer gets a thank-you and nothing else ever changes for them. | Set expectations ("your rep will confirm"), or make acceptance drive the order (backend change). |
| Logged-in customer dashboard | Dashboard with proposals/invoices/subscriptions ✅ good structure | "Open Customer Portal View" button on quote detail always 403s for this persona; nav item labelled "My Proposals" opens an internal-styled table with Salesperson column. |

### Admin
| Need | Today | Gap |
|---|---|---|
| Users & roles | Table + role dropdown ✅ | No search, no suspend/activate, no invite; role change signs the user out with no warning dialog. |
| Products / price lists / variants / warehouses / plans (A2, A4, A5) | Products create/toggle only | No edit form, no price lists, no variants, no warehouse or plan management UI (warehouses are seed-only). |
| Configuration | Key/value form | Fields are free text; thresholds accept any string; no validation or units. |

---

## 3. Cross-cutting UX issues

### 3.1 Truthfulness of controls
* Buttons shown that cannot succeed: customer "Open Customer Portal View" (403), "Allocate" on BACKORDERED (no-op).
* Buttons hidden by role but the API allows them — the UI is doing security theatre (backend issue, but the UI should also render consistent affordances).
* "Revise (back to Draft)" appears for `NEGOTIATION` even though there is no editing UI to revise anything.
* Cancel is allowed on `FULFILLED`/`INVOICED` deals with only a `confirm()` — destructive, irreversible, under-explained.

### 3.2 Feedback & errors
* No toast/notification system. Mutations succeed silently (page data refreshes) or fail with a small red line only on some pages (approvals, fulfillment, invoices); quotation detail shows **no** error for failed submit/cancel/convert.
* All query errors render "X could not be found" regardless of cause (403, 500, network).
* Native `confirm()` dialogs for destructive actions — inconsistent with the rest of the UI and not styleable/accessible.
* Loading: full-screen "Loading…" text on every page while `/auth/me` resolves; content flashes; lists show "Loading…" inside the card. No skeletons.

### 3.3 Navigation & information architecture
* 13 flat nav items for staff; no grouping (Sell / Approve / Deliver / Bill / Configure). Users see items they don't need (USER sees Customers, Products, Deal Health, Subscriptions).
* No global search, no breadcrumbs beyond "← Back to X", no cross-links between related objects (quote ↔ approval request ↔ fulfillment ↔ invoice ↔ subscription are only partially linked).
* Dashboard alerts link to list pages, not to the specific item.
* No "what should I do next" surface — the brief's whole pitch is a *self-governing deal engine*; the UI should lead with queues and next actions per persona.

### 3.4 Data display
* Money: two formatters (`inr(n)` rounds to ₹0 decimals in lists, `inr(n,true)` in detail) → the same total can read ₹5,40,000 in one place and ₹5,39,999.60 in another.
* Percentages shown as raw `Number(x)%` (e.g. `12.5%`), fine; margins shown even when the cost model is synthetic — consider labelling "est. margin".
* Dates via `toLocaleDateString('en-IN')` ✅; timestamps in activity feed use full `toLocaleString` — verbose.
* Tables have no sorting, no column alignment for numbers beyond `tabular-nums`, no sticky headers, no row density options; `min-w-[720px]` + `overflow-x-auto` handles small screens acceptably.

### 3.5 Forms
* Products/Customers/Inventory/Subscriptions forms are inline side cards without validation messages, without required markers beyond browser defaults, and reset silently on success.
* Customer create allows any e-mail with no uniqueness feedback (backend has none).
* Admin config: all values as text inputs; no types/units/help text.

### 3.6 Accessibility
* Colour is the only status signal in badges (red/amber/green); add icons or text prefixes for colour-blind users.
* Badge contrast (`text-amber-700` on `bg-amber-100`) is borderline AA for small text.
* Sidebar links have `aria-current` ✅; but buttons lack `aria-busy`/`aria-live` for pending states; tables lack `<caption>`/`scope`.
* Native `confirm()` and no focus management after mutations.
* Icon-only "×"/emoji usage minimal ✅; demo login buttons use emoji as the only differentiator prefix (fine).

### 3.7 Responsiveness
* Fixed `w-60` sidebar with no collapse — unusable below ~900 px; header hides user name on `sm` but sidebar remains.
* Dashboard KPI grid `grid-cols-2 md:grid-cols-4` ✅.
* Portal page is responsive ✅.

### 3.8 Performance/perceived speed
* Every query polls every 15 s and whole cache is invalidated on any mutation → flicker of "Loading…" states is avoided (data kept), but network chatter is high and stale-time is only 5 s.
* Login page also mounts nothing heavy ✅. Public portal page includes the QueryClient with polling — harmless.

### 3.9 Copy & consistency
* Mixed terminology: "Quotation"/"Deal"/"Proposal"/"Order" used interchangeably; "Fulfill Allocated" vs "Fulfillment"; "Approved" tile means "APPROVED status count" but reads like "approved deals ever".
* Enum labels are `status.replaceAll('_',' ')` — `CONVERTED TO FULFILLMENT`, `PARTIALLY ALLOCATED` in all caps; map to human labels.
* "Order Management · India (₹ INR, GST)" header text is static filler.

---

## 4. Recommended improvements (prioritised)

### P0 — Make the core job possible and truthful
1. **Quotation Builder** (`/quotations/new`, `/quotations/[id]/edit`): customer picker (shows tier), product search grouped by category (Hardware / Services / Subscriptions), qty +/- , line discount, header discount, **live totals, GST per line, margin indicator, and an "Approval preview" chip** ("Within authority" / "Manager" / "Manager → Finance") computed by a `POST /quotations/preview` endpoint. Autosave draft; "Confirm & Submit" primary action.
2. **Fix misleading controls**: remove customer-facing "Open Customer Portal View" (link straight to `/customer-portal/<token>` from dashboard); hide "Allocate" when nothing is outstanding or relabel "Retry backorders"; disable Cancel after shipment with explanatory tooltip.
3. **Global feedback system**: toast provider (success/error), inline error banners on every mutation, map 401/403/404/500 to distinct messages; replace `confirm()` with an accessible modal that states consequences ("releases 5 reserved units, cancels 1 backorder").
4. **Persona home = queue**: Manager/Finance dashboards lead with "Awaiting your decision (n)"; Ops with "Orders to allocate / Backorders waiting / Ready to ship"; Rep with "Drafts / Changes requested / Customer responded". Alerts deep-link to the item.

### P1 — Complete the brief's screens
5. **Approval screen (B4)**: show line items with per-line ceiling vs given discount and the blended risk score (needs backend C-03), customer tier, rep's historical avg discount, chain with *current step highlighted*, required comment on reject/request-changes, confirmation panel with the audit entry and a link back.
6. **Fulfillment split screen (B6)**: "Suggested split" preview table (warehouse, qty, est. shipments, cost) → *Accept suggested split* / *Manual override* (editable qty per warehouse with live ATP) → confirmation. Backorder panel with "Consolidate remaining backorder" prompt when stock arrives.
7. **Negotiation thread for reps**: on quote detail, show customer messages, requested discount, and actions "Apply counter-offer (re-route approval)" / "Decline / Reply".
8. **Customer portal (B8)**: per-line comment icon → change request; human status labels; after accept show "Confirmed — your sales representative will schedule fulfillment"; show negotiation history; brand the page (company name from settings).
9. **Billing screen (B7)**: quote detail shows one-time vs recurring lines separately; subscription detail with schedule (next N billing dates), change-quantity with proration preview, cancel with refund/credit-note preview.
10. **Lifecycle visual**: replace the 8-step linear stepper with a stage bar that includes Negotiation / Converted / Fulfilled / Partially fulfilled, plus linked chips to the approval request, fulfillment order, invoices and subscriptions.

### P2 — Polish & scale
11. Group navigation (Sell · Approve · Deliver · Bill · Insights · Admin), collapsible sidebar, role-tailored menus (hide catalog/customers from USER unless needed), badge counts on Approvals/Fulfillment.
12. Tables: sort, server-side pagination, sticky header, right-aligned numerics, empty-state CTAs ("Create your first quotation").
13. Human labels for every enum; one money formatter with consistent precision (₹ with paise in documents, rounded in KPIs — but never both for the same figure on one page).
14. Reports: period / rep / status / product filters; CSV/PDF export; charts for pipeline by stage and discount distribution.
15. Deal Health: group anomalies by deal, filter by type/severity, actions "Nudge rep" / "Escalate to manager" (audit-logged), trend sparkline.
16. Admin: product edit form, warehouse & plan management, discount-ceiling matrix editor (tier × category) instead of free-text settings, user invite/suspend.
17. Accessibility: badge icons + text, AA contrast check, `aria-live` regions for mutation results, focus return after modals, table semantics.
18. Skeleton loaders instead of "Loading…" text; scoped query invalidation; longer stale time for reference data (products, warehouses).

### P3 — Nice to have
19. Kanban pipeline view with per-stage totals and drag-to-stage (validated by the backend state machine).
20. Command palette / global search (Q-number, customer, INV-number).
21. Dark mode via the existing Tailwind tokens.
22. Print/PDF layout for quotation and invoice.

---

## 5. Component-level notes

| File | Note |
|---|---|
| `components/ui.tsx` `LifecycleStepper` | Add missing states; render branches (NEGOTIATION, CHANGES_REQUESTED, REJECTED) as side chips; show CANCELLED as terminal band. |
| `components/ui.tsx` `Badge` | Accept `icon`; ensure text alternatives; unify `kind` casing (`CRITICAL` vs `critical` both exist). |
| `components/app-shell.tsx` | Group nav; collapse on `<lg`; show pending-count badges; move user menu into a dropdown with "Sign out". |
| `app/quotations/page.tsx` | Add "New quotation" CTA (DEAL_CREATE); stage grouping; hide Salesperson/Margin columns for customers (margin already hidden ✅). |
| `app/quotations/[id]/page.tsx` | Add error banner; add negotiation thread; link to approval/fulfillment/invoices; remove customer portal button for CUSTOMER; show "Approval preview" for DRAFT. |
| `app/approvals/page.tsx` | Default filter PENDING + "my step"; oldest first; show current step role column. |
| `app/approvals/[id]/page.tsx` | Line items, tier, blended score, required comment on negative decisions, success panel. |
| `app/fulfillment/[id]/page.tsx` | Split preview & override; hide/relabel Allocate; show backorders panel with ETA/receipts. |
| `app/inventory/page.tsx` | Show open backorders per product; disable receive into inactive warehouses; success toast. |
| `app/invoices/[id]/page.tsx` | **Fix hooks-order bug** (`usePermissions` after early return crashes the page); add payment reference field; show outstanding prominently; credit-note action. |
| `app/subscriptions/page.tsx` | Add create form/link from quote; detail page with schedule; confirm modal with consequences. |
| `app/customer-portal/[token]/page.tsx` | Human statuses, per-line comments, history, branded header, accessible buttons with `aria-busy`. |
| `app/dashboard/page.tsx` | Queue-first layout per persona; deep-linked alerts; skeletons. |
| `app/admin/config/page.tsx` | Typed fields (number/percent/currency), help text, and clearly state which settings are live (today: none). |
| `app/auth/login/page.tsx` | Gate demo shortcuts behind `NEXT_PUBLIC_DEMO_MODE`; add "forgot password" placeholder; show server error inline ✅ already. |

---

*End of UI/UX review.*
