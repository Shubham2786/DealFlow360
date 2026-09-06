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
          findFirst: jest.fn().mockResolvedValue(null),
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
        $transaction: jest.fn((cb) => cb(mockPrisma)),
      };
      mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
      stateMachine = new DealStateMachine();
      const approvalEngine = new (require('../approvals/approval-rule.engine').ApprovalRuleEngine)();
      const mockAppSettings = {
        get: jest.fn().mockResolvedValue('Q-'),
        getNumber: jest.fn((k, def) => Promise.resolve(def)),
        getString: jest.fn((k, def) => Promise.resolve(def)),
        getJSON: jest.fn((k, def) => Promise.resolve(def)),
        getAll: jest.fn().mockResolvedValue({}),
        setMany: jest.fn(),
      };
      service = new QuotationsService(mockPrisma, stateMachine, mockAudit, approvalEngine, mockAppSettings as any);
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

    it('rejects customer order creation with empty line items', async () => {
      await expect(
        service.createCustomerOrder({ lines: [] }, { id: 'c1', email: 'rita@acme.test', role: UserRole.CUSTOMER, permissions: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects customer order creation if no customer record matches user email', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);
      await expect(
        service.createCustomerOrder(
          { lines: [{ productId: 'p1', qty: 2 }] },
          { id: 'c1', email: 'unknown@test.com', role: UserRole.CUSTOMER, permissions: [] },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a customer order request in NEGOTIATION status with portal token', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({
        id: 'cust-acme',
        name: 'Acme Corp',
        quotations: [{ salespersonId: 'sales-sam' }],
      });
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 'p1', sku: 'SKU-100', basePrice: 10000, taxRate: 18, costPrice: 7000, active: true },
      ]);
      mockPrisma.quotation.create.mockImplementation((args: any) => ({
        id: 'q-cust-1',
        ...args.data,
      }));

      const res = await service.createCustomerOrder(
        { lines: [{ productId: 'p1', qty: 2 }], notes: 'Deliver by Friday' },
        { id: 'u-rita', email: 'rita@acme.test', role: UserRole.CUSTOMER, permissions: [] },
      );

      expect(res.quotation).toBeDefined();
      expect(res.token).toMatch(/^portal-/);
      expect(res.portalUrl).toBe(`/customer-portal/${res.token}`);
      expect(mockPrisma.quotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cust-acme',
            salespersonId: 'sales-sam',
            status: QuotationStatus.NEGOTIATION,
            subtotal: 20000,
            taxTotal: 3600,
            total: 23600,
          }),
        }),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CUSTOMER_ORDER_PLACED',
        }),
      );
    });
  });
});
