import {
  dailyAllowance,
  snapshotForBudget,
  unsyncedSpendByDate,
} from '../src/features/autotrack/dailyAllowance';
import {BudgetFacts} from '../src/lib/budgetInputs';
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
    expect(dailyAllowance(vector.snapshot, vector.today)).toEqual(vector.expected);
  });

  it('accepts a Date as today, at any time of day', () => {
    const vector = vectors[0];
    const [year, month, day] = vector.today.split('-').map(Number);
    expect(dailyAllowance(vector.snapshot, new Date(year, month - 1, day, 23, 59))).toEqual(
      vector.expected,
    );
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
    const allowance = dailyAllowance(snapshot, '2026-10-27', {'2026-10-26': 500, '2026-10-27': 300});
    expect(allowance).toMatchObject({spentBeforeToday: 22000, spentToday: 500, dailyLimit: 1800});
  });

  it('ignores spend outside the month and after today', () => {
    const allowance = dailyAllowance(snapshot, '2026-10-27', {
      '2026-09-30': 999,
      '2026-10-28': 999,
      '2026-11-01': 999,
    });
    expect(allowance).toMatchObject({spentBeforeToday: 21500, spentToday: 200, remainingMonth: 9300});
  });

  it('uses extra spend even when the snapshot is for another month', () => {
    const allowance = dailyAllowance({...snapshot, monthKey: '2026-09'}, '2026-10-27', {'2026-10-27': 100});
    expect(allowance).toMatchObject({spentBeforeToday: 0, spentToday: 100, dailyLimit: 6200});
  });

  it('has no allowance for a missing or invalid budget', () => {
    expect(dailyAllowance({...snapshot, monthlyBudget: 0}, '2026-10-27')).toBeNull();
    expect(dailyAllowance({...snapshot, monthlyBudget: -5}, '2026-10-27')).toBeNull();
    expect(dailyAllowance({...snapshot, monthlyBudget: Number.NaN}, '2026-10-27')).toBeNull();
    expect(dailyAllowance(snapshot, 'not a date')).toBeNull();
  });

  it('never reports a negative limit and avoids negative zero', () => {
    const allowance = dailyAllowance({...snapshot, monthlyBudget: 100}, '2026-10-27')!;
    expect(allowance.dailyLimit).toBe(0);
    expect(Object.is(allowance.dailyLimit, -0)).toBe(false);
    expect(allowance.remainingMonth).toBe(-21600);
  });
});

describe('snapshotForBudget', () => {
  // ₹9,000 budget, ₹5,000 rent, ₹2,000 goal: ₹2,000 to spend in November.
  const rent = tx({
    id: 'rent',
    type: 'expense',
    amount: 5000,
    transactionDate: '2026-10-01',
    isRecurring: true,
    description: 'Rent',
  });
  const rentNov = tx({
    id: 'rent-nov',
    type: 'expense',
    amount: 5000,
    transactionDate: '2026-11-01',
    isRecurring: true,
    externalRef: 'recurring:rent:2026-11',
  });
  const facts = (patch: Partial<BudgetFacts> = {}): BudgetFacts => ({
    total: 9000,
    savingsGoal: 2000,
    transactions: [rent, rentNov],
    ...patch,
  });

  it('pushes what is left for day-to-day spending, bills and the goal set aside', () => {
    const lunch = tx({id: 'lunch', type: 'expense', amount: 120, transactionDate: '2026-11-03'});
    const snapshot = snapshotForBudget(facts({transactions: [rent, rentNov, lunch]}), '2026-11-05', 42);
    expect(snapshot).toEqual({
      monthKey: '2026-11',
      monthlyBudget: 2000,
      spendByDate: {'2026-11-03': 120},
      dataAsOfMillis: 42,
      cycleStartDay: 1,
    });
    expect(dailyAllowance(snapshot, '2026-11-05')!.dailyLimit).toBe(72.3); // 1880 / 26
  });

  it('leaves out income, balance rows, fixed one-offs and unsynced detections', () => {
    const rows = [
      rent,
      rentNov,
      tx({id: 'pay', type: 'income', amount: 900, transactionDate: '2026-11-02'}),
      tx({id: 'adj', type: 'expense', amount: 50, kind: 'balance_adjustment', transactionDate: '2026-11-02'}),
      tx({id: 'fees', type: 'expense', amount: 600, isFixed: true, transactionDate: '2026-11-02'}),
    ];
    const snapshot = snapshotForBudget(facts({transactions: rows, unsyncedSpend: {'2026-11-02': 75}}), '2026-11-05');
    expect(snapshot.spendByDate).toEqual({});
    // The fixed one-off is set aside like a bill.
    expect(snapshot.monthlyBudget).toBe(1400);
  });

  it('takes off what a mid-month joiner already spent and counts from the join day', () => {
    const snapshot = snapshotForBudget(
      facts({
        transactions: [rent, rentNov, tx({id: 'old', type: 'expense', amount: 300, transactionDate: '2026-11-02'})],
        flow: {version: 1, trackingStart: '2026-11-15', alreadySpent: 400, startedOn: '2026-11-15', source: 'new'},
      }),
      '2026-11-15',
    );
    expect(snapshot).toMatchObject({monthlyBudget: 1600, spendByDate: {}, trackingStart: '2026-11-15'});
  });

  it('is the coming month while the budget waits, so the guard starts by itself', () => {
    const snapshot = snapshotForBudget(
      facts({flow: {version: 1, trackingStart: '2026-11-01', alreadySpent: 0, startedOn: '2026-10-30', source: 'new'}}),
      '2026-10-30',
    );
    expect(snapshot).toMatchObject({monthKey: '2026-11', monthlyBudget: 2000, trackingStart: '2026-11-01'});
    expect(dailyAllowance(snapshot, '2026-10-30')).toBeNull();
    expect(dailyAllowance(snapshot, '2026-11-01')!.dailyLimit).toBe(66.66);
  });

  it('keeps the guard on with a token paisa when nothing is left', () => {
    expect(snapshotForBudget(facts({total: 7000}), '2026-11-05').monthlyBudget).toBe(0.01);
  });

  it('turns the guard off with no budget, or one that needs fixing', () => {
    expect(snapshotForBudget(facts({total: 0}), '2026-11-05').monthlyBudget).toBe(0);
    expect(snapshotForBudget(facts({total: 6000}), '2026-11-05').monthlyBudget).toBe(0);
  });

  it('follows the payday cycle', () => {
    const snapshot = snapshotForBudget(facts({payday: 25, transactions: []}), '2026-10-27');
    expect(snapshot).toMatchObject({monthKey: '2026-10', cycleStartDay: 25, monthlyBudget: 7000});
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
