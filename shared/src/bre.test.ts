import { describe, expect, it } from 'vitest';
import { calculateAge, runBre, type BreInput } from './bre';

const TODAY = new Date('2026-06-15T00:00:00Z');
const valid: BreInput = { dob: '1995-01-10', monthlySalary: 50_000, pan: 'ABCPE1234F', employmentMode: 'SALARIED' };
const rules = (input: Partial<BreInput>) => runBre({ ...valid, ...input }, TODAY).failures.map((f) => f.rule);

describe('calculateAge', () => {
  it('counts completed years only', () => {
    expect(calculateAge('2003-06-15', TODAY)).toBe(23); // birthday today
    expect(calculateAge('2003-06-16', TODAY)).toBe(22); // birthday tomorrow
    expect(calculateAge('2003-07-01', TODAY)).toBe(22); // birthday next month
  });
});

describe('runBre', () => {
  it('passes a valid applicant', () => {
    expect(runBre(valid, TODAY)).toEqual({ passed: true, failures: [] });
  });

  it('enforces age 23–50 inclusive', () => {
    expect(rules({ dob: '2003-06-15' })).toEqual([]); // exactly 23
    expect(rules({ dob: '2003-06-16' })).toEqual(['AGE']); // 22, one day short
    expect(rules({ dob: '1975-06-16' })).toEqual([]); // 50, turns 51 tomorrow
    expect(rules({ dob: '1975-06-15' })).toEqual(['AGE']); // turned 51 today
  });

  it('requires salary of at least ₹25,000', () => {
    expect(rules({ monthlySalary: 25_000 })).toEqual([]);
    expect(rules({ monthlySalary: 24_999.99 })).toEqual(['SALARY']);
  });

  it('validates PAN format including holder type', () => {
    expect(rules({ pan: 'abcpe1234f' })).toEqual([]); // normalised to uppercase
    expect(rules({ pan: ' ABCPE1234F ' })).toEqual([]);
    expect(rules({ pan: 'ABCDE1234F' })).toEqual(['PAN']); // D is not a valid holder type
    expect(rules({ pan: 'ABCP1234F' })).toEqual(['PAN']);
    expect(rules({ pan: 'ABCPE12345' })).toEqual(['PAN']);
    expect(rules({ pan: '' })).toEqual(['PAN']);
  });

  it('rejects unemployed applicants', () => {
    expect(rules({ employmentMode: 'SELF_EMPLOYED' })).toEqual([]);
    expect(rules({ employmentMode: 'UNEMPLOYED' })).toEqual(['EMPLOYMENT']);
  });

  it('reports every failed rule at once', () => {
    expect(rules({ dob: '2010-01-01', monthlySalary: 10_000, pan: 'BAD', employmentMode: 'UNEMPLOYED' })).toEqual([
      'AGE',
      'SALARY',
      'PAN',
      'EMPLOYMENT',
    ]);
  });
});
