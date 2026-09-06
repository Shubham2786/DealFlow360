import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('Auth Security & Token Hardening', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockJwt: any;

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-1234567890';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-1234567890';

    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    mockJwt = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn().mockReturnValue({ sub: 'user-1' }),
    };

    service = new AuthService(mockPrisma, mockJwt);
  });

  describe('Refresh Token Replay Attack Detection', () => {
    it('detects re-presentation of an already revoked token and invalidates all user refresh tokens', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'compromised-user-id',
        tokenHash: 'some-hash',
        revoked: true, // Already revoked!
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.refresh('already-used-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refresh('already-used-refresh-token')).rejects.toThrow(
        /Compromised refresh token reuse detected/,
      );

      // Verify that all active refresh tokens for the user were revoked
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'compromised-user-id' },
        data: { revoked: true },
      });
    });
  });
});
