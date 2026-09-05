import { Injectable, ConflictException } from '@nestjs/common';
import { QuotationStatus } from '@dealflow/shared';

/**
 * Authoritative transition table for the Deal/Quotation lifecycle (project.md §11.1).
 * Any status change must pass through here so invalid transitions are rejected.
 */
const TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  [QuotationStatus.DRAFT]: [QuotationStatus.SUBMITTED, QuotationStatus.PENDING_APPROVAL, QuotationStatus.CANCELLED],
  [QuotationStatus.SUBMITTED]: [QuotationStatus.PENDING_APPROVAL, QuotationStatus.CANCELLED],
  [QuotationStatus.PENDING_APPROVAL]: [
    QuotationStatus.APPROVED,
    QuotationStatus.REJECTED,
    QuotationStatus.CHANGES_REQUESTED,
    QuotationStatus.NEGOTIATION,
    QuotationStatus.CANCELLED,
  ],
  [QuotationStatus.CHANGES_REQUESTED]: [QuotationStatus.DRAFT, QuotationStatus.CANCELLED],
  [QuotationStatus.REJECTED]: [QuotationStatus.DRAFT, QuotationStatus.CANCELLED],
  [QuotationStatus.NEGOTIATION]: [
    QuotationStatus.PENDING_APPROVAL,
    QuotationStatus.DRAFT,
    QuotationStatus.CANCELLED,
  ],
  [QuotationStatus.APPROVED]: [
    QuotationStatus.CONVERTED_TO_FULFILLMENT,
    QuotationStatus.NEGOTIATION,
    QuotationStatus.CANCELLED,
  ],
  [QuotationStatus.CONVERTED_TO_FULFILLMENT]: [QuotationStatus.FULFILLING, QuotationStatus.CANCELLED],
  [QuotationStatus.FULFILLING]: [
    QuotationStatus.FULFILLED,
    QuotationStatus.PARTIALLY_FULFILLED,
    QuotationStatus.CANCELLED,
  ],
  [QuotationStatus.PARTIALLY_FULFILLED]: [
    QuotationStatus.FULFILLED,
    QuotationStatus.BILLING,
    QuotationStatus.CANCELLED,
  ],
  [QuotationStatus.FULFILLED]: [QuotationStatus.BILLING, QuotationStatus.CANCELLED],
  [QuotationStatus.BILLING]: [QuotationStatus.INVOICED, QuotationStatus.CANCELLED],
  [QuotationStatus.INVOICED]: [QuotationStatus.PAID, QuotationStatus.CANCELLED],
  [QuotationStatus.PAID]: [QuotationStatus.COMPLETED],
  [QuotationStatus.COMPLETED]: [],
  [QuotationStatus.CANCELLED]: [],
};

@Injectable()
export class DealStateMachine {
  canTransition(from: QuotationStatus, to: QuotationStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  nextStates(from: QuotationStatus): QuotationStatus[] {
    return TRANSITIONS[from] ?? [];
  }

  assertTransition(from: QuotationStatus, to: QuotationStatus): void {
    if (!this.canTransition(from, to)) {
      throw new ConflictException(`Invalid transition: ${from} → ${to}`);
    }
  }
}
