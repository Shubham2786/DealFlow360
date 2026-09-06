import { ForbiddenException } from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ApprovalStepStatus,
  UserRole,
} from '@dealflow/shared';
import { ApprovalsService } from './approvals.service';
import { DealStateMachine } from '../quotations/deal-state-machine';

describe('Approvals Security & Governance Hardening', () => {
  let service: ApprovalsService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockQuotations: any;
  let stateMachine: DealStateMachine;
  let approvalEngine: any;

  beforeEach(() => {
    mockPrisma = {
      approvalRequest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      approvalStep: {
        update: jest.fn(),
      },
      quotation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };
    mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
    mockQuotations = {};
    stateMachine = new DealStateMachine();
    approvalEngine = { evaluate: jest.fn() };

    service = new ApprovalsService(
      mockPrisma,
      approvalEngine,
      stateMachine,
      mockQuotations,
      mockAudit,
    );
  });

  describe('Separation of Duties (SoD) / Four-Eyes Principle', () => {
    it('prevents deal creator from approving their own quotation', async () => {
      const creatorId = 'manager-123';
      mockPrisma.approvalRequest.findUnique.mockResolvedValue({
        id: 'appr-1',
        status: ApprovalRequestStatus.PENDING,
        quotationId: 'quote-1',
        quotation: {
          id: 'quote-1',
          number: 'Q-1001',
          createdById: creatorId,
          salespersonId: creatorId,
        },
        steps: [
          {
            id: 'step-1',
            level: 1,
            role: 'MANAGER',
            status: ApprovalStepStatus.PENDING,
          },
        ],
      });

      const user = {
        id: creatorId,
        email: 'manager@dealflow.test',
        name: 'Morgan Manager',
        role: UserRole.MANAGER,
        permissions: [],
      };

      await expect(service.approve('appr-1', user)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.approve('appr-1', user)).rejects.toThrow(
        /Separation of duties violation/,
      );
    });

    it('prevents salesperson from approving their own deal even if they have approval role', async () => {
      const salespersonId = 'sales-rep-456';
      mockPrisma.approvalRequest.findUnique.mockResolvedValue({
        id: 'appr-2',
        status: ApprovalRequestStatus.PENDING,
        quotationId: 'quote-2',
        quotation: {
          id: 'quote-2',
          number: 'Q-1002',
          createdById: 'someone-else',
          salespersonId: salespersonId,
        },
        steps: [
          {
            id: 'step-1',
            level: 1,
            role: 'MANAGER',
            status: ApprovalStepStatus.PENDING,
          },
        ],
      });

      const user = {
        id: salespersonId,
        email: 'sales@dealflow.test',
        name: 'Sam Sales',
        role: UserRole.MANAGER, // Even if user holds manager role
        permissions: [],
      };

      await expect(service.approve('appr-2', user)).rejects.toThrow(
        /Separation of duties violation/,
      );
    });

    it('allows a non-author manager to approve a peer quotation', async () => {
      mockPrisma.approvalRequest.findUnique.mockResolvedValue({
        id: 'appr-3',
        status: ApprovalRequestStatus.PENDING,
        quotationId: 'quote-3',
        quotation: {
          id: 'quote-3',
          number: 'Q-1003',
          createdById: 'rep-999',
          salespersonId: 'rep-999',
        },
        steps: [
          {
            id: 'step-1',
            level: 1,
            role: 'MANAGER',
            status: ApprovalStepStatus.PENDING,
          },
        ],
      });

      const manager = {
        id: 'independent-manager-789',
        email: 'independent@dealflow.test',
        name: 'Independent Manager',
        role: UserRole.MANAGER,
        permissions: [],
      };

      const result = await service.approve('appr-3', manager);
      expect(result.status).toBe('APPROVED');
      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApprovalStepStatus.APPROVED,
            approverId: 'independent-manager-789',
          }),
        }),
      );
    });

    it('allows break-glass administrator override even on author deals', async () => {
      const adminId = 'admin-001';
      mockPrisma.approvalRequest.findUnique.mockResolvedValue({
        id: 'appr-4',
        status: ApprovalRequestStatus.PENDING,
        quotationId: 'quote-4',
        quotation: {
          id: 'quote-4',
          number: 'Q-1004',
          createdById: adminId,
          salespersonId: adminId,
        },
        steps: [
          {
            id: 'step-1',
            level: 1,
            role: 'MANAGER',
            status: ApprovalStepStatus.PENDING,
          },
        ],
      });

      const adminUser = {
        id: adminId,
        email: 'admin@dealflow.test',
        name: 'Avery Admin',
        role: UserRole.ADMIN,
        permissions: [],
      };

      const result = await service.approve('appr-4', adminUser);
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('Scoped Access (IDOR Prevention)', () => {
    it('scopes list queries to own deals for standard users', async () => {
      mockPrisma.approvalRequest.findMany.mockResolvedValue([]);

      const standardUser = {
        id: 'user-1',
        email: 'user@dealflow.test',
        name: 'Standard User',
        role: UserRole.USER,
        permissions: [],
      };

      await service.list(standardUser);

      expect(mockPrisma.approvalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            quotation: {
              OR: [{ createdById: 'user-1' }, { salespersonId: 'user-1' }],
            },
          }),
        }),
      );
    });

    it('blocks standard user from viewing someone elses approval request in get()', async () => {
      mockPrisma.approvalRequest.findUnique.mockResolvedValue({
        id: 'appr-5',
        quotation: {
          id: 'quote-5',
          createdById: 'other-user',
          salespersonId: 'other-user',
        },
        steps: [],
      });

      const standardUser = {
        id: 'user-1',
        email: 'user@dealflow.test',
        name: 'Standard User',
        role: UserRole.USER,
        permissions: [],
      };

      await expect(service.get('appr-5', standardUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
