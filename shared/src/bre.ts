import { BRE_RULES, PAN_REGEX, type EmploymentMode } from './constants';
import { toBusinessDate } from './money';

export type BreRule = 'AGE' | 'SALARY' | 'PAN' | 'EMPLOYMENT';

export interface BreFailure {
  rule: BreRule;
  message: string;
}

export interface BreInput {
  dob: Date | string;
  monthlySalary: number;
  pan: string;
  employmentMode: EmploymentMode;
}

export interface BreResult {
  passed: boolean;
  failures: BreFailure[];
}

/**
 * Completed years between dob and `today`; one year less if this year's birthday hasn't arrived.
 * Uses UTC parts because dates travel as `YYYY-MM-DD` (parsed as UTC midnight), so the result
 * doesn't depend on the server's timezone.
 */
export function calculateAge(dob: Date | string, today: Date = new Date(toBusinessDate())): number {
  const birth = new Date(dob);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export const normalizePan = (pan: string): string => pan.trim().toUpperCase();

/**
 * Business Rule Engine. Pure function shared by client (instant feedback) and server (authoritative).
 * Returns every failed rule, not just the first, so the user can fix everything in one go.
 */
export function runBre(input: BreInput, today: Date = new Date(toBusinessDate())): BreResult {
  const failures: BreFailure[] = [];

  const age = calculateAge(input.dob, today);
  if (Number.isNaN(age) || age < BRE_RULES.MIN_AGE || age > BRE_RULES.MAX_AGE) {
    failures.push({ rule: 'AGE', message: `Your age must be between ${BRE_RULES.MIN_AGE} and ${BRE_RULES.MAX_AGE} years.` });
  }

  if (!(input.monthlySalary >= BRE_RULES.MIN_MONTHLY_SALARY)) {
    failures.push({ rule: 'SALARY', message: 'Your monthly salary must be at least ₹25,000.' });
  }

  if (!PAN_REGEX.test(normalizePan(input.pan))) {
    failures.push({ rule: 'PAN', message: 'PAN number is not valid. It looks like ABCDE1234F.' });
  }

  if (input.employmentMode === 'UNEMPLOYED') {
    failures.push({ rule: 'EMPLOYMENT', message: 'You need to be salaried or self-employed to get a loan.' });
  }

  return { passed: failures.length === 0, failures };
}
