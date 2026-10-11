import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toBusinessDate, type Role } from '@lms/shared';
import { createApp } from '../src/app';
import { AuditLog, BorrowerProfile, DocumentModel, Loan, Notification, Payment, User } from '../src/models';
import { isOverdueReminderDay, runReminderJob } from '../src/modules/notifications/reminderJob';
import { hashPassword } from '../src/modules/auth/auth.service';

const app = createApp();
let mongo: MongoMemoryReplSet;

const PASSWORD = 'Password@123';
const PDF = Buffer.from('%PDF-1.4\n%test salary slip\n');
const today = toBusinessDate();

async function loginAs(role: Role) {
  const email = `${role.toLowerCase()}@test.dev`;
  await User.updateOne(
    { email },
    { $setOnInsert: { name: `${role} user`, email, role, passwordHash: await hashPassword(PASSWORD) } },
    { upsert: true },
  );
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

let panSeq = 1000;
/** A fresh, valid PAN per call (eligible PANs are unique across borrowers). */
const nextPan = () => `ZZZPQ${panSeq++}K`;

/** Multipart sign-up: account + personal details + both documents (any can be overridden / left out). */
function signup(
  agent: ReturnType<typeof request.agent> | ReturnType<typeof request>,
  fields: Record<string, string | number>,
  files: Partial<Record<'salarySlip' | 'panCard', [Buffer, string]>> = { salarySlip: [PDF, 'slip.pdf'], panCard: [PDF, 'pan.pdf'] },
) {
  const all = { password: 'abc12345', fullName: 'Test Person', pan: nextPan(), dob: '1994-05-20', monthlySalary: 60000, employmentMode: 'SALARIED', ...fields };
  let req = agent.post('/api/auth/register');
  for (const [k, v] of Object.entries(all)) req = req.field(k, String(v));
  for (const [k, f] of Object.entries(files)) if (f) req = req.attach(k, f[0], f[1]);
  return req;
}

beforeAll(async () => {
  // Replica set (not a standalone server) because payments use multi-document transactions.
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([User, BorrowerProfile, DocumentModel, Loan, Payment, AuditLog, Notification].map((m) => m.init()));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('Auth', () => {
  it('signs up borrowers only, even if a role is sent', async () => {
    const res = await signup(request(app), { name: 'Sneaky', email: 'sneaky@test.dev', role: 'ADMIN' }).expect(201);
    expect(res.body.data.user.role).toBe('BORROWER');
    expect(res.body.data.bre.passed).toBe(true);
    expect(res.headers['set-cookie']?.[0]).toMatch(/lms_token=.*HttpOnly/);
  });

  it('rejects duplicate email (409), bad password (401) and missing session (401)', async () => {
    await signup(request(app), { name: 'Dup', email: 'sneaky@test.dev' }).expect(409);
    await request(app).post('/api/auth/login').send({ email: 'sneaky@test.dev', password: 'wrong123' }).expect(401);
    await request(app).get('/api/auth/me').expect(401);
  });

  it('needs both documents and valid fields at sign-up, and saves nothing otherwise', async () => {
    const noPan = await signup(request(app), { name: 'No Pan', email: 'nopan@test.dev' }, { salarySlip: [PDF, 'slip.pdf'] }).expect(400);
    expect(noPan.body.error.details).toHaveProperty('panCard');
    await signup(request(app), { name: 'Bad File', email: 'badfile@test.dev' }, { salarySlip: [Buffer.from('hi'), 'slip.txt'], panCard: [PDF, 'pan.pdf'] }).expect(415);
    await signup(request(app), { name: 'Bad Field', email: 'badfield@test.dev', dob: 'yesterday' }).expect(400);
    expect(await User.countDocuments({ email: { $in: ['nopan@test.dev', 'badfile@test.dev', 'badfield@test.dev'] } })).toBe(0);
  });
});

describe('RBAC', () => {
  it('returns 401 without a session', async () => {
    await request(app).get('/api/sanction/loans').expect(401);
  });

  it('returns 403 when a role opens another module, and lets ADMIN into all of them', async () => {
    const borrower = await loginAs('BORROWER');
    const sales = await loginAs('SALES');
    const sanction = await loginAs('SANCTION');
    const admin = await loginAs('ADMIN');

    await borrower.get('/api/sanction/loans').expect(403);
    await sales.get('/api/sanction/loans').expect(403);
    await sales.get('/api/collection/loans').expect(403);
    await sanction.get('/api/borrower/state').expect(403);
    await admin.get('/api/borrower/state').expect(403); // the borrower portal is borrower-only
    await sales.get('/api/sales/leads').expect(200);
    for (const m of ['sanction', 'disbursement', 'collection']) await admin.get(`/api/${m}/loans`).expect(200);
    await admin.get('/api/sales/leads').expect(200);
    await admin.get('/api/admin/stats').expect(200);
  });
});

describe('Borrower journey + loan lifecycle', () => {
  let borrower: ReturnType<typeof request.agent>;
  let loanId = '';
  let slipId = '';
  const profile = { fullName: 'Asha Rao', pan: 'abcpr1234k', dob: '1994-05-20', monthlySalary: 60000, employmentMode: 'SALARIED' };

  it('an ineligible borrower gets an account at sign-up, with every failed rule, but cannot apply', async () => {
    const agent = request.agent(app);
    const res = await signup(agent, {
      name: 'Too Young',
      email: 'young@test.dev',
      pan: 'BAD',
      dob: '2010-01-01',
      monthlySalary: 10000,
      employmentMode: 'UNEMPLOYED',
    }).expect(201);
    expect(res.body.data.bre.failures.map((f: { rule: string }) => f.rule)).toEqual(['AGE', 'SALARY', 'PAN', 'EMPLOYMENT']);
    expect((await agent.get('/api/borrower/state').expect(200)).body.data.step).toBe('NOT_ELIGIBLE');
    const apply = await agent.post('/api/loans').send({ principal: 100000, tenureDays: 180, consentAccepted: true }).expect(422);
    expect(apply.body.error.code).toBe('BRE_REJECTED');
  });

  it('an eligible borrower signs up once with everything and goes straight to the loan step', async () => {
    borrower = request.agent(app);
    await signup(borrower, { name: 'Asha', email: 'asha@test.dev', ...profile }).expect(201);
    const state = (await borrower.get('/api/borrower/state').expect(200)).body.data;
    expect(state.step).toBe('LOAN_CONFIG');
    expect(state.profile.pan).toBe('ABCPR1234K'); // normalized
    expect(state.profile.salarySlip).toMatchObject({ kind: 'SALARY_SLIP' });
    expect(state.profile.panCard).toMatchObject({ kind: 'PAN_CARD' });
  });

  it('re-runs the BRE when details are edited (422 lists every failed rule)', async () => {
    const res = await borrower
      .put('/api/borrower/profile')
      .send({ fullName: 'Asha Rao', pan: 'BAD', dob: '2010-01-01', monthlySalary: 10000, employmentMode: 'UNEMPLOYED' })
      .expect(422);
    expect(res.body.error.code).toBe('BRE_REJECTED');
    expect(res.body.error.details.failures.map((f: { rule: string }) => f.rule)).toEqual(['AGE', 'SALARY', 'PAN', 'EMPLOYMENT']);
    await borrower.post('/api/loans').send({ principal: 100000, tenureDays: 180, consentAccepted: true }).expect(422);
    expect((await borrower.put('/api/borrower/profile').send(profile).expect(200)).body.data.step).toBe('LOAN_CONFIG');
  });

  it('validates document uploads: type (415), spoofed content (415), size (413)', async () => {
    const url = '/api/borrower/documents/salary-slip';
    await borrower.post(url).attach('file', Buffer.from('hello'), 'slip.txt').expect(415);
    await borrower.post(url).attach('file', Buffer.from('not really a pdf'), 'slip.pdf').expect(415);
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    await borrower.post(url).attach('file', big, 'big.pdf').expect(413);
  });

  it('replaces the salary slip and PAN card', async () => {
    const res = await borrower.post('/api/borrower/documents/salary-slip').attach('file', PDF, 'new-slip.pdf').expect(201);
    expect(res.body.data.step).toBe('LOAN_CONFIG');
    expect(res.body.data.profile.salarySlip.originalName).toBe('new-slip.pdf');
    slipId = res.body.data.profile.salarySlip.id;
    await borrower.post('/api/borrower/documents/pan-card').attach('file', PDF, 'new-pan.pdf').expect(201);
  });

  it('requires consent and valid ranges', async () => {
    await borrower.post('/api/loans').send({ principal: 100000, tenureDays: 180 }).expect(400);
    await borrower.post('/api/loans').send({ principal: 10000, tenureDays: 180, consentAccepted: true }).expect(400);
    await borrower.post('/api/loans').send({ principal: 100000, tenureDays: 400, consentAccepted: true }).expect(400);
  });

  it('creates the loan with server-computed simple interest', async () => {
    const res = await borrower
      .post('/api/loans')
      .send({ principal: 100000, tenureDays: 180, consentAccepted: true, totalRepayment: 1 }) // client totals are ignored
      .expect(201);
    expect(res.body.data).toMatchObject({ status: 'APPLIED', simpleInterest: 5917.81, totalRepayment: 105917.81, outstanding: 105917.81 });
    expect(res.body.data.assignee).toMatchObject({ role: 'SANCTION' }); // auto-assigned to a sanction executive
    loanId = res.body.data.id;
  });

  it('allows only one open loan per borrower (409)', async () => {
    const res = await borrower.post('/api/loans').send({ principal: 60000, tenureDays: 30, consentAccepted: true }).expect(409);
    expect(res.body.error.code).toBe('OPEN_LOAN_EXISTS');
  });

  it('lets Sanction open the salary slip, but not other roles', async () => {
    const sanction = await loginAs('SANCTION');
    const collection = await loginAs('COLLECTION');
    await sanction.get(`/api/documents/${slipId}`).expect(200).expect('Content-Type', /pdf/);
    await collection.get(`/api/documents/${slipId}`).expect(403);
    await borrower.get(`/api/documents/${slipId}`).expect(200);
  });

  it('enforces the state machine: no disbursing before sanction, no double approval', async () => {
    const sanction = await loginAs('SANCTION');
    const disbursement = await loginAs('DISBURSEMENT');

    await disbursement.patch(`/api/disbursement/loans/${loanId}/disburse`).expect(409);
    const approved = await sanction.patch(`/api/sanction/loans/${loanId}/approve`).expect(200);
    expect(approved.body.data.status).toBe('SANCTIONED');
    await sanction.patch(`/api/sanction/loans/${loanId}/approve`).expect(409);
    await sanction.patch(`/api/sanction/loans/${loanId}/reject`).send({ reason: 'Too late to reject now' }).expect(409);

    const disbursed = await disbursement.patch(`/api/disbursement/loans/${loanId}/disburse`).expect(200);
    expect(disbursed.body.data.status).toBe('DISBURSED');
    expect(disbursed.body.data.dueDate).toBeDefined();
  });

  it('masks PAN for roles that do not verify identity', async () => {
    const collection = await loginAs('COLLECTION');
    const res = await collection.get(`/api/collection/loans/${loanId}`).expect(200);
    expect(res.body.data.applicant.pan).toBe('ABCPR****K');
  });

  it('records payments: validates amount and UTR, then auto-closes when fully repaid', async () => {
    const collection = await loginAs('COLLECTION');
    const url = `/api/collection/loans/${loanId}/payments`;

    const over = await collection.post(url).send({ utr: 'UTR000001', amount: 200000, paymentDate: today }).expect(400);
    expect(over.body.error.code).toBe('OVERPAYMENT');
    await collection.post(url).send({ utr: 'UTR000001', amount: 0, paymentDate: today }).expect(400);
    await collection.post(url).send({ utr: 'UTR000001', amount: 10.555, paymentDate: today }).expect(400);
    await collection.post(url).send({ utr: 'UTR000001', amount: 100, paymentDate: '2999-01-01' }).expect(400);

    const first = await collection.post(url).send({ utr: 'utr000001', amount: 50000, paymentDate: today }).expect(201);
    expect(first.body.data).toMatchObject({ loanClosed: false, loan: { amountPaid: 50000, outstanding: 55917.81 } });

    const dup = await collection.post(url).send({ utr: 'UTR000001', amount: 100, paymentDate: today }).expect(409);
    expect(dup.body.error.code).toBe('DUPLICATE_UTR');
    expect(await Payment.countDocuments({ loan: loanId })).toBe(1); // transaction rolled back the failed insert

    const last = await collection.post(url).send({ utr: 'UTR000002', amount: 55917.81, paymentDate: today }).expect(201);
    expect(last.body.data).toMatchObject({ loanClosed: true, loan: { status: 'CLOSED', outstanding: 0 } });

    await collection.post(url).send({ utr: 'UTR000003', amount: 1, paymentDate: today }).expect(409); // closed loans take no more payments
  });

  it('keeps a full audit trail and lets the borrower apply again after closure', async () => {
    const res = await borrower.get('/api/loans/me').expect(200);
    expect(res.body.data[0].statusHistory.map((h: { to: string }) => h.to)).toEqual(['APPLIED', 'SANCTIONED', 'DISBURSED', 'CLOSED']);
    await borrower.post('/api/loans').send({ principal: 50000, tenureDays: 30, consentAccepted: true }).expect(201);
  });

  it('requires a reason to reject', async () => {
    const sanction = await loginAs('SANCTION');
    const [loan] = (await borrower.get('/api/loans/me')).body.data;
    await sanction.patch(`/api/sanction/loans/${loan.id}/reject`).send({ reason: 'no' }).expect(400);
    const res = await sanction.patch(`/api/sanction/loans/${loan.id}/reject`).send({ reason: 'Income could not be verified' }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'REJECTED', rejectionReason: 'Income could not be verified' });
  });
});

describe('Sales leads', () => {
  it('lists registered borrowers who have not applied, with their stage', async () => {
    await signup(request(app), { name: 'Lead One', email: 'lead1@test.dev' }).expect(201);
    const sales = await loginAs('SALES');
    const res = await sales.get('/api/sales/leads?search=lead1').expect(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({ email: 'lead1@test.dev', stage: 'SLIP_UPLOADED' }); // signed up with everything: ready to apply

    const all = await sales.get('/api/sales/leads').expect(200);
    expect(all.body.data.items.map((l: { email: string }) => l.email)).not.toContain('asha@test.dev'); // has loans
  });
});

describe('Audit trail, assignment and users', () => {
  it('records every step of the loan, including who viewed the documents', async () => {
    const admin = await loginAs('ADMIN');
    const loan = await Loan.findOne({ status: 'CLOSED', 'applicant.fullName': 'Asha Rao' }).lean();
    const res = await admin.get(`/api/audit/loans/${loan!._id}?limit=50`).expect(200);
    const actions = res.body.data.items.map((e: { action: string }) => e.action).reverse();
    expect(actions).toEqual(
      expect.arrayContaining(['LOAN_APPLIED', 'LOAN_ASSIGNED', 'DOCUMENT_VIEWED', 'LOAN_SANCTIONED', 'LOAN_DISBURSED', 'PAYMENT_RECORDED', 'LOAN_CLOSED']),
    );
    expect(actions.indexOf('LOAN_APPLIED')).toBeLessThan(actions.indexOf('LOAN_SANCTIONED'));
    const closed = res.body.data.items.find((e: { action: string }) => e.action === 'LOAN_CLOSED');
    expect(closed.actor).toBeNull(); // done by the system
  });

  it("shows a borrower's history including what executives did to their loans", async () => {
    const admin = await loginAs('ADMIN');
    const asha = await User.findOne({ email: 'asha@test.dev' }).lean();
    const res = await admin.get(`/api/admin/users/${asha!._id}/activity?limit=50`).expect(200);
    const roles = new Set(res.body.data.items.map((e: { actor: { role: string } | null }) => e.actor?.role ?? 'SYSTEM'));
    expect(roles).toEqual(new Set(['BORROWER', 'SANCTION', 'DISBURSEMENT', 'COLLECTION', 'SYSTEM']));
  });

  it('lists users with activity counts for admin only', async () => {
    const admin = await loginAs('ADMIN');
    const sales = await loginAs('SALES');
    await sales.get('/api/admin/users').expect(403);
    const res = await admin.get('/api/admin/users?role=SANCTION').expect(200);
    expect(res.body.data.items[0]).toMatchObject({ role: 'SANCTION' });
    expect(res.body.data.items[0].actionCount).toBeGreaterThan(0);
  });

  it('lets admin re-assign an open loan, only to an executive of the right role', async () => {
    const admin = await loginAs('ADMIN');
    const sales = await User.findOne({ role: 'SALES' }).lean();
    const sanction2 = await User.create({ name: 'Second Sanction', email: 'sanction2@test.dev', role: 'SANCTION', passwordHash: 'x' });
    const loan = await Loan.findOne({ status: 'REJECTED' }).lean();
    await admin.patch(`/api/admin/loans/${loan!._id}/assign`).send({ assigneeId: sanction2._id.toString() }).expect(409); // nothing pending

    const borrower = request.agent(app);
    await borrower.post('/api/auth/login').send({ email: 'asha@test.dev', password: 'abc12345' }).expect(200);
    const applied = await borrower.post('/api/loans').send({ principal: 70000, tenureDays: 60, consentAccepted: true }).expect(201);

    await admin.patch(`/api/admin/loans/${applied.body.data.id}/assign`).send({ assigneeId: sales!._id.toString() }).expect(400);
    const ok = await admin.patch(`/api/admin/loans/${applied.body.data.id}/assign`).send({ assigneeId: sanction2._id.toString() }).expect(200);
    expect(ok.body.data.assignee).toMatchObject({ name: 'Second Sanction' });

    const sanction = await loginAs('SANCTION');
    const mine = await sanction.get('/api/sanction/loans?mine=true').expect(200);
    expect(mine.body.data.items.map((l: { id: string }) => l.id)).not.toContain(applied.body.data.id);
  });

  it('is append-only', async () => {
    await expect(AuditLog.updateOne({}, { $set: { action: 'LOAN_CLOSED' } })).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });
});

describe('Due dates, overdue tracking and notifications', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('notifies the borrower at each lifecycle step', async () => {
    const asha = request.agent(app);
    await asha.post('/api/auth/login').send({ email: 'asha@test.dev', password: 'abc12345' }).expect(200);
    const res = await asha.get('/api/notifications').expect(200);
    const types = res.body.data.items.map((n: { type: string }) => n.type);
    expect(types).toEqual(expect.arrayContaining(['LOAN_APPLIED', 'LOAN_SANCTIONED', 'LOAN_DISBURSED', 'PAYMENT_RECEIVED', 'LOAN_CLOSED', 'LOAN_REJECTED']));
    expect(res.body.data.unread).toBeGreaterThan(0);
    const cleared = await asha.patch('/api/notifications/read-all').expect(200);
    expect(cleared.body.data.unread).toBe(0);
  });

  it('sets the due date at disbursement and flags overdue loans', async () => {
    const loan = await Loan.findOne({ status: 'CLOSED', 'applicant.fullName': 'Asha Rao' }).lean();
    expect(loan!.dueDate).toBeInstanceOf(Date);

    // Make an active loan overdue by 3 days and another due tomorrow.
    const [overdue, dueSoon] = await Loan.find({ status: { $in: ['APPLIED', 'REJECTED'] } }).sort({ status: 1 }).limit(2).lean();
    expect(dueSoon).toBeDefined();
    const today = new Date(toBusinessDate());
    const makeDue = (loan: typeof overdue, due: Date) =>
      Loan.collection.updateOne(
        { _id: loan!._id },
        { $set: { status: 'DISBURSED', dueDate: due, nextDueDate: due, nextDueAmount: loan!.totalRepayment - loan!.amountPaid, 'instalments.0.dueDate': due, disbursedAt: new Date(Date.now() - 40 * DAY) } },
      );
    await makeDue(overdue, new Date(today.getTime() - 3 * DAY));
    await makeDue(dueSoon, new Date(today.getTime() + DAY));

    const collection = await loginAs('COLLECTION');
    const list = await collection.get('/api/collection/loans?overdue=true').expect(200);
    expect(list.body.data.items.map((l: { id: string }) => l.id)).toContain(overdue!._id.toString());
    expect(list.body.data.items[0]).toMatchObject({ isOverdue: true, daysOverdue: 3 });
  });

  it('sends due-tomorrow and overdue reminders exactly once per day', async () => {
    const first = await runReminderJob();
    expect(first.overdueReminders).toBeGreaterThanOrEqual(1);
    expect(first.dueReminders).toBeGreaterThanOrEqual(1);
    const again = await runReminderJob();
    expect(again).toMatchObject({ dueReminders: 0, overdueReminders: 0, staffAlerts: 0 }); // deduplicated
    expect(await Notification.countDocuments({ type: 'DUE_REMINDER' })).toBe(first.dueReminders);
  });

  it('lets admin trigger the reminder job, and only admin', async () => {
    await (await loginAs('COLLECTION')).post('/api/admin/jobs/reminders').expect(403);
    const res = await (await loginAs('ADMIN')).post('/api/admin/jobs/reminders').expect(200);
    expect(res.body.data).toHaveProperty('ranAt');
  });

  it('reminds on day 1, 3, 7 and then weekly', () => {
    expect([1, 2, 3, 4, 7, 8, 14, 15, 21].map(isOverdueReminderDay)).toEqual([true, false, true, false, true, false, true, false, true]);
  });
});

describe('My profile: account and password', () => {
  it('lets any user edit their name, but not their email or role', async () => {
    const sales = await loginAs('SALES');
    const res = await sales.patch('/api/auth/me').send({ name: 'Renamed Sales', email: 'hacker@x.dev', role: 'ADMIN' }).expect(200);
    expect(res.body.data.user).toMatchObject({ name: 'Renamed Sales', email: 'sales@test.dev', role: 'SALES' });
    await sales.patch('/api/auth/me').send({ name: 'x' }).expect(400);
  });

  it('changes the password, keeps this session and logs out every other session', async () => {
    await signup(request(app), { name: 'Pass User', email: 'pass@test.dev', password: 'oldpass123' }).expect(201);
    const phone = request.agent(app);
    const laptop = request.agent(app);
    await phone.post('/api/auth/login').send({ email: 'pass@test.dev', password: 'oldpass123' }).expect(200);
    await laptop.post('/api/auth/login').send({ email: 'pass@test.dev', password: 'oldpass123' }).expect(200);
    await new Promise((r) => setTimeout(r, 1100)); // JWT iat has 1-second precision

    const wrong = await laptop.post('/api/auth/change-password').send({ currentPassword: 'nope1234', newPassword: 'newpass123' }).expect(400);
    expect(wrong.body.error.details.currentPassword[0]).toMatch(/incorrect/);
    await laptop.post('/api/auth/change-password').send({ currentPassword: 'oldpass123', newPassword: 'oldpass123' }).expect(400);
    await laptop.post('/api/auth/change-password').send({ currentPassword: 'oldpass123', newPassword: 'newpass123' }).expect(200);

    await laptop.get('/api/auth/me').expect(200); // this session got a fresh cookie
    const kicked = await phone.get('/api/auth/me').expect(401); // other session is logged out
    expect(kicked.body.error.message).toMatch(/password was changed/);
    await request(app).post('/api/auth/login').send({ email: 'pass@test.dev', password: 'oldpass123' }).expect(401);
    await request(app).post('/api/auth/login').send({ email: 'pass@test.dev', password: 'newpass123' }).expect(200);

    const history = await laptop.get('/api/audit/me').expect(200);
    expect(history.body.data.items.map((e: { action: string }) => e.action)).toContain('PASSWORD_CHANGED');
  });
});

describe('Monthly EMI repayment plan', () => {
  let emiLoanId = '';
  const borrower = request.agent(app);

  it('validates the EMI choice', async () => {
    await signup(borrower, { name: 'Emi User', email: 'emi@test.dev' }).expect(201);
    await borrower.post('/api/loans').send({ principal: 120000, repaymentPlan: 'EMI', consentAccepted: true }).expect(400); // months missing
    await borrower.post('/api/loans').send({ principal: 120000, repaymentPlan: 'EMI', emiMonths: 13, consentAccepted: true }).expect(400);
  });

  it('splits the same simple-interest total into equal monthly EMIs', async () => {
    const res = await borrower.post('/api/loans').send({ principal: 120000, repaymentPlan: 'EMI', emiMonths: 6, consentAccepted: true }).expect(201);
    const loan = res.body.data;
    emiLoanId = loan.id;
    expect(loan).toMatchObject({ repaymentPlan: 'EMI', emiMonths: 6, tenureDays: 180, simpleInterest: 7101.37, totalRepayment: 127101.37, nextDue: null });
    expect(loan.instalments.map((i: { amount: number }) => i.amount)).toEqual([21183.56, 21183.56, 21183.56, 21183.56, 21183.56, 21183.57]);
    expect(loan.instalments.every((i: { dueDate: string | null }) => i.dueDate === null)).toBe(true); // dates come at disbursement
  });

  it('sets monthly due dates at disbursement', async () => {
    await (await loginAs('SANCTION')).patch(`/api/sanction/loans/${emiLoanId}/approve`).expect(200);
    const res = await (await loginAs('DISBURSEMENT')).patch(`/api/disbursement/loans/${emiLoanId}/disburse`).expect(200);
    const dates = res.body.data.instalments.map((i: { dueDate: string }) => Date.parse(i.dueDate));
    expect(dates.slice(1).map((d: number, i: number) => (d - dates[i]) / (24 * 60 * 60 * 1000))).toEqual([30, 30, 30, 30, 30]);
    expect(res.body.data.nextDue).toMatchObject({ number: 1, amount: 21183.56 });
    expect(res.body.data.dueDate).toBe(res.body.data.instalments[5].dueDate);
  });

  it('settles the oldest EMI first and moves the next due forward', async () => {
    const collection = await loginAs('COLLECTION');
    const res = await collection.post(`/api/collection/loans/${emiLoanId}/payments`).send({ utr: 'EMIUTR0001', amount: 30000, paymentDate: today }).expect(201);
    const loan = res.body.data.loan;
    expect(loan.instalments.slice(0, 3).map((i: { status: string }) => i.status)).toEqual(['PAID', 'PARTLY_PAID', 'UPCOMING']);
    expect(loan.nextDue).toMatchObject({ number: 2, amount: 12367.12 }); // 21183.56 - (30000 - 21183.56)
    const stored = await Loan.findById(emiLoanId).lean();
    expect(stored!.nextDueDate!.toISOString()).toBe(stored!.instalments[1]!.dueDate!.toISOString());
  });

  it('sends EMI-specific reminders', async () => {
    const tomorrow = new Date(toBusinessDate(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    await Loan.collection.updateOne({ _id: new mongoose.Types.ObjectId(emiLoanId) }, { $set: { nextDueDate: tomorrow, 'instalments.1.dueDate': tomorrow } });
    await runReminderJob();
    const emi = await User.findOne({ email: 'emi@test.dev' }).lean();
    const note = await Notification.findOne({ user: emi!._id, type: 'DUE_REMINDER' }).lean();
    expect(note!.title).toBe('EMI 2 of 6 due tomorrow');
    expect(note!.message).toContain('12,367.12');
  });
});

describe('Only the assigned executive can act on a loan', () => {
  it('blocks other executives, allows take-over, and keeps the admin override', async () => {
    const borrower = request.agent(app);
    await signup(borrower, { name: 'Assign Test', email: 'assign@test.dev' }).expect(201);
    const loan = (await borrower.post('/api/loans').send({ principal: 60000, tenureDays: 60, consentAccepted: true }).expect(201)).body.data;
    const owner = await User.findById(loan.assignee.id).lean();

    // A second sanction executive who is NOT the assignee
    const other = await User.create({ name: 'Other Sanction', email: 'other.sanction@test.dev', role: 'SANCTION', passwordHash: await hashPassword(PASSWORD) });
    const otherAgent = request.agent(app);
    await otherAgent.post('/api/auth/login').send({ email: other.email, password: PASSWORD }).expect(200);

    const blocked = await otherAgent.patch(`/api/sanction/loans/${loan.id}/approve`).expect(403);
    expect(blocked.body.error.code).toBe('NOT_ASSIGNEE');
    expect(blocked.body.error.message).toContain(owner!.name);

    // Wrong role cannot take it over
    await (await loginAs('COLLECTION')).post(`/api/sanction/loans/${loan.id}/take-over`).expect(403);

    // Take over: now the other executive owns it, the previous owner is notified, and it's audited
    const taken = await otherAgent.post(`/api/sanction/loans/${loan.id}/take-over`).expect(200);
    expect(taken.body.data.assignee).toMatchObject({ id: other._id.toString(), name: 'Other Sanction' });
    expect(await Notification.countDocuments({ user: owner!._id, title: 'Loan taken over' })).toBe(1);
    const trail = await AuditLog.findOne({ loan: loan.id, action: 'LOAN_ASSIGNED', 'details.reason': 'Taken over by Other Sanction' }).lean();
    expect(trail!.details).toMatchObject({ previousAssignee: owner!.name });

    // The previous owner is now the one blocked; the new owner can approve
    const ownerAgent = request.agent(app);
    await User.updateOne({ _id: owner!._id }, { $set: { passwordHash: await hashPassword(PASSWORD) } });
    await ownerAgent.post('/api/auth/login').send({ email: owner!.email, password: PASSWORD }).expect(200);
    await ownerAgent.patch(`/api/sanction/loans/${loan.id}/approve`).expect(403);
    await otherAgent.patch(`/api/sanction/loans/${loan.id}/approve`).expect(200);

    // Admin (supervisor) can act regardless of assignment
    const disbursed = await (await loginAs('ADMIN')).patch(`/api/disbursement/loans/${loan.id}/disburse`).expect(200);
    expect(disbursed.body.data.status).toBe('DISBURSED');
  });

  it('applies to payments too', async () => {
    const loan = await Loan.findOne({ 'applicant.fullName': 'Test Person', status: 'DISBURSED' }).lean();
    const assignee = await User.findById(loan!.assignee).lean();
    const intruder = await User.create({ name: 'Other Collector', email: 'other.collector@test.dev', role: 'COLLECTION', passwordHash: await hashPassword(PASSWORD) });
    expect(assignee).toBeTruthy(); // assigned to the existing collection executive at disbursement
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: intruder.email, password: PASSWORD }).expect(200);
    const res = await agent.post(`/api/collection/loans/${loan!._id}/payments`).send({ utr: 'INTRUDER01', amount: 100, paymentDate: today }).expect(403);
    expect(res.body.error.code).toBe('NOT_ASSIGNEE');
  });
});
