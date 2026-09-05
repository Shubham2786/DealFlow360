import { AllocationEngine, type WarehouseAvailability } from './allocation.engine';

describe('AllocationEngine', () => {
  let engine: AllocationEngine;

  beforeEach(() => {
    engine = new AllocationEngine();
  });

  it('returns empty plan when outstanding quantity is 0 or negative', () => {
    const plan = engine.allocate(0, [{ warehouseId: 'w1', inventoryId: 'inv1', priority: 10, available: 50 }]);
    expect(plan.allocated).toBe(0);
    expect(plan.backordered).toBe(0);
    expect(plan.entries).toHaveLength(0);
  });

  it('fully allocates from the highest-priority warehouse when stock is sufficient', () => {
    const availability: WarehouseAvailability[] = [
      { warehouseId: 'w-low', inventoryId: 'inv-2', priority: 50, available: 100 },
      { warehouseId: 'w-high', inventoryId: 'inv-1', priority: 10, available: 100 },
    ];

    const plan = engine.allocate(25, availability);

    expect(plan.allocated).toBe(25);
    expect(plan.backordered).toBe(0);
    expect(plan.entries).toEqual([
      { warehouseId: 'w-high', inventoryId: 'inv-1', quantity: 25 },
    ]);
  });

  it('splits allocation across warehouses in priority order when first warehouse cannot fulfill completely', () => {
    const availability: WarehouseAvailability[] = [
      { warehouseId: 'w-secondary', inventoryId: 'inv-2', priority: 20, available: 15 },
      { warehouseId: 'w-primary', inventoryId: 'inv-1', priority: 10, available: 10 },
      { warehouseId: 'w-tertiary', inventoryId: 'inv-3', priority: 30, available: 50 },
    ];

    const plan = engine.allocate(20, availability);

    expect(plan.allocated).toBe(20);
    expect(plan.backordered).toBe(0);
    expect(plan.entries).toEqual([
      { warehouseId: 'w-primary', inventoryId: 'inv-1', quantity: 10 },
      { warehouseId: 'w-secondary', inventoryId: 'inv-2', quantity: 10 },
    ]);
  });

  it('allocates partial stock and creates a backorder when total stock across all warehouses is insufficient', () => {
    const availability: WarehouseAvailability[] = [
      { warehouseId: 'w1', inventoryId: 'inv1', priority: 10, available: 8 },
      { warehouseId: 'w2', inventoryId: 'inv2', priority: 20, available: 4 },
    ];

    const plan = engine.allocate(20, availability);

    expect(plan.allocated).toBe(12);
    expect(plan.backordered).toBe(8);
    expect(plan.entries).toEqual([
      { warehouseId: 'w1', inventoryId: 'inv1', quantity: 8 },
      { warehouseId: 'w2', inventoryId: 'inv2', quantity: 4 },
    ]);
    expect(plan.reasons).toContain('Backordered 8 (insufficient stock)');
  });

  it('creates 100% backorder when all warehouses have 0 available inventory', () => {
    const availability: WarehouseAvailability[] = [
      { warehouseId: 'w1', inventoryId: 'inv1', priority: 10, available: 0 },
      { warehouseId: 'w2', inventoryId: 'inv2', priority: 20, available: 0 },
    ];

    const plan = engine.allocate(15, availability);

    expect(plan.allocated).toBe(0);
    expect(plan.backordered).toBe(15);
    expect(plan.entries).toHaveLength(0);
  });
});
