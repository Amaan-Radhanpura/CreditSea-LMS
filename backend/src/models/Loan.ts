import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { EMPLOYMENT_MODES, LOAN_STATUSES, REPAYMENT_PLANS, type EmploymentMode, type LoanStatus, type RepaymentPlan } from '@lms/shared';

export interface IStatusChange {
  from: LoanStatus | null;
  to: LoanStatus;
  by: Types.ObjectId | null;
  at: Date;
  note?: string;
}

export interface IInstalment {
  number: number;
  /** Paise */
  amount: number;
  /** IST business date (UTC midnight); null until disbursed. */
  dueDate: Date | null;
}

export interface ILoanApplicant {
  fullName: string;
  pan: string;
  dob: Date;
  /** Paise */
  monthlySalary: number;
  employmentMode: EmploymentMode;
}

export interface ILoan {
  _id: Types.ObjectId;
  borrower: Types.ObjectId;
  /** Snapshot of the profile at apply time. The loan is a record of what was approved. */
  applicant: ILoanApplicant;
  salarySlip: Types.ObjectId;
  /** PAN card document reviewed for this application (snapshot of the profile's at apply time). */
  panCard: Types.ObjectId | null;
  /** Executive responsible for the current stage (see STAGE_OWNER); null once REJECTED/CLOSED. */
  assignee: Types.ObjectId | null;
  /** All money fields are paise. */
  principal: number;
  /** Annual rate in percent. Stored per loan so a future rate change never rewrites old loans. */
  interestRate: number;
  tenureDays: number;
  repaymentPlan: RepaymentPlan;
  emiMonths: number | null;
  /**
   * Repayment schedule (1 entry for one-time, N for EMI). Embedded: at most 12 entries, always read
   * with the loan. Per-instalment "paid" is derived from amountPaid (oldest first), so it is never stored.
   */
  instalments: IInstalment[];
  /** Next unpaid instalment: denormalized for the reminder job and the Overdue tab. Null when not disbursed / fully paid. */
  nextDueDate: Date | null;
  nextDueAmount: number | null;
  simpleInterest: number;
  totalRepayment: number;
  amountPaid: number;
  status: LoanStatus;
  /** True while APPLIED / SANCTIONED / DISBURSED. Backs the "one open loan per borrower" unique index. */
  isOpen: boolean;
  rejectionReason?: string;
  sanctionedBy?: Types.ObjectId;
  sanctionedAt?: Date;
  rejectedBy?: Types.ObjectId;
  rejectedAt?: Date;
  disbursedBy?: Types.ObjectId;
  disbursedAt?: Date;
  /** IST business date (stored as UTC midnight) when the full amount is due: disbursement date + tenure. */
  dueDate?: Date;
  closedAt?: Date;
  /**
   * Proof the borrower accepted the Key Fact Statement. The KFS figures themselves are the loan's
   * own amount fields, which are written once at apply and never changed afterwards.
   */
  consent: { termsVersion: string; acceptedAt: Date; ipAddress?: string };
  statusHistory: IStatusChange[];
  createdAt: Date;
  updatedAt: Date;
}

const paise = { type: Number, required: true, min: 0, validate: Number.isInteger };

const statusChangeSchema = new Schema<IStatusChange>(
  {
    from: { type: String, enum: [...LOAN_STATUSES, null], default: null },
    to: { type: String, enum: LOAN_STATUSES, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, required: true },
    note: { type: String, maxlength: 500 },
  },
  { _id: false },
);

const instalmentSchema = new Schema<IInstalment>(
  {
    number: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0, validate: Number.isInteger },
    dueDate: { type: Date, default: null },
  },
  { _id: false },
);

const applicantSchema = new Schema<ILoanApplicant>(
  {
    fullName: { type: String, required: true },
    pan: { type: String, required: true },
    dob: { type: Date, required: true },
    monthlySalary: paise,
    employmentMode: { type: String, enum: EMPLOYMENT_MODES, required: true },
  },
  { _id: false },
);

const loanSchema = new Schema<ILoan>(
  {
    borrower: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    applicant: { type: applicantSchema, required: true },
    salarySlip: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    panCard: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    principal: paise,
    interestRate: { type: Number, required: true },
    tenureDays: { type: Number, required: true, min: 1, validate: Number.isInteger },
    repaymentPlan: { type: String, enum: REPAYMENT_PLANS, required: true, default: 'ONE_TIME' },
    emiMonths: { type: Number, default: null, min: 1, max: 12 },
    instalments: { type: [instalmentSchema], default: [] },
    nextDueDate: { type: Date, default: null },
    nextDueAmount: { type: Number, default: null },
    simpleInterest: paise,
    totalRepayment: paise,
    amountPaid: { ...paise, default: 0 },
    status: { type: String, enum: LOAN_STATUSES, required: true, default: 'APPLIED' },
    isOpen: { type: Boolean, required: true, default: true },
    rejectionReason: { type: String, maxlength: 500 },
    sanctionedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    sanctionedAt: Date,
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    disbursedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    disbursedAt: Date,
    dueDate: Date,
    closedAt: Date,
    consent: {
      type: new Schema(
        { termsVersion: { type: String, required: true }, acceptedAt: { type: Date, required: true }, ipAddress: String },
        { _id: false },
      ),
      required: true,
    },
    // Embedded: bounded (at most 4 transitions) and always read with the loan.
    statusHistory: { type: [statusChangeSchema], default: [] },
  },
  { timestamps: true },
);

// Every ops queue: "loans in status X, newest first".
loanSchema.index({ status: 1, createdAt: -1 });
// Reminder job + Collection's "Overdue" tab: disbursed loans by their next unpaid instalment.
loanSchema.index({ status: 1, nextDueDate: 1 });
// "Assigned to me" queues and least-loaded assignment counts.
loanSchema.index({ assignee: 1, status: 1 });
// Borrower's own loans + the Sales $lookup (borrower -> loans).
loanSchema.index({ borrower: 1, createdAt: -1 });
// DB-level guarantee: at most one open loan per borrower, even under concurrent requests.
loanSchema.index(
  { borrower: 1 },
  { unique: true, partialFilterExpression: { isOpen: true }, name: 'one_open_loan_per_borrower' },
);

export type LoanDoc = HydratedDocument<ILoan>;
export const Loan = model<ILoan>('Loan', loanSchema);
