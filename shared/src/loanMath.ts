import { EMI_RULES, LOAN_RULES } from './constants';
import { toPaise, toRupees } from './money';

export interface LoanQuote {
  principal: number;
  interestRate: number;
  tenureDays: number;
  simpleInterest: number;
  totalRepayment: number;
}

/**
 * Simple interest in paise: SI = (P × R × T) / (365 × 100), rounded to the nearest paisa.
 * Integer maths on paise keeps the client preview and the server-stored value identical.
 */
export function simpleInterestPaise(principalPaise: number, ratePercent: number, tenureDays: number): number {
  return Math.round((principalPaise * ratePercent * tenureDays) / (365 * 100));
}

/** Quote for a loan, all amounts in rupees. Used by the live slider panel and by the server on apply. */
export function calculateLoan(principal: number, tenureDays: number, ratePercent: number = LOAN_RULES.INTEREST_RATE): LoanQuote {
  const principalPaise = toPaise(principal);
  const interestPaise = simpleInterestPaise(principalPaise, ratePercent, tenureDays);
  return {
    principal,
    interestRate: ratePercent,
    tenureDays,
    simpleInterest: toRupees(interestPaise),
    totalRepayment: toRupees(principalPaise + interestPaise),
  };
}

/**
 * Splits a total (paise) into `count` equal instalments; the last one absorbs the leftover paise,
 * so the parts always add up to exactly the total.
 */
export function splitInstalments(totalPaise: number, count: number): number[] {
  const base = Math.floor(totalPaise / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? totalPaise - base * (count - 1) : base));
}

export interface EmiQuote extends LoanQuote {
  months: number;
  /** Rupees per instalment (the last one may differ by a few paise). */
  emi: number;
  instalments: number[];
}

/** EMI quote: tenure = months x 30 days, same simple interest, total split into equal monthly EMIs. */
export function calculateEmi(principal: number, months: number, ratePercent: number = LOAN_RULES.INTEREST_RATE): EmiQuote {
  const quote = calculateLoan(principal, months * EMI_RULES.DAYS_PER_MONTH, ratePercent);
  const instalments = splitInstalments(toPaise(quote.totalRepayment), months).map(toRupees);
  return { ...quote, months, emi: instalments[0]!, instalments };
}

export interface InstalmentAllocation {
  /** Paise already covered for each instalment, filling the oldest first. */
  paid: number[];
  /** Index of the first instalment not fully paid, or -1 when everything is paid. */
  nextIndex: number;
}

/**
 * Payments always settle the oldest instalment first, so how much of each instalment is paid
 * is fully determined by the total paid so far. No per-instalment bookkeeping needed.
 */
export function allocatePayments(amountsPaise: number[], amountPaidPaise: number): InstalmentAllocation {
  let left = amountPaidPaise;
  const paid = amountsPaise.map((amount) => {
    const covered = Math.min(amount, Math.max(0, left));
    left -= covered;
    return covered;
  });
  return { paid, nextIndex: paid.findIndex((p, i) => p < amountsPaise[i]!) };
}
