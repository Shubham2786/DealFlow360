import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InvoiceStatus, UserRole } from '@dealflow/shared';
import { BillingService } from './billing.service';
import { DealStateMachine } from '../quotations/deal-state-machine';

describe('Billing Security & Hardening', () => {
  let service: BillingService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockAppSettings: any;
  let stateMachine: DealStateMachine;

  beforeEach(() => {
    mockPrisma = {
      invoice: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
      },
      quotation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };
    mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
    mockAppSettings = {
      get: jest.fn().mockResolvedValue('INV-'),
      getNumber: jest.fn().mockResolvedValue(30),
    };
    stateMachine = new DealStateMachine();

    service = new BillingService(
      mockPrisma,
      stateMachine,
      mockAudit,
      mockAppSettings,
    );
  });

  describe('Invoice IDOR Scoping', () => {
    it('scopes list queries to own deals for standard sales rep', async () => {
      mockPrisma.invoice.findMany.mockResolvedValue([]);

      const user = {
        id: 'rep-1',
        email: 'rep@dealflow.test',
        role: UserRole.USER,
        permissions: [],
      };

      await service.list(user);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            quotation: {
              OR: [{ createdById: 'rep-1' }, { salespersonId: 'rep-1' }],
            },
          }),
        }),
      );
    });

    it('denies standard sales rep access to another reps invoice in get()', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        customer: { contactEmail: 'client@company.test' },
        quotation: {
          id: 'quote-1',
          createdById: 'rep-2',
          salespersonId: 'rep-2',
        },
      });

      const rep1 = {
        id: 'rep-1',
        email: 'rep1@dealflow.test',
        role: UserRole.USER,
        permissions: [],
      };

      await expect(service.get('inv-1', rep1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('Payment Overpayment Protection & Race Condition Guard', () => {
    it('rejects payments exceeding the remaining invoice balance', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-2',
        number: 'INV-3002',
        status: InvoiceStatus.ISSUED,
        total: 1000,
        paidAmount: 800, // remaining balance: 200
        customer: {},
        quotation: {},
      });

      const actor = { id: 'finance-1', name: 'Fiona Finance' };

      await expect(
        service.recordPayment('inv-2', { amount: 300 }, actor),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.recordPayment('inv-2', { amount: 300 }, actor),
      ).rejects.toThrow(/Payment exceeds outstanding balance/);
    });
  });
});
