import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuotationStatus, UserRole } from '@dealflow/shared';
import { QuotationsService } from './quotations.service';
import { DealStateMachine } from './deal-state-machine';

describe('Edge Cases & Hardening', () => {
  describe('QuotationsService Pricing & Validation Bounds', () => {
    let service: QuotationsService;
    let mockPrisma: any;
    let mockAudit: any;
    let stateMachine: DealStateMachine;

    beforeEach(() => {
      mockPrisma = {
        quotation: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
        },
        customer: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
        },
        product: {
          findMany: jest.fn(),
        },
        fulfillment: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        fulfillmentLine: {
          update: jest.fn(),
        },
        inventory: {
          update: jest.fn(),
        },
        reservation: {
          update: jest.fn(),
        },
        backorder: {
          updateMany: jest.fn(),
        },
      };
      mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
      stateMachine = new DealStateMachine();
      service = new QuotationsService(mockPrisma, stateMachine, mockAudit);
    });

    it('rejects quotation creation when customer does not exist', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue(null);
      await expect(
        service.create({
          customerId: 'invalid-cust',
          lines: [{ productId: 'p1', qty: 2 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects header discount > 100% or < 0%', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'c1' });
      await expect(
        service.create({
          customerId: 'c1',
          discountPct: 105,
          lines: [{ productId: 'p1', qty: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create({
          customerId: 'c1',
          discountPct: -5,
          lines: [{ productId: 'p1', qty: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative unit price or line discount > 100%', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'c1' });
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', basePrice: 100, taxRate: 18 },
      ]);

      await expect(
        service.create({
          customerId: 'c1',
          lines: [{ productId: 'p1', qty: 1, unitPrice: -20 }],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create({
          customerId: 'c1',
          lines: [{ productId: 'p1', qty: 1, discountPct: 120 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('redacts margin percentage for CUSTOMER role viewer in list and get', async () => {
      const mockQuotes = [
        {
          id: 'q1',
          number: 'Q-1001',
          marginPct: 35.5,
          customer: { contactEmail: 'rita@acme.test', name: 'Acme Corp' },
        },
      ];
      mockPrisma.quotation.findMany.mockResolvedValue(mockQuotes);
      mockPrisma.quotation.findUnique.mockResolvedValue(mockQuotes[0]);

      const viewer = { id: 'u1', email: 'rita@acme.test', role: UserRole.CUSTOMER, permissions: [] };
      const listed = await service.list(viewer);
      expect(listed[0].marginPct).toBe(0);

      const fetched = await service.get('q1', viewer);
      expect(fetched.marginPct).toBe(0);
    });

    it('denies CUSTOMER access to another customer company quote', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue({
        id: 'q2',
        customer: { contactEmail: 'other@globex.test' },
      });
      const viewer = { id: 'u1', email: 'rita@acme.test', role: UserRole.CUSTOMER, permissions: [] };
      await expect(service.get('q2', viewer)).rejects.toThrow(ForbiddenException);
    });

    it('releases active inventory reservations when a quotation is cancelled', async () => {
      mockPrisma.quotation.findUnique.mockResolvedValue({
        id: 'q-live',
        number: 'Q-888',
        status: QuotationStatus.DRAFT,
      });
      mockPrisma.quotation.update.mockResolvedValue({ id: 'q-live', status: QuotationStatus.CANCELLED });
      mockPrisma.fulfillment.findUnique.mockResolvedValue({
        id: 'f1',
        lines: [
          {
            id: 'fl1',
            reservations: [
              { id: 'res1', inventoryId: 'inv1', quantity: 5, status: 'ACTIVE' },
            ],
          },
        ],
      });

      await service.cancel('q-live', { id: 'u1', name: 'Admin' });

      // Inventory unreserved
      expect(mockPrisma.inventory.update).toHaveBeenCalledWith({
        where: { id: 'inv1' },
        data: { reserved: { decrement: 5 } },
      });
      // Reservation released
      expect(mockPrisma.reservation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'res1' },
          data: expect.objectContaining({ status: 'RELEASED' }),
        }),
      );
      // Backorders cancelled
      expect(mockPrisma.backorder.updateMany).toHaveBeenCalled();
    });
  });
});
