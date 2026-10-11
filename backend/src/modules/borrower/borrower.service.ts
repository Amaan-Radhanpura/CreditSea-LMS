import path from 'path';
import type { ClientSession, Types } from 'mongoose';
import {
  DOCUMENT_LABEL,
  normalizePan,
  runBre,
  toPaise,
  type ApplicationStep,
  type BorrowerStateDTO,
  type BreResult,
  type DocumentKind,
  type ProfileInput,
  type SignupInput,
} from '@lms/shared';
import { BorrowerProfile, DocumentModel, Loan, User, type IUser } from '../../models';
import { ApiError } from '../../utils/ApiError';
import { deleteFile, saveFile } from '../../utils/fileStore';
import { recordAudit } from '../audit/audit.service';
import { hashPassword } from '../auth/auth.service';
import { runInTransaction } from '../loans/loanWorkflow';
import { toProfileDTO } from '../mappers';

const PROFILE_FIELD: Record<DocumentKind, 'salarySlip' | 'panCard'> = { SALARY_SLIP: 'salarySlip', PAN_CARD: 'panCard' };
const UPLOAD_ACTION = { SALARY_SLIP: 'SLIP_UPLOADED', PAN_CARD: 'PAN_CARD_UPLOADED' } as const;

const findOpenLoanId = async (userId: string): Promise<string | null> => {
  const loan = await Loan.findOne({ borrower: userId, isOpen: true }).select('_id').lean();
  return loan ? loan._id.toString() : null;
};

/**
 * Profile + what the borrower can do now. A borrower may apply only when details are saved,
 * the BRE passed, and both documents are on file.
 */
export async function getBorrowerState(userId: string): Promise<BorrowerStateDTO> {
  const [profile, openLoanId] = await Promise.all([
    BorrowerProfile.findOne({ user: userId }).populate(['salarySlip', 'panCard']).lean(),
    findOpenLoanId(userId),
  ]);

  let step: ApplicationStep;
  if (openLoanId) step = 'HAS_OPEN_LOAN';
  else if (!profile) step = 'PERSONAL_DETAILS';
  else if (!profile.bre.passed) step = 'NOT_ELIGIBLE';
  else if (!profile.salarySlip || !profile.panCard) step = 'DOCUMENTS';
  else step = 'LOAN_CONFIG';

  return { profile: profile ? toProfileDTO(profile as never) : null, step, openLoanId };
}

async function assertNoOpenLoan(userId: string): Promise<void> {
  if (await findOpenLoanId(userId)) {
    throw ApiError.conflict('You have a loan in progress, so your details are locked until it is closed', 'OPEN_LOAN_EXISTS');
  }
}

const profileFields = (input: ProfileInput, bre: BreResult) => ({
  fullName: input.fullName,
  pan: normalizePan(input.pan),
  dob: new Date(input.dob),
  monthlySalary: toPaise(input.monthlySalary),
  employmentMode: input.employmentMode,
  bre: { ...bre, checkedAt: new Date() },
});

const breOf = (input: ProfileInput) => runBre({ ...input, pan: normalizePan(input.pan) });

/** Puts the file in GridFS (outside the transaction) and creates its metadata document (inside it). */
async function storeDocument(userId: Types.ObjectId | string, kind: DocumentKind, file: Express.Multer.File, fileId: Types.ObjectId, session?: ClientSession) {
  const [doc] = await DocumentModel.create(
    [
      {
        owner: userId,
        kind,
        originalName: path.basename(file.originalname).slice(0, 255),
        fileId,
        mimeType: file.mimetype,
        size: file.size,
      },
    ],
    { session },
  );
  return doc!;
}

const putFile = (file: Express.Multer.File) => saveFile(file.buffer, path.basename(file.originalname), file.mimetype);

/**
 * Borrower sign-up: account + personal details + salary slip + PAN card, all in ONE transaction,
 * so there is never an account with half its data. The BRE runs here too; an ineligible borrower
 * still gets an account (and shows up as a Sales lead) but cannot apply until their details pass.
 */
export async function signupBorrower(
  input: SignupInput,
  files: { salarySlip: Express.Multer.File; panCard: Express.Multer.File },
  ipAddress?: string,
): Promise<{ user: IUser; bre: BreResult }> {
  const bre = breOf(input);
  const passwordHash = await hashPassword(input.password);

  // GridFS writes can't join the transaction, so store the files first and delete them if anything fails.
  const [slipFileId, panFileId] = await Promise.all([putFile(files.salarySlip), putFile(files.panCard)]);
  try {
    const user = await runInTransaction(async (session) => {
    const [created] = await User.create([{ name: input.name, email: input.email, passwordHash, role: 'BORROWER' }], { session });
    const uid = created!._id;
    const actor = { id: uid.toString(), role: 'BORROWER' as const };

    const slip = await storeDocument(uid, 'SALARY_SLIP', files.salarySlip, slipFileId, session);
    const pan = await storeDocument(uid, 'PAN_CARD', files.panCard, panFileId, session);
    await BorrowerProfile.create([{ user: uid, ...profileFields(input, bre), salarySlip: slip._id, panCard: pan._id }], { session });

    const audit = (action: Parameters<typeof recordAudit>[0]['action'], details: Record<string, unknown>) =>
      recordAudit({ actor, action, subjectUserId: uid, ipAddress, details }, session);
    await audit('USER_REGISTERED', { email: created!.email });
    await audit('PROFILE_SUBMITTED', {
      brePassed: bre.passed,
      failedRules: bre.failures.map((f) => f.rule),
      monthlySalary: input.monthlySalary,
      employmentMode: input.employmentMode,
    });
    await audit('SLIP_UPLOADED', { documentId: slip._id.toString(), fileName: slip.originalName, size: slip.size });
    await audit('PAN_CARD_UPLOADED', { documentId: pan._id.toString(), fileName: pan.originalName, size: pan.size });
    return created!.toObject();
    });
    return { user, bre };
  } catch (err) {
    await Promise.all([deleteFile(slipFileId), deleteFile(panFileId)]);
    throw err;
  }
}

/**
 * Updates personal details and re-runs the BRE server-side (the client check is only for UX).
 * The result is persisted even when it fails, so Sales can see why a lead dropped off.
 */
export async function saveProfile(userId: string, input: ProfileInput): Promise<BorrowerStateDTO> {
  await assertNoOpenLoan(userId);
  const bre = breOf(input);

  await BorrowerProfile.findOneAndUpdate(
    { user: userId },
    { $set: profileFields(input, bre) },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );

  await recordAudit({
    actor: { id: userId, role: 'BORROWER' },
    action: 'PROFILE_SUBMITTED',
    subjectUserId: userId,
    details: { brePassed: bre.passed, failedRules: bre.failures.map((f) => f.rule), monthlySalary: input.monthlySalary, employmentMode: input.employmentMode },
  });

  if (!bre.passed) {
    throw ApiError.unprocessable('Sorry, you are not eligible for a loan right now', { failures: bre.failures }, 'BRE_REJECTED');
  }
  return getBorrowerState(userId);
}

/** Uploads a new salary slip or PAN card. Old files stay on disk: past loans still reference them. */
export async function saveDocument(userId: string, kind: DocumentKind, file: Express.Multer.File): Promise<BorrowerStateDTO> {
  const profile = await BorrowerProfile.findOne({ user: userId }).select('_id').lean();
  if (!profile) throw ApiError.conflict('Please add your personal details first', 'STEP_INCOMPLETE');
  await assertNoOpenLoan(userId);

  const fileId = await putFile(file);
  try {
    const doc = await storeDocument(userId, kind, file, fileId);
    await BorrowerProfile.updateOne({ user: userId }, { $set: { [PROFILE_FIELD[kind]]: doc._id } });
    await recordAudit({
      actor: { id: userId, role: 'BORROWER' },
      action: UPLOAD_ACTION[kind],
      subjectUserId: userId,
      details: { documentId: doc._id.toString(), fileName: doc.originalName, size: doc.size, replaced: true, label: DOCUMENT_LABEL[kind] },
    });
  } catch (err) {
    await deleteFile(fileId);
    throw err;
  }
  return getBorrowerState(userId);
}
