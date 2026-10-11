import type { Role } from '@lms/shared';
import { DocumentModel, Loan, type IDocument } from '../../models';
import { ApiError } from '../../utils/ApiError';
import { openFile } from '../../utils/fileStore';
import { recordAudit } from '../audit/audit.service';
import { visibleLoansFilter } from '../loans/visibility';

/** Roles that may open any borrower's documents (to verify identity and income before approving). */
const REVIEWER_ROLES: Role[] = ['ADMIN', 'SANCTION'];

/**
 * Returns a document the viewer is allowed to open, plus a stream of its bytes from GridFS.
 * Owners can always open their own files; reviewers can open anyone's, and every such view is
 * written to the audit log ("who reviewed the documents").
 */
export async function openDocument(
  documentId: string,
  viewer: { id: string; role: Role },
  ipAddress?: string,
): Promise<{ doc: IDocument; stream: ReturnType<typeof openFile> }> {
  const doc = await DocumentModel.findById(documentId).lean();
  if (!doc) throw ApiError.notFound('Document not found');

  const isOwner = doc.owner.toString() === viewer.id;
  if (!isOwner && !REVIEWER_ROLES.includes(viewer.role)) throw ApiError.forbidden();
  // A reviewer only sees documents attached to loans they can see (Admin: all).
  if (!isOwner && viewer.role !== 'ADMIN') {
    const onOwnLoan = await Loan.exists({ $and: [{ $or: [{ salarySlip: doc._id }, { panCard: doc._id }] }, visibleLoansFilter(viewer)] });
    if (!onOwnLoan) throw ApiError.notFound('Document not found');
  }

  if (!isOwner) {
    const loan = await Loan.findOne({ $or: [{ salarySlip: doc._id }, { panCard: doc._id }] }).sort({ createdAt: -1 }).select('_id').lean();
    await recordAudit({
      actor: viewer,
      action: 'DOCUMENT_VIEWED',
      loanId: loan?._id ?? null,
      subjectUserId: doc.owner,
      ipAddress,
      details: { documentId: doc._id.toString(), kind: doc.kind, fileName: doc.originalName },
    });
  }

  return { doc, stream: openFile(doc.fileId) };
}
