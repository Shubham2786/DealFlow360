import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type Actor = { id?: string; name?: string };

const SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  status: true,
  createdAt: true,
  role: { select: { name: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: SAFE_SELECT,
    });
    return users.map((u) => ({ ...u, role: u.role.name }));
  }

  listRoles() {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, description: true } });
  }

  /**
   * Assign a role to a user (ADMIN-only via ROLE_ASSIGN). Bumps tokenVersion so the
   * target user's existing sessions are invalidated and the new privileges take effect
   * on their next sign-in.
   */
  async assignRole(userId: string, roleName: string, actor: Actor) {
    const target = await this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!target) throw new NotFoundException('User not found');

    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new BadRequestException(`Role '${roleName}' does not exist`);

    if (target.roleId === role.id) {
      return this.projected(userId);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { roleId: role.id, tokenVersion: { increment: 1 } },
    });
    // Revoke refresh tokens too, for a clean privilege change.
    await this.prisma.refreshToken.updateMany({ where: { userId }, data: { revoked: true } });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'User',
      entityId: userId,
      action: 'ROLE_ASSIGNED',
      message: `${target.name}: ${target.role.name} → ${roleName}`,
    });

    return this.projected(userId);
  }

  private async projected(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: SAFE_SELECT });
    return u ? { ...u, role: u.role.name } : null;
  }
}
