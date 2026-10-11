import { describe, expect, it } from 'vitest';
import { calculateLoan } from './loanMath';

describe('calculateLoan', () => {
  it('applies SI = P×R×T / (365×100) at 12% p.a.', () => {
    expect(calculateLoan(100_000, 180)).toEqual({
      principal: 100_000,
      interestRate: 12,
      tenureDays: 180,
      simpleInterest: 5_917.81,
      totalRepayment: 105_917.81,
    });
  });

  it('handles the minimum and maximum bounds', () => {
    expect(calculateLoan(50_000, 30).simpleInterest).toBe(493.15);
    expect(calculateLoan(500_000, 365)).toMatchObject({ simpleInterest: 60_000, totalRepayment: 560_000 });
  });

  it('rounds to the nearest paisa without float drift', () => {
    const quote = calculateLoan(123_000, 47);
    expect(quote.simpleInterest).toBe(1_900.6); // 1900.60273…
    expect(Number.isInteger(Math.round(quote.totalRepayment * 100))).toBe(true);
    expect(quote.totalRepayment).toBe(124_900.6);
  });
});
