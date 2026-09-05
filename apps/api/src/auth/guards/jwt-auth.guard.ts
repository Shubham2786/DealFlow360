import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export const ACCESS_COOKIE = 'df_access';
export const REFRESH_COOKIE = 'df_refresh';

/**
 * Authenticates the request and loads the fresh role + permissions from the database.
 * Loading server-side means role changes take effect immediately and lets us enforce
 * token versioning (a role change bumps User.tokenVersion, invalidating old tokens).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extract(req);
    if (!token) throw new UnauthorizedException('Not authenticated');

    let payload: { sub: string; tokenVersion?: number };
    try {
      payload = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account inactive or not found');
    }
    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session expired due to a privilege change; please sign in again');
    }

    (req as Request & { user: unknown }).user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.name),
    };
    return true;
  }

  private extract(req: Request): string | undefined {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (cookieToken) return cookieToken;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }
}
