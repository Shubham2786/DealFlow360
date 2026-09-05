import { SetMetadata } from '@nestjs/common';
import { Permission } from '@dealflow/shared';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Declares the permission(s) required to invoke a route handler.
 * Enforced by PermissionsGuard. Example: @RequirePermissions(Permission.DEAL_APPROVE)
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
