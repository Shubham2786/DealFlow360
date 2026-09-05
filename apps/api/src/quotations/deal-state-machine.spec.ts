import { ConflictException } from '@nestjs/common';
import { QuotationStatus } from '@dealflow/shared';
import { DealStateMachine } from './deal-state-machine';

describe('DealStateMachine', () => {
  let sm: DealStateMachine;

  beforeEach(() => {
    sm = new DealStateMachine();
  });

  describe('valid transitions', () => {
    it('allows DRAFT to advance to SUBMITTED, PENDING_APPROVAL, or CANCELLED', () => {
      expect(sm.canTransition(QuotationStatus.DRAFT, QuotationStatus.SUBMITTED)).toBe(true);
      expect(sm.canTransition(QuotationStatus.DRAFT, QuotationStatus.PENDING_APPROVAL)).toBe(true);
      expect(sm.canTransition(QuotationStatus.DRAFT, QuotationStatus.CANCELLED)).toBe(true);
    });

    it('allows PENDING_APPROVAL to be approved, rejected, or enter negotiation', () => {
      expect(sm.canTransition(QuotationStatus.PENDING_APPROVAL, QuotationStatus.APPROVED)).toBe(true);
      expect(sm.canTransition(QuotationStatus.PENDING_APPROVAL, QuotationStatus.REJECTED)).toBe(true);
      expect(sm.canTransition(QuotationStatus.PENDING_APPROVAL, QuotationStatus.CHANGES_REQUESTED)).toBe(true);
      expect(sm.canTransition(QuotationStatus.PENDING_APPROVAL, QuotationStatus.NEGOTIATION)).toBe(true);
    });

    it('allows APPROVED deal to convert to fulfillment or re-enter negotiation', () => {
      expect(sm.canTransition(QuotationStatus.APPROVED, QuotationStatus.CONVERTED_TO_FULFILLMENT)).toBe(true);
      expect(sm.canTransition(QuotationStatus.APPROVED, QuotationStatus.NEGOTIATION)).toBe(true);
    });

    it('tracks full lifecycle to COMPLETED', () => {
      expect(sm.canTransition(QuotationStatus.CONVERTED_TO_FULFILLMENT, QuotationStatus.FULFILLING)).toBe(true);
      expect(sm.canTransition(QuotationStatus.FULFILLING, QuotationStatus.FULFILLED)).toBe(true);
      expect(sm.canTransition(QuotationStatus.FULFILLED, QuotationStatus.BILLING)).toBe(true);
      expect(sm.canTransition(QuotationStatus.BILLING, QuotationStatus.INVOICED)).toBe(true);
      expect(sm.canTransition(QuotationStatus.INVOICED, QuotationStatus.PAID)).toBe(true);
      expect(sm.canTransition(QuotationStatus.PAID, QuotationStatus.COMPLETED)).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    it('rejects skipping states (e.g. DRAFT to COMPLETED)', () => {
      expect(sm.canTransition(QuotationStatus.DRAFT, QuotationStatus.COMPLETED)).toBe(false);
      expect(() => sm.assertTransition(QuotationStatus.DRAFT, QuotationStatus.COMPLETED)).toThrow(
        ConflictException,
      );
    });

    it('rejects transitioning from terminal states', () => {
      expect(sm.canTransition(QuotationStatus.COMPLETED, QuotationStatus.DRAFT)).toBe(false);
      expect(sm.canTransition(QuotationStatus.CANCELLED, QuotationStatus.DRAFT)).toBe(false);
      expect(sm.nextStates(QuotationStatus.COMPLETED)).toEqual([]);
      expect(sm.nextStates(QuotationStatus.CANCELLED)).toEqual([]);
    });

    it('rejects unapproved deal converting to fulfillment', () => {
      expect(sm.canTransition(QuotationStatus.DRAFT, QuotationStatus.CONVERTED_TO_FULFILLMENT)).toBe(false);
      expect(sm.canTransition(QuotationStatus.PENDING_APPROVAL, QuotationStatus.CONVERTED_TO_FULFILLMENT)).toBe(false);
      expect(() =>
        sm.assertTransition(QuotationStatus.PENDING_APPROVAL, QuotationStatus.CONVERTED_TO_FULFILLMENT),
      ).toThrow(ConflictException);
    });
  });
});
