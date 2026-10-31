import {BillMonth, CycleBill, billPaymentIds, billsDue, cycleBills, plannedBillTotal} from './billMonths';
import {
  CycleRange,
  MonthInputs,
  MonthState,
  SavingsMove,
  addDaysISO,
  adjustmentTotal,
  cycleRangeFor,
  monthState,
  savingsPool,
  validatePlan,
} from './budgetEngine';
import {BudgetFlowState, hasStarted} from './budgetFlow';
import {BudgetHistory, BudgetMonth, EMPTY_HISTORY} from './budgetMonths';
import {PendingBill, isBillRow} from './recurring';
import {TransactionRow, calendarDateISO, isLedgerSpecial, roundMoney} from './transactionsStore';

/**
 * Everything the budget is worked out from, as stored: the plan, the ledger,
 * bills and their statuses, finished months and money moved between budget
 * and savings. budgetForDay turns it into one cycle's engine inputs.
 */
export type BudgetFacts = {
  /** The monthly budget: bills and the savings goal included (budgetPlan.monthlyTotalOf). */
  total: number;
  savingsGoal: number;
  payday?: number | null;
  transactions: TransactionRow[];
  pendingBills?: PendingBill[];
  billMonths?: BillMonth[];
  history?: BudgetHistory;
  /** Null when the database cannot hold it yet: the whole current cycle counts. */
  flow?: BudgetFlowState | null;
  /** Detected payments not in the ledger yet, per day. */
  unsyncedSpend?: Record<string, number>;
};

export type CycleBudget = {
  cycle: CycleRange;
  inputs: MonthInputs;
  bills: CycleBill[];
  state: MonthState;
};

/** An expense that comes out of a day's limit: not a bill, not fixed, not a balance correction. */
export function isDayToDaySpend(row: TransactionRow, billPayments: Set<string>): boolean {
  return (
    row.type === 'expense' &&
    !isLedgerSpecial(row) &&
    !isBillRow(row) &&
    !row.isFixed &&
    !billPayments.has(row.id)
  );
}

export function dayToDaySpendByDate(
  rows: TransactionRow[],
  cycle: CycleRange,
  billPayments: Set<string> = new Set(),
  extra: Record<string, number> = {},
): Record<string, number> {
  const spend: Record<string, number> = {};
  const add = (date: string, amount: number) => {
    if (date >= cycle.start && date <= cycle.end && Number.isFinite(amount)) {
      spend[date] = roundMoney((spend[date] ?? 0) + amount);
    }
  };
  for (const row of rows) {
    if (isDayToDaySpend(row, billPayments)) {
      add(calendarDateISO(row.transactionDate), row.amount);
    }
  }
  for (const [date, amount] of Object.entries(extra)) {
    add(date, Number(amount));
  }
  return spend;
}

/** One-off expenses marked fixed in the cycle: set aside like bills. */
export function fixedOneOffTotal(rows: TransactionRow[], cycle: CycleRange): number {
  let total = 0;
  for (const row of rows) {
    const date = calendarDateISO(row.transactionDate);
    if (
      row.type === 'expense' &&
      row.isFixed &&
      !isLedgerSpecial(row) &&
      !isBillRow(row) &&
      date >= cycle.start &&
      date <= cycle.end
    ) {
      total += row.amount;
    }
  }
  return roundMoney(total);
}

/** The cycle's own top-ups and moves, plus last month's extra added to it. */
export function cycleAdjustments(history: BudgetHistory, cycle: CycleRange): number {
  const moves: SavingsMove[] = history.adjustments
    .filter(adjustment => adjustment.cycleStart === cycle.start)
    .map(adjustment => ({kind: adjustment.kind, amount: adjustment.amount}));
  const rolledIn = history.months.reduce(
    (sum, month) => (month.appliedCycleStart === cycle.start ? sum + month.toBudget : sum),
    0,
  );
  return adjustmentTotal(moves, rolledIn);
}

/** Extra savings kept so far, from finished months and moves. */
export function keptExtraSavings(history: BudgetHistory): number {
  return savingsPool(
    history.months.map(month => ({extraSavings: month.extraSavings, toBudget: month.toBudget})),
    history.adjustments.map(adjustment => ({kind: adjustment.kind, amount: adjustment.amount})),
  );
}

/**
 * The first day of `cycle` whose spending counts: tracking's start, and
 * never a day an earlier finished cycle already counted (after a payday
 * change two cycles can overlap).
 */
export function countFromFor(
  cycle: CycleRange,
  flow: BudgetFlowState | null | undefined,
  months: BudgetMonth[],
): string {
  let from = hasStarted(flow ?? null) ? (flow!.trackingStart as string) : cycle.start;
  if (from < cycle.start) {
    from = cycle.start;
  }
  for (const month of months) {
    if (month.cycleStart < cycle.start && month.cycleEnd >= from) {
      from = addDaysISO(month.cycleEnd, 1);
    }
  }
  return from;
}

/** The budget for the cycle holding `day`. */
export function budgetForCycle(facts: BudgetFacts, day: string): CycleBudget {
  const cycle = cycleRangeFor(day, facts.payday);
  const history = facts.history ?? EMPTY_HISTORY;
  const billMonths = facts.billMonths ?? [];
  const bills = cycleBills(facts.transactions, cycle, facts.pendingBills ?? [], billMonths);
  const flow = facts.flow ?? null;
  const countFrom = countFromFor(cycle, flow, history.months);
  const trackingStart = hasStarted(flow) ? flow.trackingStart : null;
  const alreadySpent =
    hasStarted(flow) && trackingStart !== null && trackingStart >= cycle.start && trackingStart <= cycle.end
      ? flow.alreadySpent
      : 0;
  const inputs: MonthInputs = {
    cycle,
    total: facts.total,
    savingsGoal: facts.savingsGoal,
    bills: billsDue(bills),
    fixedOneOffs: fixedOneOffTotal(facts.transactions, cycle),
    adjustments: cycleAdjustments(history, cycle),
    alreadySpent,
    countFrom,
    spendByDate: dayToDaySpendByDate(
      facts.transactions,
      cycle,
      billPaymentIds(billMonths),
      facts.unsyncedSpend,
    ),
    planValid:
      facts.total > 0 &&
      validatePlan(facts.total, plannedBillTotal(bills), facts.savingsGoal).status !== 'over',
  };
  return {cycle, inputs, bills, state: monthState(inputs, day)};
}

/** Whether a budget is set at all. */
export function hasBudget(facts: Pick<BudgetFacts, 'total'>): boolean {
  return Number.isFinite(facts.total) && facts.total > 0;
}
