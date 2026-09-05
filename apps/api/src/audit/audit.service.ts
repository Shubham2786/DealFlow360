import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  actorId?: string;
  actorName?: string;
  entityType: string;
  entityId?: string;
  action: string;
  message?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records a business audit event. Call inside the same transaction as the action. */
  async record(input: AuditInput) {
    return this.prisma.auditEvent.create({ data: input });
  }

  /** Most recent activity for the dashboard feed. */
  async recent(limit = 10) {
    return this.prisma.auditEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
