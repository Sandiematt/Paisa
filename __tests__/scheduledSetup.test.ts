import {
  answerBillsPaidThisCycle,
  billsPaidAnswer,
  billsStartingNextCycle,
  entriesStartingNextCycle,
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

describe('bills that start next budget month', () => {
  // Signed up on 29 October, payday on the 1st: the month runs 1–31 October.
  const signup = {
    ...base,
    payday: 1,
    bills: [
      {id: 'rent', label: 'Rent', slug: 'housing', amount: '15000', day: 1},
      {id: 'gym', label: 'Gym', slug: 'health', amount: '1500', day: 30},
    ],
  };

  it('lists only the bills with no due date left this month', () => {
    const later = billsStartingNextCycle(signup, new Date(2026, 9, 29));
    expect(later.map(entry => entry.ref)).toEqual(['onboarding:bill:rent']);
  });

  it('marks them paid for this month when the user says so', () => {
    const bills = (paid: boolean | undefined) =>
      scheduleFromDraft({...signup, billsPaidThisCycle: paid}, '2026-10-29')
        .filter(entry => entry.type === 'expense')
        .map(entry => [entry.ref, entry.paidSince]);
    expect(bills(true)).toEqual([
      ['onboarding:bill:rent', '2026-10-29'],
      ['onboarding:bill:gym', undefined],
    ]);
    expect(bills(false)).toEqual([
      ['onboarding:bill:rent', undefined],
      ['onboarding:bill:gym', undefined],
    ]);
  });
});

describe('answering for an account that already exists', () => {
  // What onboarding left waiting on 29 October, before this question existed.
  const waiting = [
    {ref: 'onboarding:salary', type: 'income' as const, amount: 25000, slug: 'salary', description: 'Salary', date: '2026-11-01'},
    {ref: 'onboarding:bill:rent', type: 'expense' as const, amount: 15000, slug: 'housing', description: 'Rent', date: '2026-11-01'},
    {ref: 'onboarding:bill:gym', type: 'expense' as const, amount: 1500, slug: 'health', description: 'Gym', date: '2026-10-31'},
  ];
  const today = new Date(2026, 9, 30);

  it('is unanswered until the user picks, and asks only about bills starting next month', () => {
    const later = entriesStartingNextCycle(waiting, 1, today);
    expect(later.map(entry => entry.ref)).toEqual(['onboarding:bill:rent']);
    expect(billsPaidAnswer(later)).toBeUndefined();
  });

  it('marks those bills paid this month, or not, and reads the answer back', () => {
    const paid = answerBillsPaidThisCycle(waiting, true, 1, today);
    expect(paid.map(entry => entry.paidSince)).toEqual([undefined, '2026-10-30', undefined]);
    expect(billsPaidAnswer(entriesStartingNextCycle(paid, 1, today))).toBe(true);

    const unpaid = answerBillsPaidThisCycle(paid, false, 1, today);
    expect(unpaid.map(entry => entry.paidSince)).toEqual([undefined, undefined, undefined]);
    expect(billsPaidAnswer(entriesStartingNextCycle(unpaid, 1, today))).toBe(false);
  });

  it('remembers a "no" from onboarding too', () => {
    const entries = scheduleFromDraft(
      {
        ...base,
        payday: 1,
        billsPaidThisCycle: false,
        bills: [{id: 'rent', label: 'Rent', slug: 'housing', amount: '15000', day: 1}],
      },
      '2026-10-29',
    );
    expect(billsPaidAnswer(entriesStartingNextCycle(entries, 1, new Date(2026, 9, 29)))).toBe(false);
  });
});
