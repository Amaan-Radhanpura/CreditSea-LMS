import type { FilterQuery } from 'mongoose';
import {
  EMI_RULES,
  LOAN_RULES,
  LOAN_TERMS_VERSION,
  runBre,
  simpleInterestPaise,
  formatINR,
  toPaise,
  toBusinessDate,
  toRupees,
  type ApplyLoanInput,
  type ListQuery,
  type LoanDTO,
  type LoanStatus,
  type Paginated,
  type Role,
} from '@lms/shared';
import { BorrowerProfile, Loan, type ILoan } from '../../models';
import { ApiError } from '../../utils/ApiError';
import { escapeRegex } from '../../utils/http';
import { recordAudit } from '../audit/audit.service';
import { notify } from '../notifications/notification.service';
import { auditAssignment, pickAssignee, runInTransaction } from './loanWorkflow';
import { buildSchedule } from './schedule';
import { LOAN_POPULATE, toLoanDTO, type LoanWithRefs } from '../mappers';

export async function findLoanDTO(loanId: string, viewer: Role, filter: FilterQuery<ILoan> = {}): Promise<LoanDTO> {
  const loan = await Loan.findOne({ _id: loanId, ...filter }).populate(LOAN_POPULATE).lean<LoanWithRefs>();
  if (!loan) throw ApiError.notFound('Loan not found');
  return toLoanDTO(loan, viewer);
}

/**
 * Creates a loan in APPLIED status. Amounts are always recomputed here; the client only sends
 * principal + tenure, never the totals.
 */
export async function applyForLoan(userId: string, input: ApplyLoanInput, ipAddress?: string): Promise<LoanDTO> {
  const profile = await BorrowerProfile.findOne({ user: userId }).lean();
  if (!profile) throw ApiError.conflict('Please add your personal details first', 'STEP_INCOMPLETE');
  if (!profile.salarySlip || !profile.panCard) {
    throw ApiError.conflict('Please upload both your salary slip and PAN card first', 'STEP_INCOMPLETE');
  }

  // Re-check eligibility at apply time: the borrower may have aged out since the profile was saved.
  const bre = runBre({ ...profile, monthlySalary: toRupees(profile.monthlySalary) });
  if (!bre.passed) {
    await BorrowerProfile.updateOne({ _id: profile._id }, { $set: { bre: { ...bre, checkedAt: new Date() } } });
    throw ApiError.unprocessable('Sorry, you are not eligible for a loan right now', { failures: bre.failures }, 'BRE_REJECTED');
  }

  // EMI: tenure is derived from the months (1 month = 30 days). Interest is the same simple interest either way.
  const emiMonths = input.repaymentPlan === 'EMI' ? input.emiMonths! : null;
  const tenureDays = emiMonths ? emiMonths * EMI_RULES.DAYS_PER_MONTH : input.tenureDays!;
  const principal = toPaise(input.principal);
  const simpleInterest = simpleInterestPaise(principal, LOAN_RULES.INTEREST_RATE, tenureDays);
  const instalments = buildSchedule(input.repaymentPlan, principal + simpleInterest, emiMonths);

  // One transaction: loan + assignment to a sanction executive + audit entries.
  // The partial unique index `one_open_loan_per_borrower` turns a second open loan into a 409.
  const loanId = await runInTransaction(async (session) => {
    const assignee = await pickAssignee('SANCTION', session);
    const [loan] = await Loan.create([{
    borrower: userId,
    applicant: {
      fullName: profile.fullName,
      pan: profile.pan,
      dob: profile.dob,
      monthlySalary: profile.monthlySalary,
      employmentMode: profile.employmentMode,
    },
    salarySlip: profile.salarySlip,
    panCard: profile.panCard,
    assignee: assignee?._id ?? null,
    principal,
    interestRate: LOAN_RULES.INTEREST_RATE,
    tenureDays,
    repaymentPlan: input.repaymentPlan,
    emiMonths,
    instalments,
    simpleInterest,
    totalRepayment: principal + simpleInterest,
    status: 'APPLIED',
    isOpen: true,
    consent: { termsVersion: LOAN_TERMS_VERSION, acceptedAt: new Date(), ipAddress },
    statusHistory: [{ from: null, to: 'APPLIED', by: userId, at: new Date(), note: 'Application submitted' }],
    }], { session });

    await recordAudit(
      {
        actor: { id: userId, role: 'BORROWER' },
        action: 'LOAN_APPLIED',
        loanId: loan!._id,
        subjectUserId: userId,
        ipAddress,
        details: { principal: input.principal, tenureDays, repaymentPlan: input.repaymentPlan, emiMonths, totalRepayment: toRupees(principal + simpleInterest), consent: LOAN_TERMS_VERSION },
      },
      session,
    );
    // Every status change notifies the borrower; this is the first one.
    await notify(
      [
        {
          user: userId,
          type: 'LOAN_APPLIED',
          title: 'Application received',
          message: `We got your request for ${formatINR(input.principal)} ${emiMonths ? `in ${emiMonths} monthly EMIs` : `for ${tenureDays} days`}. Our team will review it soon.`,
          loan: loan!._id,
        },
      ],
      session,
    );
    if (assignee) await auditAssignment(loan!._id, profile.user, 'SANCTION', assignee, session);
    return loan!._id.toString();
  });

  return findLoanDTO(loanId, 'BORROWER');
}

export async function listMyLoans(userId: string): Promise<LoanDTO[]> {
  const loans = await Loan.find({ borrower: userId }).sort({ createdAt: -1 }).populate(LOAN_POPULATE).lean<LoanWithRefs[]>();
  return loans.map((l) => toLoanDTO(l, 'BORROWER'));
}

/**
 * Paginated queue for an ops module. `scope` is the set of statuses that module may see;
 * `query.status` can narrow it (e.g. Sanction's "Approved" tab) but never widen it.
 */
export async function listLoans(scope: readonly LoanStatus[], query: ListQuery, viewer: { id: string; role: Role }): Promise<Paginated<LoanDTO>> {
  if (query.status && !scope.includes(query.status)) {
    throw ApiError.badRequest(`Status must be one of: ${scope.join(', ')}`, undefined, 'INVALID_STATUS');
  }

  const filter: FilterQuery<ILoan> = { status: query.status ?? { $in: scope } };
  if (query.mine === 'true') filter.assignee = viewer.id;
  if (query.overdue === 'true') {
    filter.status = 'DISBURSED';
    filter.nextDueDate = { $lt: new Date(toBusinessDate()) };
  }
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ 'applicant.fullName': rx }, { 'applicant.pan': rx }];
  }

  const { page, limit } = query;
  const [items, total] = await Promise.all([
    Loan.find(filter)
      .sort(query.overdue === 'true' ? { nextDueDate: 1 } : { createdAt: -1 }) // most overdue first
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(LOAN_POPULATE)
      .lean<LoanWithRefs[]>(),
    Loan.countDocuments(filter),
  ]);

  return { items: items.map((l) => toLoanDTO(l, viewer.role)), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
