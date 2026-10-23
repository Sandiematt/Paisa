import {
  budgetAlertKey,
  budgetPeriodKey,
  planBudgetAlert,
  pruneHandledKeys,
} from '../src/lib/notifications/budgetAlerts';
import {
  addToHistory,
  markAllItemsRead,
  markItemRead,
  unreadCountOf,
} from '../src/lib/notifications/history';
import {
  formatReminderTime,
  hasExpenseOnDay,
  planReminders,
} from '../src/lib/notifications/reminders';
import {NotificationItem} from '../src/lib/notifications/types';
import {monthlySpentFor} from '../src/features/home/homeReport';
import {TransactionRow} from '../src/lib/transactionsStore';

const USER = 'user-1';
const ON = {budgetExceeded: true, budgetWarning: true};

function tx(
  partial: Partial<TransactionRow> &
    Pick<TransactionRow, 'id' | 'amount' | 'transactionDate'>,
): TransactionRow {
  return {
    userId: USER,
    type: 'expense',
    categoryId: null,
    description: null,
    merchant: null,
    paymentMethod: null,
    notes: null,
    kind: 'regular',
    isRecurring: false,
    createdAt: `${partial.transactionDate}T08:00:00`,
    updatedAt: `${partial.transactionDate}T08:00:00`,
    ...partial,
  };
}

function plan(
  spent: number,
  options: {
    budget?: number;
    now?: Date;
    handled?: string[];
    prefs?: typeof ON;
  } = {},
) {
  return planBudgetAlert({
    userId: USER,
    now: options.now ?? new Date(2026, 9, 15, 12),
    spent,
    budget: options.budget ?? 10000,
    currencySymbol: '₹',
    prefs: options.prefs ?? ON,
    handled: new Set(options.handled ?? []),
  });
}

describe('budget alert planning', () => {
  test('stays quiet below 80%', () => {
    expect(plan(7999)).toEqual({fire: null, consume: []});
  });

  test('warns once at exactly 80%', () => {
    const result = plan(8000);
    expect(result.fire?.kind).toBe('budget_warning');
    expect(result.fire?.id).toBe('budget:user-1:2026-10:80');
    expect(result.consume).toEqual(['budget:user-1:2026-10:80']);
  });

  test('exactly 100% is a warning, not yet exceeded', () => {
    expect(plan(10000).fire?.kind).toBe('budget_warning');
  });

  test('exceeds only once spending passes the budget', () => {
    const result = plan(10000.01);
    expect(result.fire?.kind).toBe('budget_exceeded');
    expect(result.fire?.body).toContain('₹10,000.01');
  });

  test('a jump past the budget shows only the exceeded alert but claims both', () => {
    const result = plan(12500);
    expect(result.fire?.kind).toBe('budget_exceeded');
    expect(result.consume).toEqual([
      'budget:user-1:2026-10:80',
      'budget:user-1:2026-10:100',
    ]);
  });

  test('never repeats an alert whose key was already handled', () => {
    const first = plan(8500);
    const again = plan(9000, {handled: first.consume});
    expect(again).toEqual({fire: null, consume: []});
  });

  test('exceeded still fires after the 80% warning was handled', () => {
    const result = plan(10500, {handled: ['budget:user-1:2026-10:80']});
    expect(result.fire?.kind).toBe('budget_exceeded');
    expect(result.consume).toEqual(['budget:user-1:2026-10:100']);
  });

  test('handled keys are scoped to the user', () => {
    const other = budgetAlertKey('someone-else', '2026-10', 80);
    expect(plan(8500, {handled: [other]}).fire).not.toBeNull();
  });

  test('a new month starts fresh', () => {
    const october = plan(12000);
    const november = plan(12000, {
      now: new Date(2026, 10, 2, 9),
      handled: october.consume,
    });
    expect(november.fire?.id).toBe('budget:user-1:2026-11:100');
  });

  test('disabled toggles consume silently so enabling later does not replay', () => {
    const result = plan(9000, {
      prefs: {budgetExceeded: true, budgetWarning: false},
    });
    expect(result.fire).toBeNull();
    expect(result.consume).toEqual(['budget:user-1:2026-10:80']);
  });

  test('ignores a missing budget', () => {
    expect(plan(500, {budget: 0})).toEqual({fire: null, consume: []});
  });

  test('period keys are zero padded calendar months', () => {
    expect(budgetPeriodKey(new Date(2026, 0, 31))).toBe('2026-01');
  });

  test('pruning drops only old budget keys', () => {
    const pruned = pruneHandledKeys(
      {
        'budget:user-1:2026-05:80': 'a',
        'budget:user-1:2026-09:80': 'b',
        'misc:key': 'c',
      },
      '2026-08',
    );
    expect(Object.keys(pruned).sort()).toEqual([
      'budget:user-1:2026-09:80',
      'misc:key',
    ]);
  });
});

describe('monthly spend', () => {
  test('counts this month’s expenses and ignores ledger entries and other months', () => {
    const rows = [
      tx({id: 'a', amount: 100, transactionDate: '2026-10-02'}),
      tx({id: 'b', amount: 50, transactionDate: '2026-10-31'}),
      tx({id: 'c', amount: 999, transactionDate: '2026-09-30'}),
      tx({id: 'd', amount: 700, transactionDate: '2026-10-03', type: 'income'}),
      tx({
        id: 'e',
        amount: 400,
        transactionDate: '2026-10-04',
        kind: 'balance_adjustment',
      }),
    ];
    expect(monthlySpentFor(rows, new Date(2026, 9, 20))).toBe(150);
  });
});

describe('daily reminder planning', () => {
  const now = new Date(2026, 9, 15, 10, 0);
  const evening = 21 * 60;

  test('queues today and the following days up to the horizon', () => {
    const slots = planReminders({now, minutes: evening, transactions: []});
    expect(slots).toHaveLength(7);
    expect(slots[0].day).toBe('2026-10-15');
    expect(slots[0].fireAt).toEqual(new Date(2026, 9, 15, 21, 0));
    expect(slots[6].day).toBe('2026-10-21');
  });

  test('skips today once an expense is logged, keeps tomorrow', () => {
    const slots = planReminders({
      now,
      minutes: evening,
      transactions: [tx({id: 'a', amount: 10, transactionDate: '2026-10-15'})],
    });
    expect(slots[0].day).toBe('2026-10-16');
    expect(slots).toHaveLength(6);
  });

  test('skips today when the time has already passed', () => {
    const late = new Date(2026, 9, 15, 22, 0);
    const slots = planReminders({now: late, minutes: evening, transactions: []});
    expect(slots[0].day).toBe('2026-10-16');
  });

  test('a backdated entry made today still counts as logging today', () => {
    const rows = [
      tx({
        id: 'a',
        amount: 10,
        transactionDate: '2026-10-10',
        createdAt: '2026-10-15T09:00:00',
      }),
    ];
    expect(hasExpenseOnDay(rows, '2026-10-15')).toBe(true);
  });

  test('income and ledger entries do not count as an expense', () => {
    const rows = [
      tx({id: 'a', amount: 10, transactionDate: '2026-10-15', type: 'income'}),
      tx({
        id: 'b',
        amount: 10,
        transactionDate: '2026-10-15',
        kind: 'opening_balance',
      }),
    ];
    expect(hasExpenseOnDay(rows, '2026-10-15')).toBe(false);
  });

  test('formats times for display', () => {
    expect(formatReminderTime(0)).toBe('12:00 AM');
    expect(formatReminderTime(12 * 60 + 5)).toBe('12:05 PM');
    expect(formatReminderTime(21 * 60 + 30)).toBe('9:30 PM');
  });
});

describe('notification history', () => {
  const item = (id: string, createdAt: string, read = false): NotificationItem => ({
    id,
    kind: 'budget_warning',
    title: id,
    body: '',
    createdAt,
    read,
    target: 'budget',
  });

  test('keeps newest first and ignores duplicate ids', () => {
    let list: NotificationItem[] = [];
    list = addToHistory(list, item('a', '2026-10-01T00:00:00Z'));
    list = addToHistory(list, item('b', '2026-10-02T00:00:00Z'));
    const again = addToHistory(list, item('a', '2026-10-09T00:00:00Z'));
    expect(again).toBe(list);
    expect(list.map(entry => entry.id)).toEqual(['b', 'a']);
  });

  test('tracks read and unread', () => {
    const list = [
      item('a', '2026-10-01T00:00:00Z'),
      item('b', '2026-10-02T00:00:00Z'),
    ];
    expect(unreadCountOf(list)).toBe(2);
    const one = markItemRead(list, 'a');
    expect(unreadCountOf(one)).toBe(1);
    expect(markItemRead(one, 'a')).toBe(one);
    expect(unreadCountOf(markAllItemsRead(one))).toBe(0);
  });
});
