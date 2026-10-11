import { LOAN_STATUSES, toBusinessDate, toRupees, type LoanStatus, type StatsDTO } from '@lms/shared';
import { Loan } from '../../models';
import { countLeads } from './sales.service';

/** Portfolio overview from a single $facet aggregation instead of one query per number. */
export async function getPortfolioStats(): Promise<StatsDTO> {
  const [[facets], leads, overdueLoans] = await Promise.all([
    Loan.aggregate<{
      byStatus: { _id: LoanStatus; n: number }[];
      money: { disbursed: number; collected: number; outstanding: number }[];
    }>([
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
          money: [
            { $match: { status: { $in: ['DISBURSED', 'CLOSED'] } } },
            {
              $group: {
                _id: null,
                disbursed: { $sum: '$principal' },
                collected: { $sum: '$amountPaid' },
                outstanding: { $sum: { $subtract: ['$totalRepayment', '$amountPaid'] } },
              },
            },
          ],
        },
      },
    ]),
    countLeads(),
    // Uses the { status, nextDueDate } index.
    Loan.countDocuments({ status: 'DISBURSED', nextDueDate: { $lt: new Date(toBusinessDate()) } }),
  ]);

  const loansByStatus = Object.fromEntries(LOAN_STATUSES.map((s) => [s, 0])) as Record<LoanStatus, number>;
  for (const { _id, n } of facets?.byStatus ?? []) loansByStatus[_id] = n;
  const money = facets?.money[0];

  return {
    loansByStatus,
    totalDisbursed: toRupees(money?.disbursed ?? 0),
    totalCollected: toRupees(money?.collected ?? 0),
    totalOutstanding: toRupees(money?.outstanding ?? 0),
    leads,
    overdueLoans,
  };
}
