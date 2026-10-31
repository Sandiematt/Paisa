import {profileCompleteness} from '../src/features/profile/profileCompleteness';
import {
  groupMoneyInput,
  sanitizeMoneyInput,
} from '../src/features/profile/moneyInput';
import {transactionsInMonth} from '../src/lib/exportMonth';

const full = {
  monthlyIncome: '60000',
  monthlyBudget: '40000',
  monthlySavingsGoal: '5000',
};

describe('profileCompleteness', () => {
  it('is complete when every goal is set', () => {
    const result = profileCompleteness(full);
    expect(result).toEqual({
      done: 3,
      total: 3,
      ratio: 1,
      missing: [],
      next: null,
    });
  });

  it('reports the savings goal as the missing item', () => {
    const result = profileCompleteness({...full, monthlySavingsGoal: ''});
    expect(result.done).toBe(2);
    expect(result.ratio).toBe(2 / 3);
    expect(result.missing).toEqual(['savings']);
    expect(result.next).toBe('savings');
  });

  it('treats zero, blanks and junk as not set', () => {
    const result = profileCompleteness({
      monthlyIncome: '0',
      monthlyBudget: ' ',
      monthlySavingsGoal: 'abc',
    });
    expect(result.done).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.missing).toEqual(['income', 'budget', 'savings']);
    expect(result.next).toBe('income');
  });

  it('accepts grouped digits', () => {
    expect(
      profileCompleteness({...full, monthlyBudget: '1,20,000'}).missing,
    ).toEqual([]);
  });
});

describe('transactionsInMonth', () => {
  const rows = [
    {transactionDate: '2026-10-01', kind: 'regular'},
    {transactionDate: '2026-10-31', kind: 'regular'},
    {transactionDate: '2026-09-30', kind: 'regular'},
    {transactionDate: '2026-10-05', kind: 'opening_balance'},
    {transactionDate: '2026-10-06', kind: 'balance_adjustment'},
    {transactionDate: '2025-10-10', kind: 'regular'},
  ];

  it('keeps only real transactions from that calendar month', () => {
    const picked = transactionsInMonth(rows, new Date(2026, 9, 15));
    expect(picked.map(row => row.transactionDate)).toEqual([
      '2026-10-01',
      '2026-10-31',
    ]);
  });
});

describe('money input helpers', () => {
  it('strips non-digits for whole-number fields', () => {
    expect(sanitizeMoneyInput('1,20,000.50')).toBe('12000050');
  });

  it('allows one dot and two decimals when asked', () => {
    expect(sanitizeMoneyInput('12.345.6', true)).toBe('12.34');
    expect(sanitizeMoneyInput('1,234.5', true)).toBe('1234.5');
  });

  it('groups the whole part only', () => {
    expect(groupMoneyInput('1234567.89')).toBe('1,234,567.89');
    expect(groupMoneyInput('')).toBe('');
  });
});
