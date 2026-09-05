import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ApprovalStepStatus,
  QuotationStatus,
  UserRole,
} from '@dealflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DealStateMachine } from '../quotations/deal-state-machine';
import { QuotationsService } from '../quotations/quotations.service';
import { ApprovalRuleEngine } from './approval-rule.engine';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ApprovalRuleEngine,
    private readonly stateMachine: DealStateMachine,
    private readonly quotations: QuotationsService,
    private readonly audit: AuditService,
  ) { }

  /** Submits a quotation for approval: DRAFT → PENDING_APPROVAL, then builds the chain. */
  async submitQuotation(quotationId: string, actor: { id?: string; name?: string }) {
    await this.quotations.submit(quotationId, actor);
    return this.createForQuotation(quotationId, actor);
  }

  /**
   * Builds the approval chain for a quotation. Called when a quote is submitted.
   * If no approval is required the quotation is auto-approved.
   */
  async createForQuotation(quotationId: string, actor: { id?: string; name?: string }) {
    const q = await this.prisma.quotation.findUnique({ where: { id: quotationId } });
    if (!q) throw new NotFoundException(`Quotation ${quotationId} not found`);

    const { chain, reasons } = this.engine.computeChain({
      discountPct: Number(q.discountPct),
      marginPct: Number(q.marginPct),
      total: Number(q.total),
    });

    if (chain.length === 0) {
      // Auto-approve: PENDING_APPROVAL → APPROVED.
      this.stateMachine.assertTransition(q.status as QuotationStatus, QuotationStatus.APPROVED);
      await this.prisma.quotation.update({
        where: { id: quotationId },
        data: { status: QuotationStatus.APPROVED },
      });
      await this.audit.record({
        actorId: actor.id,
        actorName: actor.name,
        entityType: 'Quotation',
        entityId: quotationId,
        action: 'APPROVAL_AUTO_APPROVED',
        message: `${q.number} auto-approved: ${reasons.join('; ')}`,
      });
      return { autoApproved: true, reasons };
    }

    const request = await this.prisma.approvalRequest.create({
      data: {
        quotationId,
        status: ApprovalRequestStatus.PENDING,
        reason: reasons.join('; '),
        steps: {
          create: chain.map((role, i) => ({
            level: i + 1,
            role: role as never,
            status: i === 0 ? ApprovalStepStatus.PENDING : ApprovalStepStatus.PENDING,
          })),
        },
      },
      include: { steps: true },
    });

    await this.audit.record({
      actorId: actor.id,
      actorName: actor.name,
      entityType: 'ApprovalRequest',
      entityId: request.id,
      action: 'APPROVAL_REQUESTED',
      message: `${q.number}: approval chain ${chain.join(' → ')}`,
    });

    return { autoApproved: false, request };
  }

  list(status?: ApprovalRequestStatus) {
    return this.prisma.approvalRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        quotation: { include: { customer: true } },
        steps: { orderBy: { level: 'asc' }, include: { approver: { select: { id: true, name: true } } } },
      },
    });
  }

  async get(id: string) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        quotation: { include: { customer: true } },
        steps: { orderBy: { level: 'asc' }, include: { approver: { select: { id: true, name: true } } } },
      },
    });
    if (!req) throw new NotFoundException(`Approval request ${id} not found`);
    return req;
  }

  /** The first PENDING step is the one awaiting a decision. */
  private currentStep<T extends { id: string; level: number; role: string; status: string }>(
    steps: T[],
  ): T | undefined {
    return [...steps]
      .sort((a, b) => a.level - b.level)
      .find((s) => s.status === ApprovalStepStatus.PENDING);
  }

  private assertCanAct(user: AuthUser, role: string) {
    if (user.role !== UserRole.ADMIN && user.role !== role) {
      throw new ForbiddenException(`This step requires ${role} (you are ${user.role})`);
    }
  }

  async approve(id: string, user: AuthUser, comment?: string) {
    const req = await this.get(id);
    if (req.status !== ApprovalRequestStatus.PENDING)
      throw new ForbiddenException('Approval request is not pending');

    const step = this.currentStep(req.steps);
    if (!step) throw new ForbiddenException('No pending step');
    this.assertCanAct(user, step.role);

    await this.prisma.approvalStep.update({
      where: { id: step.id },
      data: { status: ApprovalStepStatus.APPROVED, approverId: user.id, comment, decidedAt: new Date() },
    });

    const remaining = req.steps.filter(
      (s) => s.status === ApprovalStepStatus.PENDING && s.id !== step.id,
    );

    if (remaining.length === 0) {
      // Final approval → quotation APPROVED.
      await this.prisma.approvalRequest.update({
        where: { id },
        data: { status: ApprovalRequestStatus.APPROVED },
      });
      await this.transitionQuotation(req.quotationId, QuotationStatus.APPROVED, user, 'APPROVAL_APPROVED');
      return { status: 'APPROVED' };
    }

    await this.audit.record({
      actorId: user.id,
      actorName: user.name,
      entityType: 'ApprovalRequest',
      entityId: id,
      action: 'APPROVAL_STEP_APPROVED',
      message: `${req.quotation.number}: ${step.role} approved`,
    });
    return { status: 'PENDING', advancedTo: remaining[0].level };
  }

  async reject(id: string, user: AuthUser, comment?: string) {
    const req = await this.get(id);
    const step = this.currentStep(req.steps);
    if (!step) throw new ForbiddenException('No pending step');
    this.assertCanAct(user, step.role);

    await this.prisma.approvalStep.update({
      where: { id: step.id },
      data: { status: ApprovalStepStatus.REJECTED, approverId: user.id, comment, decidedAt: new Date() },
    });
    await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalRequestStatus.REJECTED },
    });
    await this.transitionQuotation(req.quotationId, QuotationStatus.REJECTED, user, 'APPROVAL_REJECTED');
    return { status: 'REJECTED' };
  }

  async requestChanges(id: string, user: AuthUser, comment?: string) {
    const req = await this.get(id);
    const step = this.currentStep(req.steps);
    if (!step) throw new ForbiddenException('No pending step');
    this.assertCanAct(user, step.role);

    await this.prisma.approvalStep.update({
      where: { id: step.id },
      data: { status: ApprovalStepStatus.CHANGES_REQUESTED, approverId: user.id, comment, decidedAt: new Date() },
    });
    await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalRequestStatus.CHANGES_REQUESTED },
    });
    await this.transitionQuotation(
      req.quotationId,
      QuotationStatus.CHANGES_REQUESTED,
      user,
      'APPROVAL_CHANGES_REQUESTED',
    );
    return { status: 'CHANGES_REQUESTED' };
  }

  private async transitionQuotation(
    quotationId: string,
    to: QuotationStatus,
    user: AuthUser,
    action: string,
  ) {
    const q = await this.prisma.quotation.findUnique({ where: { id: quotationId } });
    if (!q) return;
    if (!this.stateMachine.canTransition(q.status as QuotationStatus, to)) return;
    await this.prisma.quotation.update({ where: { id: quotationId }, data: { status: to } });
    await this.audit.record({
      actorId: user.id,
      actorName: user.name,
      entityType: 'Quotation',
      entityId: quotationId,
      action,
      message: `${q.number}: ${q.status} → ${to}`,
    });
  }
}
