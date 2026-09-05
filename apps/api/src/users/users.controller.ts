import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { Permission } from '@dealflow/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';

class AssignRoleDto {
  @IsString() role!: string;
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  @RequirePermissions(Permission.USER_MANAGE)
  list() {
    return this.users.list();
  }

  @Get('roles')
  @RequirePermissions(Permission.USER_MANAGE)
  roles() {
    return this.users.listRoles();
  }

  @Patch('users/:id/role')
  @RequirePermissions(Permission.ROLE_ASSIGN)
  assignRole(@Param('id') id: string, @Body() dto: AssignRoleDto, @CurrentUser() actor: AuthUser) {
    return this.users.assignRole(id, dto.role, actor);
  }
}
