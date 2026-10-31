import {
  asksExtraChoice,
  closeRecordFor,
  lastActiveDay,
  planMonthStart,
  promptsFor,
  recountedExtra,
} from '../src/features/monthStart/monthStart';
import {BudgetFlowState} from '../src/lib/budgetFlow';
import {BudgetFacts} from '../src/lib/budgetInputs';
import {BudgetHistory, BudgetMonth} from '../src/lib/budgetMonths';
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

const flow = (patch: Partial<BudgetFlowState> = {}): BudgetFlowState => ({
  version: 1,
  trackingStart: '2026-10-15',
  alreadySpent: 0,
  startedOn: '2026-10-15',
  source: 'new',
  ...patch,
});

function month(patch: Partial<BudgetMonth> = {}): BudgetMonth {
  return {
    cycleStart: '2026-10-01',
    cycleEnd: '2026-10-31',
    budget: 9000,
    savingsGoal: 2000,
    spendable: 2000,
    spent: 1850,
    extraSavings: 150,
    overspentBy: 0,
    partialFrom: null,
    prompt: true,
    choice: null,
    toBudget: 0,
    appliedCycleStart: null,
    handledAt: null,
    reviewedAt: null,
    closedAt: '2026-11-01T04:00:00.000Z',
    ...patch,
  };
}

const history = (months: BudgetMonth[] = []): BudgetHistory => ({available: true, months, adjustments: []});

describe('planMonthStart', () => {
  it('does nothing without the tables, or before the budget started', () => {
    expect(planMonthStart('2026-11-02', null, flow(), {available: false, months: [], adjustments: []})).toEqual({kind: 'none'});
    expect(planMonthStart('2026-11-02', null, null, history())).toEqual({kind: 'none'});
    expect(planMonthStart('2026-10-30', null, flow({trackingStart: '2026-11-01'}), history())).toEqual({kind: 'none'});
  });

  it('writes down last month on the first open of a new one', () => {
    expect(planMonthStart('2026-11-02', null, flow(), history())).toEqual({
      kind: 'close',
      cycle: {start: '2026-10-01', end: '2026-10-31'},
      prompt: true,
      handled: false,
    });
  });

  it('then shows the review once', () => {
    const closed = month();
    expect(planMonthStart('2026-11-02', null, flow(), history([closed]))).toEqual({kind: 'review', month: closed});
    expect(
      planMonthStart('2026-11-02', null, flow(), history([{...closed, reviewedAt: '2026-11-02T05:00:00Z'}])),
    ).toEqual({kind: 'none'});
  });

  it('has nothing to close in the first month after starting', () => {
    expect(planMonthStart('2026-10-20', null, flow(), history())).toEqual({kind: 'none'});
    // Started on the 1st, after waiting: October was never tracked.
    expect(planMonthStart('2026-11-02', null, flow({trackingStart: '2026-11-01', startedOn: '2026-10-30'}), history())).toEqual({
      kind: 'none',
    });
  });

  it('does not ask about the extra for the month an account moved over in', () => {
    const moved = flow({source: 'migrated', trackingStart: '2026-10-01', startedOn: '2026-10-15'});
    expect(planMonthStart('2026-11-02', null, moved, history())).toMatchObject({kind: 'close', prompt: false});
    expect(promptsFor({start: '2026-11-01', end: '2026-11-30'}, moved)).toBe(true);
  });

  it('restarts the setup after a whole month away, closing only the last month used', () => {
    // Last opened in October (it closed September then); November was missed.
    const september = month({cycleStart: '2026-09-01', cycleEnd: '2026-09-30', closedAt: '2026-10-03T06:00:00Z', reviewedAt: 'x'});
    const started = flow({trackingStart: '2026-09-01', startedOn: '2026-09-01'});
    // October is written when the restart ends; November is never reconstructed.
    expect(planMonthStart('2026-12-05', null, started, history([september]))).toEqual({
      kind: 'restart',
      close: {start: '2026-10-01', end: '2026-10-31'},
    });
    // The restart starts the budget again from today: back to normal.
    const restarted = flow({trackingStart: '2026-12-05', startedOn: '2026-12-05', source: 'restart'});
    const october = month({closedAt: '2026-12-05T06:00:00Z', reviewedAt: 'x', choice: 'keep'});
    expect(planMonthStart('2026-12-05', null, restarted, history([september, october]))).toEqual({kind: 'none'});
    expect(planMonthStart('2027-01-02', null, restarted, history([september, october]))).toMatchObject({
      kind: 'close',
      cycle: {start: '2026-12-01', end: '2026-12-31'},
    });
  });

  it('restarts with nothing to close when the last month used was already closed', () => {
    const september = month({cycleStart: '2026-09-01', cycleEnd: '2026-09-30', closedAt: '2026-09-30T06:00:00Z', reviewedAt: 'x'});
    expect(
      planMonthStart('2026-12-05', null, flow({trackingStart: '2026-09-01', startedOn: '2026-09-01'}), history([september])),
    ).toEqual({kind: 'restart', close: null});
  });

  it('follows the payday cycle', () => {
    expect(planMonthStart('2026-11-26', 25, flow({trackingStart: '2026-10-25', startedOn: '2026-10-25'}), history())).toMatchObject({
      kind: 'close',
      cycle: {start: '2026-10-25', end: '2026-11-24'},
    });
  });

  it('never closes a cycle that overlaps one already closed after a payday change', () => {
    const october = month({reviewedAt: 'x'});
    // Payday moved to the 25th: the cycle before 25 Nov runs from 25 Oct, inside closed October.
    expect(planMonthStart('2026-11-26', 25, flow({trackingStart: '2026-10-01'}), history([october]))).toEqual({kind: 'none'});
  });
});

describe('lastActiveDay', () => {
  it('is the latest of the start and every close', () => {
    expect(lastActiveDay(flow(), history())).toBe('2026-10-15');
    expect(lastActiveDay(flow(), history([month()]))).toBe('2026-11-01');
  });
});

describe('closing a month', () => {
  const facts = (rows: TransactionRow[]): BudgetFacts => ({
    total: 9000,
    savingsGoal: 2000,
    transactions: [
      tx({id: 'rent', type: 'expense', amount: 5000, transactionDate: '2026-10-01', isRecurring: true, description: 'Rent'}),
      ...rows,
    ],
    flow: flow({trackingStart: '2026-10-01'}),
  });

  it('records what was left as extra savings, apart from the goal', () => {
    const {record} = closeRecordFor(
      facts([tx({id: 'a', type: 'expense', amount: 1850, transactionDate: '2026-10-12'})]),
      {start: '2026-10-01', end: '2026-10-31'},
      true,
      false,
    );
    expect(record).toMatchObject({extraSavings: 150, overspentBy: 0, budget: 9000, savingsGoal: 2000, prompt: true});
  });

  it('records an overspent month with no extra and nothing carried', () => {
    const {record} = closeRecordFor(
      facts([tx({id: 'a', type: 'expense', amount: 2400, transactionDate: '2026-10-12'})]),
      {start: '2026-10-01', end: '2026-10-31'},
      true,
      false,
    );
    expect(record).toMatchObject({extraSavings: 0, overspentBy: 400});
  });

  it('recounts the extra when choosing, so late-synced payments are in it', () => {
    const recounted = recountedExtra(
      {...facts([]), unsyncedSpend: {'2026-10-30': 500}},
      month({extraSavings: 2000}),
    );
    expect(recounted).toBe(1500);
  });
});

describe('asksExtraChoice', () => {
  it('asks only with extra savings, no overspend, no choice yet and the prompt on', () => {
    expect(asksExtraChoice(month())).toBe(true);
    expect(asksExtraChoice(month({extraSavings: 0, overspentBy: 300}))).toBe(false);
    expect(asksExtraChoice(month({choice: 'keep'}))).toBe(false);
    expect(asksExtraChoice(month({prompt: false}))).toBe(false);
    expect(asksExtraChoice(null)).toBe(false);
  });
});
