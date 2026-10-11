import { Types, type PipelineStage } from 'mongoose';
import type { Paginated, Role, UserDetailsDTO, UserListQuery, UserSummaryDTO } from '@lms/shared';
import { AuditLog, BorrowerProfile, DocumentModel, Loan, User } from '../../models';
import { ApiError } from '../../utils/ApiError';
import { escapeRegex } from '../../utils/http';
import { LOAN_POPULATE, toDocumentDTO, toLoanDTO, toProfileDTO, type LoanWithRefs } from '../mappers';

interface UserRow {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  actionCount: number;
  loanCount: number;
  lastActiveAt: Date | null;
}

/**
 * Per-user stats, computed only for the page being returned ($lookup runs after $skip/$limit):
 *  - actionCount / lastActiveAt from the audit log (index: actor + createdAt)
 *  - loanCount: open loans assigned (executives) or loans applied for (borrowers)
 */
const statsStages: PipelineStage.FacetPipelineStage[] = [
  {
    $lookup: {
      from: AuditLog.collection.name,
      localField: '_id',
      foreignField: 'actor', // uses the { actor, createdAt } index
      pipeline: [{ $group: { _id: null, n: { $sum: 1 }, last: { $max: '$createdAt' } } }],
      as: 'activity',
    },
  },
  {
    $lookup: {
      from: Loan.collection.name,
      let: { uid: '$_id', role: '$role' },
      pipeline: [
        {
          $match: {
            $expr: {
              $cond: [
                { $eq: ['$$role', 'BORROWER'] },
                { $eq: ['$borrower', '$$uid'] },
                { $and: [{ $eq: ['$assignee', '$$uid'] }, { $eq: ['$isOpen', true] }] },
              ],
            },
          },
        },
        { $count: 'n' },
      ],
      as: 'loans',
    },
  },
  {
    $project: {
      name: 1,
      email: 1,
      role: 1,
      isActive: 1,
      createdAt: 1,
      actionCount: { $ifNull: [{ $first: '$activity.n' }, 0] },
      lastActiveAt: { $ifNull: [{ $first: '$activity.last' }, null] },
      loanCount: { $ifNull: [{ $first: '$loans.n' }, 0] },
    },
  },
];

const toSummary = (u: UserRow): UserSummaryDTO => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  createdAt: u.createdAt.toISOString(),
  actionCount: u.actionCount,
  loanCount: u.loanCount,
  lastActiveAt: u.lastActiveAt ? u.lastActiveAt.toISOString() : null,
});

export async function listUsers(query: UserListQuery): Promise<Paginated<UserSummaryDTO>> {
  const match: Record<string, unknown> = {};
  if (query.role) match.role = query.role;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    match.$or = [{ name: rx }, { email: rx }];
  }
  const { page, limit } = query;

  const [result] = await User.aggregate<{ items: UserRow[]; total: { n: number }[] }>([
    { $match: match },
    { $sort: { role: 1, createdAt: 1 } },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }, ...statsStages], total: [{ $count: 'n' }] } },
  ]);

  const total = result?.total[0]?.n ?? 0;
  return { items: (result?.items ?? []).map(toSummary), page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getUserSummary(userId: string): Promise<UserSummaryDTO> {
  const [row] = await User.aggregate<UserRow>([{ $match: { _id: new Types.ObjectId(userId) } }, ...(statsStages as PipelineStage[])]);
  if (!row) throw ApiError.notFound('User not found');
  return toSummary(row);
}

/**
 * Full picture of one user for the admin side panel, fetched in parallel:
 * summary stats, profile + eligibility, every uploaded document, and related loans.
 */
export async function getUserDetails(userId: string): Promise<UserDetailsDTO> {
  const user = await getUserSummary(userId);
  const loanFilter = user.role === 'BORROWER' ? { borrower: userId } : { assignee: userId, isOpen: true };

  const [profile, documents, loans] = await Promise.all([
    user.role === 'BORROWER' ? BorrowerProfile.findOne({ user: userId }).populate(['salarySlip', 'panCard']).lean() : null,
    DocumentModel.find({ owner: userId }).sort({ createdAt: -1 }).lean(),
    Loan.find(loanFilter).sort({ createdAt: -1 }).limit(50).populate(LOAN_POPULATE).lean<LoanWithRefs[]>(),
  ]);

  const currentIds = new Set(
    [profile?.salarySlip, profile?.panCard].filter(Boolean).map((d) => String((d as unknown as { _id: unknown })._id)),
  );
  return {
    user,
    profile: profile ? toProfileDTO(profile as never) : null,
    documents: documents.map((d) => ({ ...toDocumentDTO(d)!, isCurrent: currentIds.has(d._id.toString()) })),
    loans: loans.map((l) => toLoanDTO(l, 'ADMIN')),
  };
}
