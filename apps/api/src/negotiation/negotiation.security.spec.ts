import { BadRequestException } from '@nestjs/common';
import { NegotiationService } from './negotiation.service';
import { DealStateMachine } from '../quotations/deal-state-machine';

describe('Negotiation Security Hardening', () => {
  let service: NegotiationService;
  let mockPrisma: any;
  let mockAudit: any;
  let stateMachine: DealStateMachine;

  beforeEach(() => {
    mockPrisma = {
      portalToken: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      quotation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      negotiation: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      negotiationMessage: {
        create: jest.fn(),
      },
    };
    mockAudit = { record: jest.fn().mockResolvedValue(undefined) };
    stateMachine = new DealStateMachine();

    service = new NegotiationService(mockPrisma, stateMachine, mockAudit);
  });

  describe('Quotation Expiry on Customer Acceptance', () => {
    it('rejects acceptance if quotation expiresAt is in the past', async () => {
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
      mockPrisma.portalToken.findUnique.mockResolvedValue({
        id: 'pt-1',
        token: 'token-123',
        revoked: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // portal link itself not expired
        negotiationId: 'neg-1',
        negotiation: {
          id: 'neg-1',
          quotationId: 'quote-1',
          status: 'OPEN',
          quotation: {
            id: 'quote-1',
            number: 'Q-1001',
            status: 'NEGOTIATION',
            expiresAt: expiredDate, // but quotation is expired!
          },
        },
      });

      await expect(service.respond('token-123', 'accept')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.respond('token-123', 'accept')).rejects.toThrow(
        /proposal has expired/,
      );
    });

    it('permits acceptance if quotation has not expired', async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      mockPrisma.portalToken.findUnique.mockResolvedValue({
        id: 'pt-2',
        token: 'token-456',
        revoked: false,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        negotiationId: 'neg-2',
        negotiation: {
          id: 'neg-2',
          quotationId: 'quote-2',
          status: 'OPEN',
          quotation: {
            id: 'quote-2',
            number: 'Q-1002',
            status: 'NEGOTIATION',
            expiresAt: futureDate,
          },
        },
      });
      mockPrisma.negotiation.update.mockResolvedValue({});

      const result = await service.respond('token-456', 'accept');
      expect(result.ok).toBe(true);
      expect(result.status).toBe('ACCEPTED');
    });
  });
});
