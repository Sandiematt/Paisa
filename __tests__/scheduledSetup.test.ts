import {
  nextMonthlyDate,
  scheduleFromDraft,
  scheduledFromUser,
} from '../src/lib/scheduledSetup';
import {OnboardingDraft} from '../src/features/onboarding/types';

jest.mock('../src/lib/supabase/client', () => ({supabase: {}}));

const base: OnboardingDraft = {
  name: 'Ananya',
  email: 'a@b.co',
  currency: 'INR',
  startingBalance: '5000',
  monthlyIncome: '60000',
  goal: null,
  categoryIds: [],
  monthlyBudget: '',
  monthlySavingsGoal: '',
};

describe('nextMonthlyDate', () => {
  it('picks this month when the day is still ahead', () => {
    expect(nextMonthlyDate(28, '2026-10-29')).toBe('2026-11-28');
    expect(nextMonthlyDate(30, '2026-10-29')).toBe('2026-10-30');
  });

  it('skips today, since the starting balance already counts it', () => {
    expect(nextMonthlyDate(29, '2026-10-29')).toBe('2026-11-29');
  });

  it('clamps to the last day of short months', () => {
    expect(nextMonthlyDate(31, '2026-02-03')).toBe('2026-02-28');
    expect(nextMonthlyDate(31, '2026-11-30')).toBe('2026-12-31');
  });

  it('rolls over the year', () => {
    expect(nextMonthlyDate(5, '2026-12-20')).toBe('2027-01-05');
  });
});

describe('scheduleFromDraft', () => {
  it('schedules salary on payday and every bill with an amount', () => {
    const entries = scheduleFromDraft(
      {
        ...base,
        payday: 1,
        logSalary: true,
        bills: [
          {id: 'rent', label: 'Rent', slug: 'housing', amount: '18000', day: 5},
          {id: 'gym', label: 'Gym', slug: 'health', amount: '', day: 1},
        ],
      },
      '2026-10-29',
    );
    expect(entries).toEqual([
      expect.objectContaining({
        ref: 'onboarding:salary',
        type: 'income',
        amount: 60000,
        slug: 'salary',
        date: '2026-11-01',
      }),
      expect.objectContaining({
        ref: 'onboarding:bill:rent',
        type: 'expense',
        amount: 18000,
        slug: 'housing',
        date: '2026-11-05',
      }),
    ]);
  });

  it('skips salary without a payday, income, or the toggle', () => {
    expect(scheduleFromDraft({...base, payday: null, logSalary: true})).toEqual([]);
    expect(scheduleFromDraft({...base, payday: 1, logSalary: false})).toEqual([]);
    expect(
      scheduleFromDraft({...base, monthlyIncome: '', payday: 1, logSalary: true}),
    ).toEqual([]);
  });

  it('round-trips through user metadata and drops malformed entries', () => {
    const entries = scheduleFromDraft({...base, payday: 1, logSalary: true});
    const user = {
      user_metadata: {scheduledSetup: [...entries, {ref: 'x'}, 'junk']},
    } as never;
    expect(scheduledFromUser(user)).toEqual(entries);
  });
});
