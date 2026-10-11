import type { BreFailure } from './bre';
import type { AuditAction, DocumentKind, EmploymentMode, LoanStatus, NotificationType, RepaymentPlan, Role } from './constants';

/** All money fields in DTOs are rupees. */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface DocumentDTO {
  id: string;
  kind: DocumentKind;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

/** Where the borrower is in the application journey; drives the stepper. */
/**
 * What the borrower can do right now:
 *  PERSONAL_DETAILS / DOCUMENTS: something is missing (only older accounts; sign-up collects everything)
 *  NOT_ELIGIBLE: details saved but the BRE failed, so applying is blocked
 *  LOAN_CONFIG: ready, only amount + days needed
 *  HAS_OPEN_LOAN: a loan is already in progress
 */
export type ApplicationStep = 'PERSONAL_DETAILS' | 'DOCUMENTS' | 'NOT_ELIGIBLE' | 'LOAN_CONFIG' | 'HAS_OPEN_LOAN';

export interface ProfileDTO {
  fullName: string;
  pan: string;
  dob: string;
  monthlySalary: number;
  employmentMode: EmploymentMode;
  bre: { passed: boolean; failures: BreFailure[]; checkedAt: string };
  salarySlip: DocumentDTO | null;
  panCard: DocumentDTO | null;
}

export interface BorrowerStateDTO {
  profile: ProfileDTO | null;
  step: ApplicationStep;
  openLoanId: string | null;
}

export interface StatusHistoryDTO {
  from: LoanStatus | null;
  to: LoanStatus;
  by: ActorDTO | null;
  at: string;
  note?: string;
}

export type InstalmentStatus = 'PAID' | 'PARTLY_PAID' | 'OVERDUE' | 'DUE' | 'UPCOMING';

export interface InstalmentDTO {
  number: number;
  amount: number;
  paid: number;
  /** Null until the loan is disbursed (dates are counted from disbursement). */
  dueDate: string | null;
  status: InstalmentStatus;
}

export interface LoanDTO {
  id: string;
  borrower: { id: string; name: string; email: string };
  applicant: {
    fullName: string;
    pan: string;
    dob: string;
    monthlySalary: number;
    employmentMode: EmploymentMode;
  };
  salarySlip: DocumentDTO | null;
  panCard: DocumentDTO | null;
  /** Executive responsible for the loan's current stage. */
  assignee: ActorDTO | null;
  principal: number;
  interestRate: number;
  tenureDays: number;
  simpleInterest: number;
  totalRepayment: number;
  amountPaid: number;
  outstanding: number;
  status: LoanStatus;
  rejectionReason?: string;
  appliedAt: string;
  sanctionedAt?: string;
  disbursedAt?: string;
  repaymentPlan: RepaymentPlan;
  /** EMI loans: number of monthly instalments. */
  emiMonths: number | null;
  /** Repayment schedule (a one-time loan has a single instalment). */
  instalments: InstalmentDTO[];
  /** The next unpaid instalment, once disbursed. */
  nextDue: { number: number; amount: number; dueDate: string } | null;
  /** Final due date (last instalment); present once the loan is disbursed. */
  dueDate?: string;
  /** Disbursed and the next unpaid instalment is past its due date. */
  isOverdue: boolean;
  daysOverdue: number;
  /** Days left until the next instalment is due (negative once overdue); null until disbursed. */
  daysToDue: number | null;
  closedAt?: string;
  consent: { termsVersion: string; acceptedAt: string };
  statusHistory: StatusHistoryDTO[];
}

export interface ActorDTO {
  id: string;
  name: string;
  role: Role;
}

export interface AuditEntryDTO {
  id: string;
  action: AuditAction;
  at: string;
  /** null = done automatically by the system (e.g. auto-close, auto-assignment). */
  actor: ActorDTO | null;
  loan: { id: string; applicantName: string; principal: number } | null;
  /** The borrower this action concerns. */
  subject: { id: string; name: string } | null;
  details: Record<string, unknown>;
}

export interface UserSummaryDTO extends UserDTO {
  isActive: boolean;
  /** Audit entries performed by this user. */
  actionCount: number;
  /** Executives: open loans currently assigned to them. Borrowers: loans applied for. */
  loanCount: number;
  lastActiveAt: string | null;
}

/** Everything about one user for the admin side panel. */
export interface UserDetailsDTO {
  user: UserSummaryDTO;
  /** Borrowers only: personal details + eligibility (BRE) result. */
  profile: ProfileDTO | null;
  /** All files the user uploaded, newest first (including slips replaced later). */
  documents: (DocumentDTO & { isCurrent: boolean })[];
  /** Borrowers: loans applied for. Executives: open loans assigned to them. */
  loans: LoanDTO[];
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  loanId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationListDTO {
  items: NotificationDTO[];
  unread: number;
}

export interface ReminderRunDTO {
  dueReminders: number;
  overdueReminders: number;
  staffAlerts: number;
  ranAt: string;
}

export interface PaymentDTO {
  id: string;
  loanId: string;
  utr: string;
  amount: number;
  paymentDate: string;
  recordedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface PaymentResultDTO {
  payment: PaymentDTO;
  loan: LoanDTO;
  loanClosed: boolean;
}

export type LeadStage = 'REGISTERED' | 'PROFILE_REJECTED' | 'PROFILE_COMPLETED' | 'SLIP_UPLOADED';

export interface LeadDTO {
  id: string;
  name: string;
  email: string;
  registeredAt: string;
  stage: LeadStage;
  fullName?: string;
  monthlySalary?: number;
  employmentMode?: EmploymentMode;
  breFailures?: BreFailure[];
}

export interface StatsDTO {
  loansByStatus: Record<LoanStatus, number>;
  totalDisbursed: number;
  totalCollected: number;
  totalOutstanding: number;
  leads: number;
  overdueLoans: number;
}
