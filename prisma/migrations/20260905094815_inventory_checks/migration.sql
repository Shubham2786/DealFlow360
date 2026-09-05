-- Inventory invariants enforced at the database level as a backstop to the
-- allocation transaction (project.md §9).

ALTER TABLE "inventory"
  ADD CONSTRAINT "inventory_onhand_nonneg" CHECK ("onHand" >= 0),
  ADD CONSTRAINT "inventory_reserved_nonneg" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "inventory_reserved_le_onhand" CHECK ("reserved" <= "onHand");

ALTER TABLE "fulfillment_lines"
  ADD CONSTRAINT "fline_qty_nonneg" CHECK (
    "orderedQty" >= 0 AND "allocatedQty" >= 0 AND "fulfilledQty" >= 0 AND "backorderedQty" >= 0
  ),
  ADD CONSTRAINT "fline_alloc_le_ordered" CHECK ("allocatedQty" + "backorderedQty" <= "orderedQty");

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservation_qty_pos" CHECK ("quantity" > 0);

ALTER TABLE "allocations"
  ADD CONSTRAINT "allocation_qty_pos" CHECK ("quantity" > 0);

ALTER TABLE "backorders"
  ADD CONSTRAINT "backorder_qty_bounds" CHECK ("remainingQty" >= 0 AND "remainingQty" <= "originalQty");

ALTER TABLE "inventory_receipts"
  ADD CONSTRAINT "receipt_qty_pos" CHECK ("quantity" > 0);
