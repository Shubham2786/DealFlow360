import {
  ConflictException,
  Injectable,
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) { }

  private accessTtl = Number(process.env.JWT_ACCESS_TTL ?? 900);
  private refreshTtl = Number(process.env.JWT_REFRESH_TTL ?? 604800);

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async issueTokens(user: {
    id: string;
    email: string;
    role: string;
    name: string;
  }): Promise<TokenPair> {
    const payload = { sub: user.id, email: user.email, role: user.role, name: user.name };
    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: this.accessTtl,
    });
    const jti = randomUUID();
    const refreshToken = this.jwt.sign(
      { sub: user.id, jti },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: this.refreshTtl },
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

  async signup(dto: SignupDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: dto.role ?? UserRole.SALESPERSON,
      },
    });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.active) throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string | undefined): Promise<TokenPair> {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    let payload: { sub: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const hash = this.sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token no longer valid');
    }

    // Rotate: revoke the used token before issuing a new pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) throw new UnauthorizedException('User inactive');

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

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }
}
