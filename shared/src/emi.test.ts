import { describe, expect, it } from 'vitest';
import { allocatePayments, calculateEmi, calculateLoan, splitInstalments } from './loanMath';

describe('splitInstalments', () => {
  it('splits into equal parts and puts the leftover paise on the last one', () => {
    expect(splitInstalments(1000, 3)).toEqual([333, 333, 334]);
    expect(splitInstalments(1200, 12)).toEqual(Array(12).fill(100));
    expect(splitInstalments(500, 1)).toEqual([500]);
  });

  it('always adds up to exactly the total', () => {
    for (const [total, n] of [[12710137, 6], [10591781, 12], [5049315, 7]] as const) {
      expect(splitInstalments(total, n).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe('calculateEmi', () => {
  it('keeps the simple-interest total and only splits it (flat EMI)', () => {
    const emi = calculateEmi(120_000, 6);
    expect(emi.tenureDays).toBe(180);
    expect(emi.totalRepayment).toBe(calculateLoan(120_000, 180).totalRepayment); // 127,101.37
    expect(emi.totalRepayment).toBe(127_101.37);
    expect(emi.instalments).toEqual([21_183.56, 21_183.56, 21_183.56, 21_183.56, 21_183.56, 21_183.57]);
    expect(emi.emi).toBe(21_183.56);
  });

  it('12 months = 360 days, inside the 365-day limit', () => {
    expect(calculateEmi(500_000, 12).tenureDays).toBe(360);
  });
});

describe('allocatePayments', () => {
  const amounts = [100, 100, 101];

  it('fills the oldest instalment first', () => {
    expect(allocatePayments(amounts, 0)).toEqual({ paid: [0, 0, 0], nextIndex: 0 });
    expect(allocatePayments(amounts, 150)).toEqual({ paid: [100, 50, 0], nextIndex: 1 });
    expect(allocatePayments(amounts, 200)).toEqual({ paid: [100, 100, 0], nextIndex: 2 });
  });

  it('reports nothing left when fully paid', () => {
    expect(allocatePayments(amounts, 301)).toEqual({ paid: [100, 100, 101], nextIndex: -1 });
  });
});
