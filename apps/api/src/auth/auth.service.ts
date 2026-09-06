import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { UserRole } from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, SignupDto } from './dto/auth.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Full user with role+permissions loaded.
type UserForToken = {
  id: string;
  email: string;
  name: string;
  tokenVersion: number;
  role: { name: string };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) { }

  private accessTtl = Number(process.env.JWT_ACCESS_TTL ?? 900);
  private refreshTtl = Number(process.env.JWT_REFRESH_TTL ?? 604800);

  private getAccessSecret(): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || !secret.trim()) {
      throw new InternalServerErrorException('JWT_ACCESS_SECRET is not configured');
    }
    return secret;
  }

  private getRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret || !secret.trim()) {
      throw new InternalServerErrorException('JWT_REFRESH_SECRET is not configured');
    }
    return secret;
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async issueTokens(user: UserForToken): Promise<TokenPair> {
    // Access token carries only non-sensitive identity + tokenVersion for invalidation.
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      tokenVersion: user.tokenVersion,
    };
    const accessToken = this.jwt.sign(payload, {
      secret: this.getAccessSecret(),
      expiresIn: this.accessTtl,
    });
    const jti = randomUUID();
    const refreshToken = this.jwt.sign(
      { sub: user.id, jti },
      { secret: this.getRefreshSecret(), expiresIn: this.refreshTtl },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Public signup. The role is ALWAYS USER and is assigned server-side — any `role`
   * field sent by the client is ignored (and rejected by the DTO whitelist).
   */
  async signup(dto: SignupDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const userRole = await this.prisma.role.findUnique({ where: { name: UserRole.USER } });
    if (!userRole) {
      throw new InternalServerErrorException('USER role is not seeded; run the seed');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        roleId: userRole.id, // privilege granted by the backend, never requested
      },
      include: { role: true },
    });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<{ tokens: TokenPair; user: any }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.issueTokens(user);
    const userPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.name),
      status: user.status,
      createdAt: user.createdAt,
    };

    return { tokens, user: userPayload };
  }

  async refresh(refreshToken: string | undefined): Promise<TokenPair> {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    let payload: { sub: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: this.getRefreshSecret() });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const hash = this.sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token no longer valid');
    }
    if (stored.revoked) {
      // Replay attack detected: an already-revoked refresh token was re-presented.
      // Revoke all active refresh tokens for this user account to protect against token compromise.
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Compromised refresh token reuse detected; session revoked');
    }

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User inactive');

    return this.issueTokens(user);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const hash = this.sha256(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash },
      data: { revoked: true },
    });
  }

  /** Current user with role + resolved permissions (safe projection — no password/hash). */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.name),
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
