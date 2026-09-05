import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, UserRole } from '@dealflow/shared';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Reusable permission check. Reads @RequirePermissions metadata and verifies the
 * authenticated user's role grants ALL required permissions. Must run after JwtAuthGuard
 * (which populates req.user with permissions). ADMIN is allowed universally.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('Not authenticated');
    if (user.role === UserRole.ADMIN) return true;

    const has = new Set(user.permissions ?? []);
    const missing = required.filter((p) => !has.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission(s): ${missing.join(', ')}`);
    }
    return true;
  }
}
