// Shared domain enums for DealFlow360.
// Mirror of Prisma enums so web and api share a single source of truth.

// Role names (data-backed via the Role table). Kept as an enum for convenient,
// type-safe references in code. Add new roles here + seed them; no code rewrite needed.
export enum UserRole {
  USER = 'USER',
  MANAGER = 'MANAGER',
  FINANCE = 'FINANCE',
  ADMIN = 'ADMIN',
  CUSTOMER = 'CUSTOMER',
}

// Permission names (data-backed via the Permission table).
export enum Permission {
  DEAL_VIEW_OWN = 'DEAL_VIEW_OWN',
  DEAL_VIEW_TEAM = 'DEAL_VIEW_TEAM',
  DEAL_CREATE = 'DEAL_CREATE',
  DEAL_APPROVE = 'DEAL_APPROVE',
  TASK_VIEW_OWN = 'TASK_VIEW_OWN',
  TASK_ALLOCATE = 'TASK_ALLOCATE',
  TEAM_VIEW = 'TEAM_VIEW',
  FINANCE_DATA_VIEW = 'FINANCE_DATA_VIEW',
  FINANCE_TRANSACTION_APPROVE = 'FINANCE_TRANSACTION_APPROVE',
  FINANCE_REPORT_GENERATE = 'FINANCE_REPORT_GENERATE',
  USER_MANAGE = 'USER_MANAGE',
  ROLE_ASSIGN = 'ROLE_ASSIGN',
  SYSTEM_CONFIG_MANAGE = 'SYSTEM_CONFIG_MANAGE',
}

// Canonical role → permission matrix. Seed reads this; ADMIN gets everything.
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.USER]: [Permission.DEAL_VIEW_OWN, Permission.DEAL_CREATE, Permission.TASK_VIEW_OWN, Permission.TASK_ALLOCATE],
  [UserRole.MANAGER]: [
    Permission.DEAL_VIEW_OWN,
    Permission.DEAL_VIEW_TEAM,
    Permission.DEAL_CREATE,
    Permission.DEAL_APPROVE,
    Permission.TASK_VIEW_OWN,
    Permission.TASK_ALLOCATE,
    Permission.TEAM_VIEW,
  ],
  [UserRole.FINANCE]: [
    Permission.FINANCE_DATA_VIEW,
    Permission.FINANCE_TRANSACTION_APPROVE,
    Permission.FINANCE_REPORT_GENERATE,
    Permission.DEAL_APPROVE, // approves the finance step of a deal's approval chain
    Permission.DEAL_VIEW_TEAM, // must be able to view all quotations to generate invoices
  ],
  [UserRole.ADMIN]: Object.values(Permission),
  [UserRole.CUSTOMER]: [Permission.DEAL_VIEW_OWN],
};

export enum QuotationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  NEGOTIATION = 'NEGOTIATION',
  CONVERTED_TO_FULFILLMENT = 'CONVERTED_TO_FULFILLMENT',
  FULFILLING = 'FULFILLING',
  PARTIALLY_FULFILLED = 'PARTIALLY_FULFILLED',
  FULFILLED = 'FULFILLED',
  BILLING = 'BILLING',
  INVOICED = 'INVOICED',
  PAID = 'PAID',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ApprovalRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
  ESCALATED = 'ESCALATED',
}

export enum ApprovalStepStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
  SKIPPED = 'SKIPPED',
}

export enum FulfillmentStatus {
  PENDING = 'PENDING',
  ALLOCATING = 'ALLOCATING',
  ALLOCATED = 'ALLOCATED',
  PARTIALLY_ALLOCATED = 'PARTIALLY_ALLOCATED',
  BACKORDERED = 'BACKORDERED',
  READY_TO_SHIP = 'READY_TO_SHIP',
  FULFILLED = 'FULFILLED',
  FAILED = 'FAILED',
}

export enum ReservationStatus {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
}

export enum BackorderStatus {
  OPEN = 'OPEN',
  PARTIALLY_ALLOCATED = 'PARTIALLY_ALLOCATED',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
}

export enum AllocationSource {
  INITIAL = 'INITIAL',
  BACKORDER = 'BACKORDER',
}

export enum SubscriptionStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  PAST_DUE = 'PAST_DUE',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum ProductType {
  ONE_TIME = 'ONE_TIME',
  RECURRING = 'RECURRING',
}

export enum BillingFrequency {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUAL = 'ANNUAL',
}

export enum DealHealth {
  HEALTHY = 'HEALTHY',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum CustomerSegment {
  STANDARD = 'STANDARD',
  SMB = 'SMB',
  ENTERPRISE = 'ENTERPRISE',
  STRATEGIC = 'STRATEGIC',
}
