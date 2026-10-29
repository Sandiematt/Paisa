import {
  budgetAllocation,
  buildBudgetSnapshot,
  dailyAllowance,
  unsyncedSpendByDate,
} from '../src/features/autotrack/dailyAllowance';
import {monthlySpentFor} from '../src/features/home/homeReport';
import {
  BudgetSnapshot,
  DailyAllowance,
  DetectedTxn,
} from '../src/lib/autotrack/types';
import {TransactionRow} from '../src/lib/transactionsStore';
import vectorFile from './fixtures/dailyAllowanceVectors.json';

const vectors = vectorFile.vectors as unknown as {
  name: string;
  today: string;
  snapshot: BudgetSnapshot;
  expected: DailyAllowance | null;
}[];

function tx(
  partial: Pick<TransactionRow, 'id' | 'type' | 'amount' | 'transactionDate'> &
    Partial<TransactionRow>,
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
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

function detection(partial: Partial<DetectedTxn>): DetectedTxn {
  return {
    id: 1,
    sourceApp: 'com.phonepe.app',
    amount: '100.00',
    status: 'SUCCESS',
    direction: 'DEBIT',
    merchant: null,
    upiRef: null,
    detectedAtMillis: new Date(2026, 9, 27, 12).getTime(),
    updatedAtMillis: 0,
    flag: null,
    flagReason: null,
    possibleDuplicateOfId: null,
    note: null,
    synced: false,
    dirty: true,
    remoteId: null,
    syncedAtMillis: null,
    ...partial,
  };
}

describe('dailyAllowance shared vectors', () => {
  it.each(vectors)('$name', vector => {
    expect(dailyAllowance(vector.snapshot, vector.today)).toEqual(
      vector.expected,
    );
  });

  it('accepts a Date as today, at any time of day', () => {
    const vector = vectors[0];
    expect(
      dailyAllowance(vector.snapshot, new Date(2026, 9, 27, 23, 59)),
    ).toEqual(vector.expected);
  });
});

describe('dailyAllowance', () => {
  const snapshot: BudgetSnapshot = {
    monthKey: '2026-10',
    monthlyBudget: 31000,
    spendByDate: {'2026-10-05': 20000, '2026-10-26': 1500, '2026-10-27': 200},
    dataAsOfMillis: 0,
  };

  it('counts extra spend on top of the snapshot', () => {
    const result = dailyAllowance(snapshot, '2026-10-27', {
      '2026-10-27': 300,
      '2026-10-26': 100,
    });
    expect(result?.spentToday).toBe(500);
    expect(result?.spentWeekBeforeToday).toBe(1600);
  });

  it('ignores spend outside the month and after today', () => {
    const base = dailyAllowance(snapshot, '2026-10-27');
    const result = dailyAllowance(snapshot, '2026-10-27', {
      '2026-09-30': 9999,
      '2026-11-01': 9999,
      '2026-10-30': 9999,
    });
    expect(result).toEqual(base);
  });

  it('uses extra spend even when the snapshot is for another month', () => {
    const result = dailyAllowance(
      {
        monthKey: '2026-09',
        monthlyBudget: 31000,
        spendByDate: {},
        dataAsOfMillis: 0,
      },
      '2026-10-27',
      {'2026-10-27': 400},
    );
    expect(result?.spentToday).toBe(400);
    // Oct 26-31 at 1,000 a day; the unspent month does not land in this week.
    expect(result?.weekBudget).toBe(6000);
  });

  it('has no allowance for a missing or invalid budget', () => {
    expect(
      dailyAllowance({...snapshot, monthlyBudget: -5}, '2026-10-27'),
    ).toBe(null);
    expect(
      dailyAllowance({...snapshot, monthlyBudget: Number.NaN}, '2026-10-27'),
    ).toBe(null);
  });

  it('clips a week that straddles the month end', () => {
    // Thu 29 Oct 2026: Monday is 26 Oct, Sunday 1 Nov is outside the month.
    const result = dailyAllowance(
      {
        monthKey: '2026-10',
        monthlyBudget: 3100,
        spendByDate: {},
        dataAsOfMillis: 0,
      },
      '2026-10-29',
    );
    expect(result?.weekStart).toBe('2026-10-26');
    expect(result?.weekEnd).toBe('2026-10-31');
    expect(result?.daysLeftInWeek).toBe(3);
    // 3,100 over 31 days is 100 a day, 600 for the 6 days of the week.
    expect(result?.weekBudget).toBe(600);
    expect(result?.dailyLimit).toBe(100);
  });

  it('never reports a negative limit and avoids negative zero', () => {
    const result = dailyAllowance(
      {
        monthKey: '2026-10',
        monthlyBudget: 1000,
        spendByDate: {'2026-10-26': 5000},
        dataAsOfMillis: 0,
      },
      '2026-10-27',
    );
    expect(result?.dailyLimit).toBe(0);
    expect(Object.is(result?.dailyLimit, 0)).toBe(true);
    expect(result?.remainingToday).toBe(0);
    // The week's share is 6 * 1,000 / 31 = 193.55, and 5,000 went on Monday.
    expect(result?.remainingWeek).toBe(-4806.45);
  });
});

describe('budgetAllocation', () => {
  it('divides the month into weeks, then a week into seven days', () => {
    const october = budgetAllocation(1000, new Date(2026, 9, 28));
    expect(october.weeksInMonth).toBeCloseTo(31 / 7, 10);
    expect(october.weeklyBudget).toBeCloseTo(225.806, 3);
    expect(october.dailyBudget).toBeCloseTo(32.258, 3);
    // Every day of the month at the daily budget adds back up to the month.
    expect(october.dailyBudget * 31).toBeCloseTo(1000, 6);

    const february = budgetAllocation(2800, new Date(2026, 1, 10));
    expect(february.weeksInMonth).toBe(4);
    expect(february.weeklyBudget).toBe(700);
    expect(february.dailyBudget).toBe(100);
  });

  it('is zero for a missing budget', () => {
    expect(budgetAllocation(0, new Date(2026, 9, 1)).dailyBudget).toBe(0);
    expect(budgetAllocation(Number.NaN, new Date(2026, 9, 1)).weeklyBudget).toBe(0);
  });
});

describe('buildBudgetSnapshot', () => {
  const now = new Date(2026, 9, 27);

  it('sums regular expenses per local day of the month', () => {
    const snapshot = buildBudgetSnapshot(
      [
        tx({id: 'a', type: 'expense', amount: 100.5, transactionDate: '2026-10-05'}),
        tx({id: 'b', type: 'expense', amount: 49.5, transactionDate: '2026-10-05'}),
        tx({id: 'c', type: 'expense', amount: 20, transactionDate: '2026-10-27'}),
      ],
      30000,
      now,
    );
    expect(snapshot).toEqual({
      monthKey: '2026-10',
      monthlyBudget: 30000,
      spendByDate: {'2026-10-05': 150, '2026-10-27': 20},
      dataAsOfMillis: 0,
      cycleStartDay: 1,
    });
  });

  it('takes monthly bills off the budget and out of daily spend', () => {
    const snapshot = buildBudgetSnapshot(
      [
        tx({id: 'rent', type: 'expense', amount: 18000, transactionDate: '2026-10-01', isRecurring: true}),
        tx({
          id: 'copy',
          type: 'expense',
          amount: 999,
          transactionDate: '2026-10-10',
          isRecurring: true,
          externalRef: 'recurring:wifi:2026-10',
        }),
        tx({id: 'food', type: 'expense', amount: 250, transactionDate: '2026-10-10'}),
      ],
      {monthlyBudget: 30000, committed: 18999},
      now,
    );
    expect(snapshot.monthlyBudget).toBe(11001);
    expect(snapshot.spendByDate).toEqual({'2026-10-10': 250});
  });

  it('keeps a budget taken entirely by bills switched on', () => {
    expect(
      buildBudgetSnapshot([], {monthlyBudget: 10000, committed: 12000}, now).monthlyBudget,
    ).toBe(0.01);
  });

  it('follows the payday cycle', () => {
    const snapshot = buildBudgetSnapshot(
      [
        tx({id: 'a', type: 'expense', amount: 100, transactionDate: '2026-10-24'}),
        tx({id: 'b', type: 'expense', amount: 40, transactionDate: '2026-10-25'}),
        tx({id: 'c', type: 'expense', amount: 60, transactionDate: '2026-11-03'}),
      ],
      {monthlyBudget: 31000, payday: 25},
      new Date(2026, 10, 3),
    );
    expect(snapshot.monthKey).toBe('2026-10');
    expect(snapshot.cycleStartDay).toBe(25);
    expect(snapshot.spendByDate).toEqual({'2026-10-25': 40, '2026-11-03': 60});
  });

  it('leaves out income, opening balance and adjustments', () => {
    const snapshot = buildBudgetSnapshot(
      [
        tx({id: 'a', type: 'expense', amount: 100, transactionDate: '2026-10-05'}),
        tx({id: 'b', type: 'income', amount: 5000, transactionDate: '2026-10-05'}),
        tx({
          id: 'c',
          type: 'expense',
          amount: 700,
          kind: 'opening_balance',
          transactionDate: '2026-10-05',
        }),
        tx({
          id: 'd',
          type: 'expense',
          amount: 300,
          kind: 'balance_adjustment',
          transactionDate: '2026-10-06',
        }),
      ],
      30000,
      now,
    );
    expect(snapshot.spendByDate).toEqual({'2026-10-05': 100});
  });

  it('records when the ledger fetch started', () => {
    expect(buildBudgetSnapshot([], 1000, now, 1234).dataAsOfMillis).toBe(1234);
    expect(buildBudgetSnapshot([], 1000, now).dataAsOfMillis).toBe(0);
  });

  it('ignores other months', () => {
    const snapshot = buildBudgetSnapshot(
      [
        tx({id: 'a', type: 'expense', amount: 100, transactionDate: '2026-09-30'}),
        tx({id: 'b', type: 'expense', amount: 100, transactionDate: '2026-11-01'}),
        tx({id: 'c', type: 'expense', amount: 5, transactionDate: '2026-10-01'}),
      ],
      0,
      now,
    );
    expect(snapshot.spendByDate).toEqual({'2026-10-01': 5});
    expect(snapshot.monthlyBudget).toBe(0);
  });

  it('adds up to the same month spend the dashboard shows', () => {
    const rows = [
      tx({id: 'a', type: 'expense', amount: 120.25, transactionDate: '2026-10-03'}),
      tx({id: 'b', type: 'expense', amount: 80.1, transactionDate: '2026-10-27'}),
      tx({id: 'c', type: 'income', amount: 900, transactionDate: '2026-10-04'}),
      tx({
        id: 'd',
        type: 'expense',
        amount: 50,
        kind: 'balance_adjustment',
        transactionDate: '2026-10-10',
      }),
      tx({
        id: 'e',
        type: 'income',
        amount: 10000,
        kind: 'opening_balance',
        transactionDate: '2026-10-01',
      }),
      tx({id: 'f', type: 'expense', amount: 40, transactionDate: '2026-09-28'}),
    ];
    const snapshot = buildBudgetSnapshot(rows, 5000, now);
    const total = Object.values(snapshot.spendByDate).reduce(
      (sum, value) => sum + value,
      0,
    );
    expect(Number(total.toFixed(2))).toBe(monthlySpentFor(rows, now));
  });
});

describe('unsyncedSpendByDate', () => {
  it('counts only unsynced, successful, unflagged debits', () => {
    expect(
      unsyncedSpendByDate([
        detection({id: 1, amount: '100.00'}),
        detection({id: 2, amount: '50.50'}),
        detection({id: 3, synced: true, syncedAtMillis: 10}),
        detection({id: 4, status: 'FAILED'}),
        detection({id: 5, status: 'PENDING'}),
        detection({id: 6, direction: 'CREDIT'}),
        detection({id: 7, flag: 'POSSIBLE_DUPLICATE'}),
        detection({id: 8, amount: 'abc'}),
        detection({
          id: 9,
          amount: '20',
          direction: 'DEBIT',
          detectedAtMillis: new Date(2026, 9, 26, 9).getTime(),
        }),
      ], 10),
    ).toEqual({'2026-10-27': 150.5, '2026-10-26': 20});
  });

  it('never counts a payment of unknown direction', () => {
    expect(
      unsyncedSpendByDate([detection({id: 1, direction: 'UNKNOWN'})]),
    ).toEqual({});
  });

  it('counts a synced payment only if it was saved after the ledger was read', () => {
    const saved = detection({id: 1, synced: true, syncedAtMillis: 5000});
    expect(unsyncedSpendByDate([saved], 4999)).toEqual({'2026-10-27': 100});
    expect(unsyncedSpendByDate([saved], 5000)).toEqual({});
    expect(unsyncedSpendByDate([saved], 9000)).toEqual({});
    // Unknown ledger time (0) errs toward double counting, never under.
    expect(unsyncedSpendByDate([saved])).toEqual({'2026-10-27': 100});
  });

  it('still counts a never-synced payment whatever the ledger time', () => {
    expect(unsyncedSpendByDate([detection({id: 1})], 9_999_999)).toEqual({
      '2026-10-27': 100,
    });
  });
});
