# Database Design & Schema — DealFlow360

> Authoritative DB reference. Domain context in `/project.md` §10. PostgreSQL 16 via Docker,
> accessed through Prisma (migrations + client). IDs `cuid()`; `createdAt`/`updatedAt`
> managed by Prisma. Historical/audit records preserve references; prefer soft-deactivation
> over hard deletes for referenced entities.

## Overview & Engine

Relational, normalized schema. Correctness relies on FKs, unique/CHECK constraints, indexes,
and transactions with row locking (allocation). The Quotation is the aggregate root of a
Deal; other aggregates attach to it.

## Data Models & Schema (by module)

**Auth/Users**: User(email unique, passwordHash, active), Role, Permission,
RolePermission, UserRole, RefreshToken, AuditEvent(actor, entityType, entityId, action,
metadata, createdAt).

**Customers**: Customer(name, segment, active), Contact(customerId, name, email, phone),
Address(customerId, type billing/shipping, lines...).

**Products/Pricing**: Product(sku unique, name, categoryId, type ONE_TIME/RECURRING, uom,
active), ProductCategory, TaxRate, Price(productId, base, currency), Pricelist,
PricelistEntry(pricelistId, productId?, segment?, minQty?, contractMonths?, adjustment).

**Discounts/Approval config**: DiscountTier(minPct, maxPct, category?, segment?,
requiredLevel), ApprovalRule(conditions: discount/value/margin/terms/duration →
requiredLevels), ApprovalLevel(name, order, role).

**Quotations**: Quotation(number unique, customerId, salespersonId, status, discountPct,
subtotal, discountTotal, taxTotal, total, margin, terms, createdAt, expiresAt, version),
QuotationLine(quotationId, productId, qty, unitPrice, discountPct, taxRate, subtotal,
availability?, allocationStatus?).

**Approvals**: ApprovalRequest(quotationId, status, reason), ApprovalStep(requestId, level,
approverId?, status, decidedAt, comment).

**Negotiation**: PortalToken(quotationId, token unique, expiresAt, revoked),
Negotiation(quotationId, status), NegotiationMessage(negotiationId, author internal/customer,
body, requestedChange json).

**Fulfillment/Inventory** (reused): Warehouse(code unique, priority, active),
Inventory(productId, warehouseId, onHand, reserved; unique (productId,warehouseId)),
InventoryReceipt(warehouseId, productId, quantity, reference unique, receivedAt),
Fulfillment(quotationId, status), FulfillmentLine(fulfillmentId, productId, orderedQty,
allocatedQty, fulfilledQty, backorderedQty, status), Allocation(fulfillmentLineId,
warehouseId, inventoryId, reservationId, quantity, source, strategy, status, createdAt),
Reservation(inventoryId, fulfillmentLineId, quantity, status, timestamps),
Backorder(fulfillmentLineId, originalQty, remainingQty, priority, status),
AllocationHistory(fulfillmentLineId, warehouseId, inventoryId, quantity, source, strategy,
reason, createdAt).

**Subscriptions/Billing**: Subscription(quotationId?, customerId, plan, frequency, qty,
recurringAmount, startDate, endDate, status, nextBillingDate), SubscriptionLine,
BillingAgreement(subscriptionId, customerId, paymentTerms, status),
BillingPeriod(agreementId, periodStart, periodEnd, amount, status, invoiceId?).

**Invoices/Payments**: Invoice(number unique, customerId, quotationId?, subscriptionId?,
billingPeriodId?, issueDate, dueDate, subtotal, discountTotal, taxTotal, total, paidAmount,
status), InvoiceLine(invoiceId, productId?, description, qty, unitPrice, discountPct,
taxRate, lineTotal), Payment(invoiceId, amount, method, receivedAt, reference).

## Relationships & Foreign Keys

See `/project.md` §10 for the full relationship map. Key aggregates: Customer 1─N Quotation;
Quotation 1─N Line/ApprovalRequest/Negotiation/Fulfillment/Subscription/Invoice; Product
referenced by lines/inventory/pricing/subscription/invoice; every entity 1─N AuditEvent.

## Migrations & Versioning

Prisma migrations under `prisma/migrations/`. Raw-SQL CHECK constraints:
`inventory.onHand>=0`, `reserved>=0`, `reserved<=onHand`; positive quantities on
receipt/reservation/allocation/invoice lines; `allocatedQty+backorderedQty<=orderedQty`;
`paidAmount<=total` (or explicit overpayment handling); discount pct in [0,100].

## Indexing & Performance

`quotation(status)`, `quotation(customerId)`, `quotationLine(quotationId)`,
`approvalRequest(quotationId)`, `approvalStep(requestId)`, `inventory(productId,warehouseId)`,
`reservation(inventoryId)`, `reservation(fulfillmentLineId)`, `backorder(status)`,
`allocationHistory(fulfillmentLineId)`, `invoice(status)`, `invoice(customerId)`,
`invoice(dueDate)`, `auditEvent(entityType, entityId)`. Revisit from real query patterns.

## Backup & Data Integrity

Integrity via FKs, unique + CHECK constraints, and transactional writes; allocation uses
READ COMMITTED + ordered `SELECT ... FOR UPDATE` (ADR-0004). Idempotency via unique
`inventoryReceipt.reference` and per-period invoice generation. Local dev data reproducible
from `prisma/seed.ts`; no production backup strategy in v1.
