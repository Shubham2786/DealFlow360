import { Injectable } from '@nestjs/common';

export interface WarehouseAvailability {
  warehouseId: string;
  inventoryId: string;
  priority: number;
  available: number;
}

export interface AllocationPlanEntry {
  warehouseId: string;
  inventoryId: string;
  quantity: number;
}

export interface AllocationPlan {
  entries: AllocationPlanEntry[];
  allocated: number;
  backordered: number;
  reasons: string[];
}

/**
 * Pure, deterministic Priority-Fill allocation (project.md §12).
 * Given an outstanding quantity and per-warehouse availability, allocate greedily from
 * the highest-priority warehouse first (lower `priority` number = higher priority),
 * tiebreak by inventoryId for stability. Performs no I/O.
 */
@Injectable()
export class AllocationEngine {
  allocate(outstanding: number, availability: WarehouseAvailability[]): AllocationPlan {
    const reasons: string[] = [];
    if (outstanding <= 0) {
      return { entries: [], allocated: 0, backordered: 0, reasons: ['Nothing outstanding'] };
    }

    const ranked = [...availability]
      .filter((a) => a.available > 0)
      .sort((a, b) => (a.priority - b.priority) || a.inventoryId.localeCompare(b.inventoryId));

    const entries: AllocationPlanEntry[] = [];
    let remaining = outstanding;

    for (const wh of ranked) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, wh.available);
      if (take > 0) {
        entries.push({ warehouseId: wh.warehouseId, inventoryId: wh.inventoryId, quantity: take });
        reasons.push(`Allocated ${take} from warehouse ${wh.warehouseId} (priority ${wh.priority})`);
        remaining -= take;
      }
    }

    const allocated = outstanding - remaining;
    if (remaining > 0) reasons.push(`Backordered ${remaining} (insufficient stock)`);

    return { entries, allocated, backordered: remaining, reasons };
  }
}
