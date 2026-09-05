import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export const ACCESS_COOKIE = 'df_access';
export const REFRESH_COOKIE = 'df_refresh';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extract(req);
    if (!token) throw new UnauthorizedException('Not authenticated');

    try {
      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      (req as Request & { user: unknown }).user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        name: payload.name,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  private extract(req: Request): string | undefined {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (cookieToken) return cookieToken;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return undefined;
  }
}
