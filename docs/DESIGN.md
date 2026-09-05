# Design System — DealFlow360

> Authoritative UI/UX reference. Context in `/project.md` §14–16. The reference wireframe is
> used only as a page-map; its visual style is **not** reproduced (spec §34).

## Product Design Principles

A modern enterprise SaaS application for B2B sales/order management. Priorities: clear
hierarchy, strong typography, consistent spacing, accessible contrast, unambiguous status
indicators, fast navigation, useful empty states, clear destructive-action confirmation,
minimal visual clutter. Pages consume and modify shared domain state; actions are
state-aware and permission-aware.

## Visual Language

Clean, data-first, information-dense where operational. Neutral surfaces; meaning carried by
semantic status color + text (never color alone). Consistent card/table/section patterns
across modules.

## Colors

Semantic status palette (Tailwind tokens), applied via a shared `DealStatusBadge`:
- Draft / neutral — slate
- Submitted / pending / info — blue
- Approved / active / paid / healthy — green
- Warning / partially allocated / past-due-soon — amber
- Rejected / failed / critical / overdue — red
Surfaces white / slate-50; borders slate-200. Contrast meets WCAG AA targets.

## Typography

System/sans stack. Hierarchy: page title (xl/bold), section headings (lg/semibold), table
headers (sm/medium/uppercase muted), body (sm). Monetary and quantity values use tabular
figures and right alignment.

## Spacing

Tailwind spacing scale; consistent page padding, card gaps, table cell padding. Related data
grouped into clearly separated sections/cards.

## Components

Shared library (spec §25): **Data** (DataTable, Pagination, SearchBar, FilterBar,
SortControls, EmptyState, ErrorState, LoadingSkeleton); **Entity** (CustomerSummary,
ProductSummary, QuoteSummary, OrderSummary, InvoiceSummary, DealStatusBadge); **Workflow**
(LifecycleStepper, ApprovalChain, StatusTimeline, ActivityTimeline, AuditHistory);
**Financial** (PriceBreakdown, DiscountBreakdown, TaxBreakdown, InvoiceSummary);
**Operational** (InventoryAvailability, AllocationStatus, BackorderIndicator,
FulfillmentProgress); **UX** (ConfirmModal, Toast, FormField/validation, ErrorBoundary,
PermissionDenied). Reuse over per-page duplication.

## Layout

Persistent sidebar navigation across modules + top bar (search, notifications, profile).
Detail pages: header + sectioned body + related-entity navigation panel enabling
forward/backward traversal with preserved context (spec §24).

## Responsive Design

Works across desktop/laptop/tablet, and mobile where practical. Dense operational tables use
horizontal scroll, responsive columns, detail drawers, or mobile cards — information
architecture is preserved rather than crushed (spec §33).

## Accessibility

Semantic HTML, labeled controls, sufficient contrast, status via text + color, keyboard
navigation for actions/dialogs, visible focus. Note: full WCAG conformance requires manual
assistive-technology testing and expert review beyond automated checks.

## UX Rules

- Every major page implements loading (skeleton), empty (+next action), error (+retry),
  unauthorized, not-found, partial-data, mutation-loading (no double submit), and success
  feedback states (spec §32).
- Destructive actions require confirmation dialogs.
- Actions shown are state-aware and permission-aware; irrelevant actions are hidden.
- Fulfillment UI never claims fulfilled without real allocation; ordered/available/allocated/
  backordered are always explicit.
- Customer portal shows only customer-safe fields.
