import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ApprovalStepStatus,
  Permission,
  QuotationStatus,
  UserRole,
} from '@dealflow/shared';
import { Prisma } from '@prisma/client';
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

  /**
   * Submits a quotation for approval atomically.
   * Evaluates blended risk score, per-line category ceilings, customer tier,
   * transitions quotation status, and builds the required approval chain in a single transaction.
   */
  async submitQuotation(quotationId: string, actor: { id?: string; name?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const q = await tx.quotation.findUnique({
        where: { id: quotationId },
        include: {
          customer: true,
          lines: { include: { product: true } },
        },
      });
      if (!q) throw new NotFoundException(`Quotation ${quotationId} not found`);

      this.stateMachine.assertTransition(q.status as QuotationStatus, QuotationStatus.PENDING_APPROVAL);

      const { chain, reasons, blendedRiskScore } = await this.engine.evaluate({
        discountPct: Number(q.discountPct),
        marginPct: Number(q.marginPct),
        total: Number(q.total),
        customerSegment: q.customer?.segment,
        lines: q.lines.map((l) => ({
          productId: l.productId,
          category: l.product?.category ?? 'Hardware',
          basePrice: Number(l.product?.basePrice ?? l.unitPrice),
          unitPrice: Number(l.unitPrice),
          discountPct: Number(l.discountPct),
          qty: l.qty,
          lineTotal: Number(l.lineTotal),
        })),
      });

      // ── Submitter-Skip Rule (Separation of Duties) ──────────────────────────
      // When the person submitting the deal already holds a role that appears in
      // the approval chain, that step is automatically satisfied — they have
      // reviewed it by choosing to submit. This prevents self-approval deadlocks
      // (e.g. a MANAGER submitting their own deal that requires MANAGER approval).
      // The actor's role is resolved from the quotation's createdBy user record.
      const submitterUser = actor.id
        ? await tx.user.findUnique({
            where: { id: actor.id },
            include: { role: true },
          })
        : null;
      const submitterRole = submitterUser?.role?.name as UserRole | undefined;

      const effectiveChain = submitterRole
        ? chain.filter((role) => role !== submitterRole)
        : chain;

      const skippedRoles = chain.filter((r) => !effectiveChain.includes(r));
      if (skippedRoles.length > 0) {
        reasons.push(
          `${skippedRoles.join(', ')} step(s) auto-skipped (submitter already holds this role)`,
        );
      }
      // ────────────────────────────────────────────────────────────────────────

      if (effectiveChain.length === 0) {
        // Auto-approve: within authority or all steps satisfied by submitter
        this.stateMachine.assertTransition(QuotationStatus.PENDING_APPROVAL, QuotationStatus.APPROVED);
        await tx.quotation.update({
          where: { id: quotationId },
          data: { status: QuotationStatus.APPROVED },
        });
        await this.audit.record({
          actorId: actor.id,
          actorName: actor.name,
          entityType: 'Quotation',
          entityId: quotationId,
          action: 'APPROVAL_AUTO_APPROVED',
          message: `${q.number} auto-approved (risk score ${blendedRiskScore}/100): ${reasons.join('; ')}`,
        });
        return { autoApproved: true, reasons, blendedRiskScore };
      }

      await tx.quotation.update({
        where: { id: quotationId },
        data: { status: QuotationStatus.PENDING_APPROVAL },
      });

      const request = await tx.approvalRequest.create({
        data: {
          quotationId,
          status: ApprovalRequestStatus.PENDING,
          reason: `Risk score ${blendedRiskScore}/100: ${reasons.join('; ')}`,
          steps: {
            create: effectiveChain.map((role, i) => ({
              level: i + 1,
              role: role as never,
              status: ApprovalStepStatus.PENDING,
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
        message: `${q.number}: approval chain ${effectiveChain.join(' → ')} (risk score ${blendedRiskScore}/100)`,
      });

      return { autoApproved: false, request, blendedRiskScore };
    });
  }

  /**
   * Standalone creation of approval chain (if called directly).
   */
  async createForQuotation(quotationId: string, actor: { id?: string; name?: string }) {
    return this.submitQuotation(quotationId, actor);
  }

  list(user?: AuthUser, status?: ApprovalRequestStatus) {
    let whereClause: Prisma.ApprovalRequestWhereInput = status ? { status } : {};
    if (user) {
      const isTeam =
        user.role === UserRole.ADMIN ||
        user.role === UserRole.MANAGER ||
        user.role === UserRole.FINANCE ||
        (user.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM) ||
        (user.permissions ?? []).includes(Permission.DEAL_APPROVE);

      if (!isTeam) {
        whereClause = {
          ...whereClause,
          quotation: {
            OR: [{ createdById: user.id }, { salespersonId: user.id }],
          },
        };
      }
    }

    return this.prisma.approvalRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        quotation: {
          include: {
            customer: true,
            lines: { include: { product: true } },
          },
        },
        steps: { orderBy: { level: 'asc' }, include: { approver: { select: { id: true, name: true } } } },
      },
    });
  }

  async get(id: string, user?: AuthUser) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        quotation: {
          include: {
            customer: true,
            lines: { include: { product: true } },
          },
        },
        steps: { orderBy: { level: 'asc' }, include: { approver: { select: { id: true, name: true } } } },
      },
    });
    if (!req) throw new NotFoundException(`Approval request ${id} not found`);

    if (user) {
      const isTeam =
        user.role === UserRole.ADMIN ||
        user.role === UserRole.MANAGER ||
        user.role === UserRole.FINANCE ||
        (user.permissions ?? []).includes(Permission.DEAL_VIEW_TEAM) ||
        (user.permissions ?? []).includes(Permission.DEAL_APPROVE);

      if (!isTeam) {
        const isOwner =
          req.quotation.createdById === user.id ||
          req.quotation.salespersonId === user.id;
        if (!isOwner) {
          throw new ForbiddenException('Access denied: you can only view approval requests for your own deals');
        }
      }
    }

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

  private assertCanAct(
    user: AuthUser,
    role: string,
    quotation?: { createdById?: string | null; salespersonId?: string | null },
    isApproval = false,
  ) {
    if (user.role !== UserRole.ADMIN && user.role !== role) {
      throw new ForbiddenException(`This step requires ${role} (you are ${user.role})`);
    }
    // Separation of Duties (SoD) / Four-Eyes Principle:
    // Deal creator or salesperson cannot approve their own deal unless they are system ADMIN.
    if (isApproval && user.role !== UserRole.ADMIN && quotation) {
      if (
        (quotation.createdById && quotation.createdById === user.id) ||
        (quotation.salespersonId && quotation.salespersonId === user.id)
      ) {
        throw new ForbiddenException('Separation of duties violation: you cannot approve a quotation you authored or own');
      }
    }
  }

  async approve(id: string, user: AuthUser, comment?: string) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.approvalRequest.findUnique({
        where: { id },
        include: {
          quotation: { include: { customer: true } },
          steps: { orderBy: { level: 'asc' } },
        },
      });
      if (!req) throw new NotFoundException(`Approval request ${id} not found`);
      if (req.status !== ApprovalRequestStatus.PENDING)
        throw new ForbiddenException('Approval request is not pending');

      const step = this.currentStep(req.steps);
      if (!step) throw new ForbiddenException('No pending step');
      this.assertCanAct(user, step.role, req.quotation, true);

      await tx.approvalStep.update({
        where: { id: step.id },
        data: { status: ApprovalStepStatus.APPROVED, approverId: user.id, comment, decidedAt: new Date() },
      });

      const remaining = req.steps.filter(
        (s) => s.status === ApprovalStepStatus.PENDING && s.id !== step.id,
      );

      if (remaining.length === 0) {
        // Final approval → quotation APPROVED
        await tx.approvalRequest.update({
          where: { id },
          data: { status: ApprovalRequestStatus.APPROVED },
        });
        const q = await tx.quotation.findUnique({ where: { id: req.quotationId } });
        if (q && this.stateMachine.canTransition(q.status as QuotationStatus, QuotationStatus.APPROVED)) {
          await tx.quotation.update({ where: { id: req.quotationId }, data: { status: QuotationStatus.APPROVED } });
        }
        await this.audit.record({
          actorId: user.id,
          actorName: user.name,
          entityType: 'Quotation',
          entityId: req.quotationId,
          action: 'APPROVAL_APPROVED',
          message: `${req.quotation.number}: approved in full`,
        });
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
    });
  }

  async reject(id: string, user: AuthUser, comment?: string) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.approvalRequest.findUnique({
        where: { id },
        include: {
          quotation: { include: { customer: true } },
          steps: { orderBy: { level: 'asc' } },
        },
      });
      if (!req) throw new NotFoundException(`Approval request ${id} not found`);
      if (req.status !== ApprovalRequestStatus.PENDING) {
        throw new ForbiddenException('Approval request is not pending');
      }
      const step = this.currentStep(req.steps);
      if (!step) throw new ForbiddenException('No pending step');
      this.assertCanAct(user, step.role);

      await tx.approvalStep.update({
        where: { id: step.id },
        data: { status: ApprovalStepStatus.REJECTED, approverId: user.id, comment, decidedAt: new Date() },
      });
      await tx.approvalRequest.update({
        where: { id },
        data: { status: ApprovalRequestStatus.REJECTED },
      });

      const q = await tx.quotation.findUnique({ where: { id: req.quotationId } });
      if (q && this.stateMachine.canTransition(q.status as QuotationStatus, QuotationStatus.REJECTED)) {
        await tx.quotation.update({ where: { id: req.quotationId }, data: { status: QuotationStatus.REJECTED } });
      }

      await this.audit.record({
        actorId: user.id,
        actorName: user.name,
        entityType: 'Quotation',
        entityId: req.quotationId,
        action: 'APPROVAL_REJECTED',
        message: `${req.quotation.number}: rejected by ${step.role}${comment ? ` (${comment})` : ''}`,
      });
      return { status: 'REJECTED' };
    });
  }

  async requestChanges(id: string, user: AuthUser, comment?: string) {
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.approvalRequest.findUnique({
        where: { id },
        include: {
          quotation: { include: { customer: true } },
          steps: { orderBy: { level: 'asc' } },
        },
      });
      if (!req) throw new NotFoundException(`Approval request ${id} not found`);
      if (req.status !== ApprovalRequestStatus.PENDING) {
        throw new ForbiddenException('Approval request is not pending');
      }
      const step = this.currentStep(req.steps);
      if (!step) throw new ForbiddenException('No pending step');
      this.assertCanAct(user, step.role);

      await tx.approvalStep.update({
        where: { id: step.id },
        data: { status: ApprovalStepStatus.CHANGES_REQUESTED, approverId: user.id, comment, decidedAt: new Date() },
      });
      await tx.approvalRequest.update({
        where: { id },
        data: { status: ApprovalRequestStatus.CHANGES_REQUESTED },
      });

      const q = await tx.quotation.findUnique({ where: { id: req.quotationId } });
      if (q && this.stateMachine.canTransition(q.status as QuotationStatus, QuotationStatus.CHANGES_REQUESTED)) {
        await tx.quotation.update({
          where: { id: req.quotationId },
          data: { status: QuotationStatus.CHANGES_REQUESTED },
        });
      }

      await this.audit.record({
        actorId: user.id,
        actorName: user.name,
        entityType: 'Quotation',
        entityId: req.quotationId,
        action: 'APPROVAL_CHANGES_REQUESTED',
        message: `${req.quotation.number}: changes requested by ${step.role}${comment ? ` (${comment})` : ''}`,
      });
      return { status: 'CHANGES_REQUESTED' };
    });
  }
}
