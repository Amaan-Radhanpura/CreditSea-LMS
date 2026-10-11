/**
 * Idempotent seed: `npm run seed`
 *  - staff accounts: 1 admin + 2–3 per executive role, with known credentials (password reset on every run)
 *  - demo leads and loans in every lifecycle stage, spread across the executives
 *  - a matching audit trail for every demo action (who applied, viewed the slip, approved, disbursed, collected)
 *  - syncs all indexes declared in the schemas
 * Re-running resets the demo data and the test borrower to a known state.
 */
import fs from 'fs';
import path from 'path';
import mongoose, { Types } from 'mongoose';
import {
  LOAN_RULES,
  LOAN_TERMS_VERSION,
  runBre,
  simpleInterestPaise,
  toBusinessDate,
  toPaise,
  toRupees,
  type AuditAction,
  type EmploymentMode,
  type ExecutiveRole,
  type LoanStatus,
  type Role,
} from '@lms/shared';
import { connectDB, disconnectDB } from '../config/db';
import { env } from '../config/env';
import { AuditLog, BorrowerProfile, DocumentModel, Loan, Notification, Payment, User, type IStatusChange } from '../models';
import { hashPassword } from '../modules/auth/auth.service';
import { buildSchedule, nextDue, withDueDates } from '../modules/loans/schedule';
import { runReminderJob } from '../modules/notifications/reminderJob';

const PASSWORD = 'Password@123';
const DEMO_DOMAIN = '@demo.lms.dev';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/** First account of each role is the "main" one used in the README / login page. */
const STAFF: { role: Role; name: string; email: string }[] = [
  { role: 'ADMIN', name: 'Aarti Admin', email: 'admin@lms.dev' },
  { role: 'SALES', name: 'Sameer Shah', email: 'sales@lms.dev' },
  { role: 'SALES', name: 'Priya Desai', email: 'sales2@lms.dev' },
  { role: 'SANCTION', name: 'Sneha Kulkarni', email: 'sanction@lms.dev' },
  { role: 'SANCTION', name: 'Rohit Malhotra', email: 'sanction2@lms.dev' },
  { role: 'SANCTION', name: 'Fatima Sheikh', email: 'sanction3@lms.dev' },
  { role: 'DISBURSEMENT', name: 'Dev Patel', email: 'disbursement@lms.dev' },
  { role: 'DISBURSEMENT', name: 'Anjali Rao', email: 'disbursement2@lms.dev' },
  { role: 'COLLECTION', name: 'Chetan Joshi', email: 'collection@lms.dev' },
  { role: 'COLLECTION', name: 'Kiran Bhatt', email: 'collection2@lms.dev' },
  { role: 'COLLECTION', name: 'Nisha Menon', email: 'collection3@lms.dev' },
  { role: 'BORROWER', name: 'Bharat Borrower', email: 'borrower@lms.dev' },
];

/** Smallest valid PDF with one line of text, so demo documents open in the browser. */
function samplePdf(text: string): string {
  const stream = `BT /F1 16 Tf 30 70 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  return [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 360 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    `4 0 obj<</Length ${stream.length}>>stream`,
    stream,
    'endstream endobj',
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
    'trailer<</Root 1 0 R>>',
    '%%EOF',
    '',
  ].join('\n');
}

interface DemoBorrower {
  name: string;
  pan?: string;
  dob?: string;
  salary?: number;
  mode?: EmploymentMode;
  /** Days since registration, so lists have a believable order. */
  age: number;
  loan?: {
    principal: number;
    tenureDays: number;
    status: LoanStatus;
    paidFraction?: number;
    rejectionReason?: string;
    /** Pin the due date relative to today (1 = due tomorrow, -3 = 3 days overdue). Needs age ≥ tenure − dueInDays + 3. */
    dueInDays?: number;
    /** Monthly EMI plan (tenureDays must be months x 30). */
    emiMonths?: number;
    /** EMI demo: how many instalments are already paid, and when the money was sent. */
    paidInstalments?: number;
    disbursedDaysAgo?: number;
  };
}

const DEMO: DemoBorrower[] = [
  // Leads (Sales module): registered, never applied
  { name: 'Ravi Kumar', pan: 'RKVPK2201A', dob: '1996-07-21', salary: 33_000, mode: 'SALARIED', age: 1 },
  { name: 'Pooja Mehta', pan: 'BQRPM4821K', dob: '1996-02-11', salary: 18_000, mode: 'UNEMPLOYED', age: 2 },
  { name: 'Imran Shaikh', pan: 'CKSPS7712L', dob: '1990-08-21', salary: 42_000, mode: 'SALARIED', age: 3 },
  { name: 'Neha Joshi', pan: 'DJNPJ3390M', dob: '1993-11-05', salary: 61_000, mode: 'SELF_EMPLOYED', age: 4 },
  // Loans in every stage, spread over several executives
  { name: 'Arjun Nair', pan: 'ENAPN1023P', dob: '1991-04-14', salary: 75_000, mode: 'SALARIED', age: 5, loan: { principal: 150_000, tenureDays: 180, status: 'APPLIED' } },
  { name: 'Kavya Reddy', pan: 'FKRPR5567Q', dob: '1995-09-30', salary: 52_000, mode: 'SALARIED', age: 6, loan: { principal: 80_000, tenureDays: 90, emiMonths: 3, status: 'APPLIED' } },
  { name: 'Sanjay Gupta', pan: 'LSGPG4410V', dob: '1987-07-07', salary: 88_000, mode: 'SELF_EMPLOYED', age: 6, loan: { principal: 250_000, tenureDays: 270, status: 'APPLIED' } },
  { name: 'Vikram Singh', pan: 'GVSPS8890R', dob: '1988-01-19', salary: 95_000, mode: 'SELF_EMPLOYED', age: 9, loan: { principal: 300_000, tenureDays: 365, status: 'SANCTIONED' } },
  { name: 'Divya Krishnan', pan: 'MDKPK7781W', dob: '1992-10-15', salary: 47_000, mode: 'SALARIED', age: 10, loan: { principal: 120_000, tenureDays: 120, status: 'SANCTIONED' } },
  { name: 'Ananya Iyer', pan: 'HAIPI2231S', dob: '1994-06-02', salary: 68_000, mode: 'SALARIED', age: 12, loan: { principal: 100_000, tenureDays: 180, status: 'DISBURSED', paidFraction: 0.4 } },
  { name: 'Mohit Agarwal', pan: 'NMAPA3321X', dob: '1990-03-28', salary: 72_000, mode: 'SALARIED', age: 45, loan: { principal: 200_000, tenureDays: 180, emiMonths: 6, status: 'DISBURSED', paidInstalments: 1, disbursedDaysAgo: 40 } },
  { name: 'Suresh Yadav', pan: 'PSYPY5512Y', dob: '1993-05-17', salary: 39_000, mode: 'SALARIED', age: 32, loan: { principal: 75_000, tenureDays: 30, status: 'DISBURSED', paidFraction: 0.3, dueInDays: 1 } },
  { name: 'Pallavi Das', pan: 'QPDPD6623Z', dob: '1991-09-09', salary: 44_000, mode: 'SALARIED', age: 51, loan: { principal: 90_000, tenureDays: 45, status: 'DISBURSED', paidFraction: 0.2, dueInDays: -3 } },
  { name: 'Rahul Verma', pan: 'JRVPV6654T', dob: '1989-12-12', salary: 58_000, mode: 'SALARIED', age: 20, loan: { principal: 60_000, tenureDays: 60, status: 'CLOSED' } },
  { name: 'Meera Pillai', pan: 'KMPPP9912U', dob: '1997-03-23', salary: 31_000, mode: 'SALARIED', age: 15, loan: { principal: 450_000, tenureDays: 365, status: 'REJECTED', rejectionReason: 'Requested amount is too high for the declared monthly income' } },
];

const PATH_TO: Record<LoanStatus, LoanStatus[]> = {
  APPLIED: ['APPLIED'],
  SANCTIONED: ['APPLIED', 'SANCTIONED'],
  REJECTED: ['APPLIED', 'REJECTED'],
  DISBURSED: ['APPLIED', 'SANCTIONED', 'DISBURSED'],
  CLOSED: ['APPLIED', 'SANCTIONED', 'DISBURSED', 'CLOSED'],
};

type StaffUser = { _id: Types.ObjectId; name: string; role: Role };

/** Round-robin pickers so demo work is spread across each team. */
function makeRoster(staff: StaffUser[]) {
  const counters = new Map<Role, number>();
  return (role: ExecutiveRole): StaffUser => {
    const team = staff.filter((s) => s.role === role);
    const i = counters.get(role) ?? 0;
    counters.set(role, i + 1);
    return team[i % team.length]!;
  };
}

interface AuditRow {
  actor: Types.ObjectId | null;
  actorRole: Role | 'SYSTEM';
  action: AuditAction;
  loan: Types.ObjectId | null;
  subjectUser: Types.ObjectId;
  details: Record<string, unknown>;
  createdAt: Date;
}

async function main() {
  await connectDB();
  console.log('🔧 Syncing indexes…');
  await Promise.all([User, BorrowerProfile, DocumentModel, Loan, Payment, AuditLog, Notification].map((m) => m.syncIndexes()));

  const passwordHash = await hashPassword(PASSWORD);
  const staff: StaffUser[] = [];
  for (const [i, s] of STAFF.entries()) {
    const u = await User.findOneAndUpdate(
      { email: s.email },
      { $set: { name: s.name, role: s.role, passwordHash, isActive: true }, $setOnInsert: { createdAt: daysAgo(60 - i) } },
      { upsert: true, new: true, timestamps: false },
    ).lean();
    staff.push({ _id: u!._id, name: u!.name, role: u!.role });
  }
  const testBorrower = staff.find((s) => s.role === 'BORROWER')!;
  const pick = makeRoster(staff);

  // Reset demo borrowers + the test borrower to a clean, known state.
  const demoUsers = await User.find({ email: { $regex: `${DEMO_DOMAIN.replace('.', '\\.')}$` } }).select('_id').lean();
  const resetIds = [...demoUsers.map((u) => u._id), testBorrower._id];
  const oldLoans = await Loan.find({ borrower: { $in: resetIds } }).select('_id').lean();
  await Promise.all([
    Payment.deleteMany({ loan: { $in: oldLoans.map((l) => l._id) } }),
    Loan.deleteMany({ borrower: { $in: resetIds } }),
    BorrowerProfile.deleteMany({ user: { $in: resetIds } }),
    DocumentModel.deleteMany({ owner: { $in: resetIds } }),
    // Audit log is append-only through the model, so the demo reset goes through the raw driver.
    AuditLog.collection.deleteMany({ $or: [{ subjectUser: { $in: resetIds } }, { actor: { $in: resetIds } }] }),
    Notification.deleteMany({ $or: [{ user: { $in: resetIds } }, { loan: { $in: oldLoans.map((l) => l._id) } }] }),
  ]);
  await User.deleteMany({ _id: { $in: demoUsers.map((u) => u._id) } });

  fs.mkdirSync(env.uploadDir, { recursive: true });
  const audit: AuditRow[] = [];

  for (const d of DEMO) {
    const registeredAt = daysAgo(d.age);
    let clock = registeredAt.getTime();
    const tick = (hours: number) => new Date((clock += hours * HOUR));

    const email = `${d.name.split(' ')[0]!.toLowerCase()}${DEMO_DOMAIN}`;
    const [user] = await User.insertMany([{ name: d.name, email, passwordHash, role: 'BORROWER', createdAt: registeredAt, updatedAt: registeredAt }]);
    const uid = user!._id;
    const log = (action: AuditAction, actor: StaffUser | 'SYSTEM' | 'SELF', details: Record<string, unknown>, at: Date, loan: Types.ObjectId | null = null) =>
      audit.push({
        actor: actor === 'SYSTEM' ? null : actor === 'SELF' ? uid : actor._id,
        actorRole: actor === 'SYSTEM' ? 'SYSTEM' : actor === 'SELF' ? 'BORROWER' : actor.role,
        action,
        loan,
        subjectUser: uid,
        details,
        createdAt: at,
      });

    log('USER_REGISTERED', 'SELF', { email }, registeredAt);
    if (!d.pan || !d.dob || d.salary === undefined || !d.mode) continue;

    const bre = runBre({ dob: d.dob, monthlySalary: d.salary, pan: d.pan, employmentMode: d.mode });
    const profileAt = tick(0.01); // same sign-up form as the account
    log('PROFILE_SUBMITTED', 'SELF', { brePassed: bre.passed, failedRules: bre.failures.map((f) => f.rule), monthlySalary: d.salary, employmentMode: d.mode }, profileAt);

    // Sign-up collects everything at once: details + salary slip + PAN card.
    const first = d.name.split(' ')[0]!.toLowerCase();
    const makeDoc = async (kind: 'SALARY_SLIP' | 'PAN_CARD', label: string) => {
      const pdf = samplePdf(`${label} - ${d.name}`);
      const storedName = `seed-${kind.toLowerCase()}-${uid.toString()}.pdf`;
      fs.writeFileSync(path.join(env.uploadDir, storedName), pdf);
      return DocumentModel.create({ owner: uid, kind, originalName: `${kind === 'PAN_CARD' ? 'pan-card' : 'salary-slip'}-${first}.pdf`, storedName, mimeType: 'application/pdf', size: Buffer.byteLength(pdf) });
    };
    const slipDoc = await makeDoc('SALARY_SLIP', 'Salary Slip');
    const panDoc = await makeDoc('PAN_CARD', `PAN ${d.pan}`);
    const slipId = slipDoc._id;
    log('SLIP_UPLOADED', 'SELF', { documentId: slipId.toString(), fileName: slipDoc.originalName, size: slipDoc.size }, tick(0.01));
    log('PAN_CARD_UPLOADED', 'SELF', { documentId: panDoc._id.toString(), fileName: panDoc.originalName, size: panDoc.size }, tick(0.01));

    await BorrowerProfile.create({
      user: uid,
      fullName: d.name,
      pan: d.pan,
      dob: new Date(d.dob),
      monthlySalary: toPaise(d.salary),
      employmentMode: d.mode,
      bre: { ...bre, checkedAt: profileAt },
      salarySlip: slipId,
      panCard: panDoc._id,
    });

    if (!d.loan) continue;

    // --- Loan lifecycle, with the executive who handled each stage
    const loanId = new Types.ObjectId();
    const principal = toPaise(d.loan.principal);
    const simpleInterest = simpleInterestPaise(principal, LOAN_RULES.INTEREST_RATE, d.loan.tenureDays);
    const totalRepayment = principal + simpleInterest;
    const plan = d.loan.emiMonths ? ('EMI' as const) : ('ONE_TIME' as const);
    let instalments = buildSchedule(plan, totalRepayment, d.loan.emiMonths ?? null);
    const paid =
      d.loan.status === 'CLOSED'
        ? totalRepayment
        : d.loan.paidInstalments
          ? instalments.slice(0, d.loan.paidInstalments).reduce((sum, i) => sum + i.amount, 0)
          : Math.round(totalRepayment * (d.loan.paidFraction ?? 0));

    const sanctionExec = pick('SANCTION');
    const disburseExec = pick('DISBURSEMENT');
    const collectionExec = pick('COLLECTION');
    const steps = PATH_TO[d.loan.status];
    const history: IStatusChange[] = [];
    const stamps: Partial<Record<LoanStatus, Date>> = {};
    const assign = (exec: StaffUser, stage: ExecutiveRole) =>
      log('LOAN_ASSIGNED', 'SYSTEM', { stage, assigneeId: exec._id.toString(), assigneeName: exec.name, reason: 'Auto-assigned (least open loans)' }, tick(0.01), loanId);

    for (const [i, to] of steps.entries()) {
      const from = i === 0 ? null : steps[i - 1]!;
      if (to === 'APPLIED') {
        const at = tick(2);
        stamps.APPLIED = at;
        history.push({ from, to, by: uid, at, note: 'Application submitted' });
        log('LOAN_APPLIED', 'SELF', { principal: d.loan.principal, tenureDays: d.loan.tenureDays, repaymentPlan: plan, emiMonths: d.loan.emiMonths ?? null, totalRepayment: toRupees(totalRepayment), consent: LOAN_TERMS_VERSION }, at, loanId);
        assign(sanctionExec, 'SANCTION');
        log('DOCUMENT_VIEWED', sanctionExec, { documentId: slipId.toString(), kind: 'SALARY_SLIP', fileName: slipDoc.originalName }, tick(20), loanId);
        log('DOCUMENT_VIEWED', sanctionExec, { documentId: panDoc._id.toString(), kind: 'PAN_CARD', fileName: panDoc.originalName }, tick(0.1), loanId);
      } else if (to === 'SANCTIONED' || to === 'REJECTED') {
        const at = tick(1);
        stamps[to] = at;
        const note = to === 'REJECTED' ? d.loan.rejectionReason! : 'Loan approved';
        history.push({ from, to, by: sanctionExec._id, at, note });
        log(to === 'SANCTIONED' ? 'LOAN_SANCTIONED' : 'LOAN_REJECTED', sanctionExec, { from, to, note, assignedTo: sanctionExec.name, actedByAssignee: true }, at, loanId);
        if (to === 'SANCTIONED') assign(disburseExec, 'DISBURSEMENT');
      } else if (to === 'DISBURSED') {
        let at = tick(18);
        if (d.loan.dueInDays !== undefined) {
          // Disburse on (due date − tenure) at 10:00 IST, so the due date lands exactly where we want it.
          const due = new Date(toBusinessDate(new Date(Date.now() + d.loan.dueInDays * DAY)));
          at = new Date(due.getTime() - d.loan.tenureDays * DAY + 4.5 * HOUR);
          clock = at.getTime();
        } else if (d.loan.disbursedDaysAgo !== undefined) {
          at = new Date(new Date(toBusinessDate(daysAgo(d.loan.disbursedDaysAgo))).getTime() + 4.5 * HOUR);
          clock = at.getTime();
        }
        instalments = withDueDates(instalments, plan, d.loan.tenureDays, at);
        stamps.DISBURSED = at;
        history.push({ from, to, by: disburseExec._id, at, note: 'Funds released to borrower' });
        log('LOAN_DISBURSED', disburseExec, { from, to, note: 'Funds released to borrower', assignedTo: disburseExec.name, actedByAssignee: true }, at, loanId);
        assign(collectionExec, 'COLLECTION');
      }
    }

    // --- Payments (two instalments so the ledger shows more than one row)
    const payments: { loan: Types.ObjectId; utr: string; amount: number; paymentDate: Date; recordedBy: Types.ObjectId; createdAt: Date; updatedAt: Date }[] = [];
    if (paid > 0) {
      const parts = [Math.round(paid / 2), paid - Math.round(paid / 2)];
      let paidSoFar = 0;
      for (const [i, amount] of parts.entries()) {
        const at = tick(24 * (i + 1));
        paidSoFar += amount;
        const utr = `SEEDUTR${d.pan}${i + 1}`;
        payments.push({ loan: loanId, utr, amount, paymentDate: at, recordedBy: collectionExec._id, createdAt: at, updatedAt: at });
        log('PAYMENT_RECORDED', collectionExec, { utr, amount: toRupees(amount), paymentDate: toBusinessDate(at), outstandingAfter: toRupees(totalRepayment - paidSoFar) }, at, loanId);
      }
    }
    if (d.loan.status === 'CLOSED') {
      const at = tick(0.01);
      stamps.CLOSED = at;
      history.push({ from: 'DISBURSED', to: 'CLOSED', by: null, at, note: 'Auto-closed: loan fully repaid' });
      log('LOAN_CLOSED', 'SYSTEM', { from: 'DISBURSED', to: 'CLOSED', note: 'Auto-closed: loan fully repaid' }, at, loanId);
    }

    const currentAssignee: Partial<Record<LoanStatus, StaffUser>> = { APPLIED: sanctionExec, SANCTIONED: disburseExec, DISBURSED: collectionExec };
    await Loan.collection.insertOne({
      _id: loanId,
      borrower: uid,
      applicant: { fullName: d.name, pan: d.pan, dob: new Date(d.dob), monthlySalary: toPaise(d.salary), employmentMode: d.mode },
      salarySlip: slipId,
      panCard: panDoc._id,
      assignee: currentAssignee[d.loan.status]?._id ?? null,
      principal,
      interestRate: LOAN_RULES.INTEREST_RATE,
      tenureDays: d.loan.tenureDays,
      repaymentPlan: plan,
      emiMonths: d.loan.emiMonths ?? null,
      instalments,
      ...(d.loan.status === 'DISBURSED' ? nextDue(instalments, paid) : { nextDueDate: null, nextDueAmount: null }),
      simpleInterest,
      totalRepayment,
      amountPaid: paid,
      status: d.loan.status,
      isOpen: !['REJECTED', 'CLOSED'].includes(d.loan.status),
      ...(d.loan.rejectionReason && { rejectionReason: d.loan.rejectionReason, rejectedAt: stamps.REJECTED, rejectedBy: sanctionExec._id }),
      ...(stamps.SANCTIONED && { sanctionedAt: stamps.SANCTIONED, sanctionedBy: sanctionExec._id }),
      ...(stamps.DISBURSED && {
        disbursedAt: stamps.DISBURSED,
        disbursedBy: disburseExec._id,
        dueDate: instalments[instalments.length - 1]!.dueDate,
      }),
      ...(stamps.CLOSED && { closedAt: stamps.CLOSED }),
      consent: { termsVersion: LOAN_TERMS_VERSION, acceptedAt: stamps.APPLIED },
      statusHistory: history,
      createdAt: stamps.APPLIED,
      updatedAt: new Date(clock),
      __v: 0,
    });
    if (payments.length) await Payment.collection.insertMany(payments);
  }

  // The evaluator's test borrower: signed up with complete details and both documents, no loans yet,
  // so "apply" is just amount + days.
  {
    const tb = testBorrower;
    const at = daysAgo(2);
    const details = { fullName: tb.name, pan: 'BHRPB4455C', dob: '1994-01-15', salary: 55_000, mode: 'SALARIED' as const };
    const docs = [];
    for (const [kind, label, file] of [
      ['SALARY_SLIP', 'Salary Slip', 'salary-slip-bharat.pdf'],
      ['PAN_CARD', `PAN ${details.pan}`, 'pan-card-bharat.pdf'],
    ] as const) {
      const pdf = samplePdf(`${label} - ${tb.name}`);
      const storedName = `seed-${kind.toLowerCase()}-${tb._id.toString()}.pdf`;
      fs.writeFileSync(path.join(env.uploadDir, storedName), pdf);
      docs.push(await DocumentModel.create({ owner: tb._id, kind, originalName: file, storedName, mimeType: 'application/pdf', size: Buffer.byteLength(pdf) }));
    }
    const bre = runBre({ dob: details.dob, monthlySalary: details.salary, pan: details.pan, employmentMode: details.mode });
    await BorrowerProfile.create({
      user: tb._id,
      fullName: details.fullName,
      pan: details.pan,
      dob: new Date(details.dob),
      monthlySalary: toPaise(details.salary),
      employmentMode: details.mode,
      bre: { ...bre, checkedAt: at },
      salarySlip: docs[0]!._id,
      panCard: docs[1]!._id,
    });
    const self = { actor: tb._id, actorRole: 'BORROWER' as const, loan: null, subjectUser: tb._id, createdAt: at };
    audit.push(
      { ...self, action: 'PROFILE_SUBMITTED', details: { brePassed: bre.passed, failedRules: [], monthlySalary: details.salary, employmentMode: details.mode } },
      { ...self, action: 'SLIP_UPLOADED', details: { documentId: docs[0]!._id.toString(), fileName: docs[0]!.originalName, size: docs[0]!.size } },
      { ...self, action: 'PAN_CARD_UPLOADED', details: { documentId: docs[1]!._id.toString(), fileName: docs[1]!.originalName, size: docs[1]!.size } },
    );
  }

  if (audit.length) await AuditLog.collection.insertMany(audit.map((a) => ({ ...a, ipAddress: '127.0.0.1' })));

  // Same job the server runs hourly: creates "due tomorrow" and overdue reminders for the demo loans.
  const reminders = await runReminderJob();
  console.log(`🔔 Reminders: ${reminders.dueReminders} due tomorrow, ${reminders.overdueReminders} overdue, ${reminders.staffAlerts} staff alerts`);

  console.log(`\n✅ Seed complete: ${staff.length} accounts, ${DEMO.length} demo borrowers, ${audit.length} audit entries.`);
  console.log(`   Password for every account: ${PASSWORD}\n`);
  console.table(STAFF.map((s) => ({ role: s.role, name: s.name, email: s.email })));
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('❌ Seed failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
