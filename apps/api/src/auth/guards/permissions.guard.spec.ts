import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, UserRole } from '@dealflow/shared';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

function ctxFor(user: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

describe('PermissionsGuard', () => {
  const makeReflector = (required?: Permission[]) =>
    ({ getAllAndOverride: (key: string) => (key === PERMISSIONS_KEY ? required : undefined) }) as unknown as Reflector;

  it('allows when no permissions are required', () => {
    const guard = new PermissionsGuard(makeReflector(undefined));
    expect(guard.canActivate(ctxFor({ role: UserRole.USER, permissions: [] }))).toBe(true);
  });

  it('allows when the user has the required permission', () => {
    const guard = new PermissionsGuard(makeReflector([Permission.DEAL_APPROVE]));
    const ctx = ctxFor({ role: UserRole.MANAGER, permissions: [Permission.DEAL_APPROVE] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies (403) when the user lacks the required permission', () => {
    const guard = new PermissionsGuard(makeReflector([Permission.DEAL_APPROVE]));
    const ctx = ctxFor({ role: UserRole.USER, permissions: [Permission.DEAL_CREATE] });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows ADMIN universally regardless of listed permissions', () => {
    const guard = new PermissionsGuard(makeReflector([Permission.USER_MANAGE, Permission.ROLE_ASSIGN]));
    const ctx = ctxFor({ role: UserRole.ADMIN, permissions: [] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when unauthenticated', () => {
    const guard = new PermissionsGuard(makeReflector([Permission.DEAL_APPROVE]));
    expect(() => guard.canActivate(ctxFor(undefined))).toThrow(ForbiddenException);
  });
});
