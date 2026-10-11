import type { PipelineStage } from 'mongoose';
import { toRupees, type LeadDTO, type LeadStage, type Paginated } from '@lms/shared';
import { Loan, User } from '../../models';
import { escapeRegex } from '../../utils/http';

export interface LeadQuery {
  page: number;
  limit: number;
  search?: string;
  stage?: LeadStage;
}

interface LeadRow {
  _id: { toString(): string };
  name: string;
  email: string;
  createdAt: Date;
  stage: LeadStage;
  profile?: {
    fullName: string;
    monthlySalary: number;
    employmentMode: LeadDTO['employmentMode'];
    bre: { failures: NonNullable<LeadDTO['breFailures']> };
  };
}

/**
 * Leads = borrowers who registered but have never applied. One aggregation pipeline:
 * match borrowers -> anti-join loans (index on loans.borrower, $limit 1) -> join profile -> derive stage -> paginate.
 */
function leadsPipeline(query: Omit<LeadQuery, 'page' | 'limit'>): PipelineStage[] {
  const match: Record<string, unknown> = { role: 'BORROWER', isActive: true };
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    match.$or = [{ name: rx }, { email: rx }];
  }

  return [
    { $match: match },
    { $lookup: { from: Loan.collection.name, localField: '_id', foreignField: 'borrower', pipeline: [{ $limit: 1 }, { $project: { _id: 1 } }], as: 'loans' } },
    { $match: { loans: { $size: 0 } } },
    {
      $lookup: {
        from: 'borrowerprofiles',
        localField: '_id',
        foreignField: 'user',
        pipeline: [{ $project: { fullName: 1, monthlySalary: 1, employmentMode: 1, bre: 1, salarySlip: 1, panCard: 1 } }],
        as: 'profile',
      },
    },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        stage: {
          $switch: {
            branches: [
              { case: { $eq: [{ $ifNull: ['$profile', null] }, null] }, then: 'REGISTERED' },
              { case: { $eq: ['$profile.bre.passed', false] }, then: 'PROFILE_REJECTED' },
              {
                case: {
                  $and: [
                    { $ne: [{ $ifNull: ['$profile.salarySlip', null] }, null] },
                    { $ne: [{ $ifNull: ['$profile.panCard', null] }, null] },
                  ],
                },
                then: 'SLIP_UPLOADED', // eligible + both documents: ready to apply
              },
            ],
            default: 'PROFILE_COMPLETED',
          },
        },
      },
    },
    ...(query.stage ? [{ $match: { stage: query.stage } }] : []),
  ];
}

export async function listLeads(query: LeadQuery): Promise<Paginated<LeadDTO>> {
  const { page, limit } = query;
  const [result] = await User.aggregate<{ items: LeadRow[]; total: { n: number }[] }>([
    ...leadsPipeline(query),
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { name: 1, email: 1, createdAt: 1, stage: 1, profile: 1 } }],
        total: [{ $count: 'n' }],
      },
    },
  ]);

  const total = result?.total[0]?.n ?? 0;
  const items: LeadDTO[] = (result?.items ?? []).map((row) => ({
    id: row._id.toString(),
    name: row.name,
    email: row.email,
    registeredAt: row.createdAt.toISOString(),
    stage: row.stage,
    fullName: row.profile?.fullName,
    monthlySalary: row.profile ? toRupees(row.profile.monthlySalary) : undefined,
    employmentMode: row.profile?.employmentMode,
    breFailures: row.stage === 'PROFILE_REJECTED' ? row.profile?.bre.failures : undefined,
  }));

  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function countLeads(): Promise<number> {
  const [row] = await User.aggregate<{ n: number }>([...leadsPipeline({}), { $count: 'n' }]);
  return row?.n ?? 0;
}
