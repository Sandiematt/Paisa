import {snapshotForBudget} from '../src/features/autotrack/dailyAllowance';
import {
  NO_BUDGET_FLOW,
  migrateLegacyBudget,
  pendingFlowFor,
  startBudgetFlow,
  startNewAccountFlow,
} from '../src/lib/budgetFlow';
import {budgetForCycle} from '../src/lib/budgetInputs';
import {
  BudgetFields,
  dayToDayBudget,
  monthlyBudgetOf,
  monthlyTotalOf,
  withMonthlyTotal,
  withSavingsGoal,
} from '../src/lib/budgetPlan';
import {TransactionRow} from '../src/lib/transactionsStore';

jest.mock('../src/lib/supabase/client', () => ({supabase: {}}));

function tx(
  partial: Pick<TransactionRow, 'id' | 'type' | 'amount' | 'transactionDate'> & Partial<TransactionRow>,
): TransactionRow {
  return {
    userId: 'user-1',
    categoryId: null,
    description: null,
    merchant: null,
    paymentMethod: null,
    notes: null,
    kind: 'regular',
    isRecurring: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  };
}

// Sample legacy data, as accounts have it before the update: a profile from
// the old onboarding, rent and a mess as monthly series, salary repeating,
// and spending already logged this month.
const LEGACY_LEDGER: TransactionRow[] = [
  tx({id: 'opening', type: 'income', amount: 40000, kind: 'opening_balance', transactionDate: '2026-09-01'}),
  tx({id: 'salary', type: 'income', amount: 25000, transactionDate: '2026-09-01', isRecurring: true, description: 'Salary'}),
  tx({id: 'rent', type: 'expense', amount: 15000, transactionDate: '2026-09-05', isRecurring: true, description: 'Rent'}),
  tx({id: 'rent-oct', type: 'expense', amount: 15000, transactionDate: '2026-10-05', isRecurring: true, externalRef: 'recurring:rent:2026-10'}),
  tx({id: 'mess', type: 'expense', amount: 5000, transactionDate: '2026-09-01', isRecurring: true, description: 'Mess'}),
  tx({id: 'mess-oct', type: 'expense', amount: 5000, transactionDate: '2026-10-01', isRecurring: true, externalRef: 'recurring:mess:2026-10'}),
  tx({id: 'lunch', type: 'expense', amount: 450, transactionDate: '2026-10-03'}),
  tx({id: 'cab', type: 'expense', amount: 300, transactionDate: '2026-10-09'}),
];
const BILLS = 15000 + 5000;
const TODAY = '2026-10-15';

const automatic: BudgetFields = {monthlyIncome: '25000', monthlyBudget: '', monthlySavingsGoal: '2000'};
// The old Budget step stored the day-to-day budget typed (3,500) plus bills.
const custom: BudgetFields = {
  monthlyIncome: '25000',
  monthlyBudget: '23500',
  monthlySavingsGoal: '2000',
  budgetCustom: true,
};

function spendableOf(fields: BudgetFields, rows = LEGACY_LEDGER, today = TODAY) {
  return budgetForCycle(
    {
      total: monthlyTotalOf(fields),
      savingsGoal: Number(fields.monthlySavingsGoal) || 0,
      transactions: rows,
      flow: migrateLegacyBudget(null, today),
    },
    today,
  ).state;
}

describe('moving an account to the rolling budget (handbook 5.3)', () => {
  it.each([
    ['a calculated budget', automatic],
    ['a budget set by hand', custom],
  ])('keeps what %s leaves to spend exactly as it was', (_name, fields) => {
    const before = dayToDayBudget(monthlyBudgetOf(fields), BILLS);
    expect(spendableOf(fields).spendable).toBe(before);
  });

  it('reads the stored budget as a total with the goal added back, changing no stored value', () => {
    expect(monthlyTotalOf(automatic)).toBe(25000);
    expect(monthlyTotalOf(custom)).toBe(25500);
    expect(custom.monthlyBudget).toBe('23500');
  });

  it('runs once: a moved account is left alone', () => {
    const moved = migrateLegacyBudget(null, TODAY);
    expect(moved).toEqual({
      version: 1,
      trackingStart: '2026-10-01',
      alreadySpent: 0,
      startedOn: TODAY,
      source: 'migrated',
    });
    expect(migrateLegacyBudget(moved, '2026-11-20')).toBeNull();
    expect(migrateLegacyBudget(NO_BUDGET_FLOW, TODAY)).not.toBeNull();
  });

  it('counts what was already logged this month, and bills apart from it', () => {
    const state = spendableOf(automatic);
    // Lunch and the cab are spending; rent and the mess are bills, not counted twice.
    expect(state.spentBeforeToday).toBe(750);
    expect(state.fixed).toBe(BILLS);
    expect(state.partialFrom).toBeNull();
    // 25,000 - 20,000 of bills - 2,000 goal = 3,000; (3,000 - 750) / 17 days left
    expect(state.spendable).toBe(3000);
    expect(state.dailyLimit).toBe(132.35);
  });

  it('can start now in the last days, counting the whole month already logged', () => {
    const moved = migrateLegacyBudget(null, '2026-10-30', null, true);
    expect(moved?.trackingStart).toBe('2026-10-01');
    const state = budgetForCycle(
      {total: 25000, savingsGoal: 2000, transactions: LEGACY_LEDGER, flow: moved},
      '2026-10-30',
    ).state;
    expect(state.kind).toBe('active');
    expect(state.remainingDays).toBe(2);
  });

  it('starts on the 1st for an account that updates in the last days of the month', () => {
    const moved = migrateLegacyBudget(null, '2026-10-30');
    expect(moved?.trackingStart).toBe('2026-11-01');
    const state = budgetForCycle(
      {total: 25000, savingsGoal: 2000, transactions: LEGACY_LEDGER, flow: moved},
      '2026-10-30',
    ).state;
    expect(state.kind).toBe('waiting');
    expect(state.startsOn).toBe('2026-11-01');
  });

  it('keeps the limits off until legacy data that does not add up is fixed', () => {
    const tight: BudgetFields = {monthlyIncome: '', monthlyBudget: '18000', monthlySavingsGoal: '4000', budgetCustom: true};
    const state = spendableOf(tight);
    expect(state.kind).toBe('invalid');
    const snapshot = snapshotForBudget(
      {total: monthlyTotalOf(tight), savingsGoal: 4000, transactions: LEGACY_LEDGER, flow: migrateLegacyBudget(null, TODAY)},
      TODAY,
    );
    expect(snapshot.monthlyBudget).toBe(0);
  });

  it('keeps every value when the confirmation is skipped', () => {
    // "Not now" only starts the budget; the profile is not touched (A2: the goal stays).
    expect(spendableOf(automatic).savingsGoal).toBe(2000);
  });
});

describe('editing the budget as a total', () => {
  it('stores the total less the goal, so the goal is always set aside', () => {
    const next = withMonthlyTotal(automatic, '30000');
    expect(next).toMatchObject({budgetCustom: true, monthlyBudget: '28000'});
    expect(monthlyTotalOf(next)).toBe(30000);
  });

  it('typing the income keeps the budget calculated', () => {
    expect(withMonthlyTotal(custom, '25000')).toMatchObject({budgetCustom: false});
  });

  it('a bigger goal keeps the total and leaves less to spend', () => {
    const next = withSavingsGoal(custom, '3000');
    expect(monthlyTotalOf(next)).toBe(25500);
    expect(next.monthlyBudget).toBe('22500');
  });
});

describe('new accounts', () => {
  it('start from today mid-month, with what they said they spent', () => {
    expect(startBudgetFlow('new', '2026-10-15', null, 600)).toMatchObject({
      trackingStart: '2026-10-15',
      alreadySpent: 600,
    });
  });

  it('start the whole month on the 1st, and wait in the last days', () => {
    expect(startBudgetFlow('new', '2026-11-01').trackingStart).toBe('2026-11-01');
    expect(startBudgetFlow('new', '2026-10-29', null, 500)).toMatchObject({
      trackingStart: '2026-11-01',
      alreadySpent: 0,
    });
  });

  it('in the last days, can start now over the days left instead of waiting', () => {
    expect(startBudgetFlow('new', '2026-10-29', null, 500, true)).toMatchObject({
      trackingStart: '2026-10-29',
      alreadySpent: 500,
    });
    const state = budgetForCycle(
      {total: 9000, savingsGoal: 2000, transactions: [], flow: startBudgetFlow('new', '2026-10-29', null, 500, true)},
      '2026-10-29',
    ).state;
    expect(state.kind).toBe('active');
    // (7,000 - 500) over the 3 days left, today included.
    expect(state.dailyLimit).toBe(2166.66);
    expect(state.partialFrom).toBe('2026-10-29');
  });

  it('carries the start-now choice through to the first open, in the same month only', () => {
    const pending = pendingFlowFor('', '2026-10-30', null, true);
    expect(pending).toEqual({cycleStart: '2026-10-01', alreadySpent: 0, startNow: true});
    expect(startNewAccountFlow(pending, '2026-10-30').trackingStart).toBe('2026-10-30');
    // Opened first in November: just a normal month.
    expect(startNewAccountFlow(pending, '2026-11-01').trackingStart).toBe('2026-11-01');
  });

  it('use the onboarding answer only in the month it was given', () => {
    const pending = {cycleStart: '2026-10-01', alreadySpent: 800};
    expect(startNewAccountFlow(pending, '2026-10-16').alreadySpent).toBe(800);
    // The email was confirmed in November: October's answer no longer applies.
    expect(startNewAccountFlow(pending, '2026-11-03')).toMatchObject({
      trackingStart: '2026-11-03',
      alreadySpent: 0,
    });
  });
});
