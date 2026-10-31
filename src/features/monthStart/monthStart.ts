import {CycleBill} from '../../lib/billMonths';
import {
  CycleRange,
  MonthClose,
  addDaysISO,
  closeMonth,
  cycleRangeFor,
  isLongAbsence,
} from '../../lib/budgetEngine';
import {BudgetFlowState, hasStarted} from '../../lib/budgetFlow';
import {BudgetFacts, budgetForCycle} from '../../lib/budgetInputs';
import {BudgetHistory, BudgetMonth, MonthCloseRecord} from '../../lib/budgetMonths';
import {localDateISO} from '../../lib/transactionsStore';

/**
 * What the first open of a budget cycle has to do (handbook 6, 6.1, 5.6):
 * write down how the last cycle ended, then show the month-start review once;
 * or, after a whole cycle or more away, start the setup again instead.
 */
export type MonthStartPlan =
  | {kind: 'none'}
  /** Write the finished cycle; `handled` keeps its extra as savings with no review. */
  | {kind: 'close'; cycle: CycleRange; prompt: boolean; handled: boolean}
  | {kind: 'review'; month: BudgetMonth}
  /**
   * Start the setup again. `close` is the last cycle Paisa was used in, still
   * to be written down (kept as savings, no review) when the restart ends:
   * written earlier, its date would read as the app having been in use.
   */
  | {kind: 'restart'; close: CycleRange | null};

/** The last day Paisa was opened that the stored facts show. */
export function lastActiveDay(
  flow: BudgetFlowState,
  history: BudgetHistory,
): string | null {
  let last = flow.startedOn;
  for (const month of history.months) {
    const closed = localDateISO(new Date(month.closedAt));
    if (last === null || closed > last) {
      last = closed;
    }
  }
  return last;
}

/**
 * The extra-savings question is asked from the first full month after an
 * account moved over (handbook 5.3): the month it moved in keeps its extra
 * as savings without asking.
 */
export function promptsFor(cycle: CycleRange, flow: BudgetFlowState): boolean {
  if (flow.source !== 'migrated' || !flow.startedOn) {
    return true;
  }
  return !(flow.startedOn >= cycle.start && flow.startedOn <= cycle.end);
}

export function planMonthStart(
  today: string,
  payday: number | null | undefined,
  flow: BudgetFlowState | null | undefined,
  history: BudgetHistory,
): MonthStartPlan {
  if (!history.available || !hasStarted(flow ?? null)) {
    return {kind: 'none'};
  }
  const started = flow as BudgetFlowState;
  const trackingStart = started.trackingStart as string;
  if (trackingStart > today) {
    return {kind: 'none'};
  }
  const closed = new Set(history.months.map(month => month.cycleStart));
  const current = cycleRangeFor(today, payday);
  const tracked = (cycle: CycleRange) => cycle.end >= trackingStart && cycle.end < today;
  const lastClosedEnd = history.months.reduce<string | null>(
    (last, month) => (last === null || month.cycleEnd > last ? month.cycleEnd : last),
    null,
  );
  // After a payday change two cycles can overlap; one already counted is not closed again.
  const overlapsClosed = (cycle: CycleRange) => lastClosedEnd !== null && cycle.start <= lastClosedEnd;

  const last = lastActiveDay(started, history);
  if (isLongAbsence(last, today, payday)) {
    const activeCycle = cycleRangeFor(last as string, payday);
    const open = tracked(activeCycle) && !closed.has(activeCycle.start) && !overlapsClosed(activeCycle);
    return {kind: 'restart', close: open ? activeCycle : null};
  }

  const previous = cycleRangeFor(addDaysISO(current.start, -1), payday);
  if (tracked(previous) && !closed.has(previous.start) && !overlapsClosed(previous)) {
    return {kind: 'close', cycle: previous, prompt: promptsFor(previous, started), handled: false};
  }

  const newest = history.months.reduce<BudgetMonth | null>(
    (latest, month) => (latest === null || month.cycleStart > latest.cycleStart ? month : latest),
    null,
  );
  if (newest && newest.reviewedAt === null && newest.cycleEnd < today) {
    return {kind: 'review', month: newest};
  }
  return {kind: 'none'};
}

/** How a finished cycle closes, from the facts as they stand now. */
export function closeRecordFor(
  facts: BudgetFacts,
  cycle: CycleRange,
  prompt: boolean,
  handled: boolean,
): {record: MonthCloseRecord; bills: CycleBill[]; close: MonthClose} {
  const budget = budgetForCycle(facts, cycle.end);
  const close = closeMonth(budget.inputs);
  return {
    close,
    bills: budget.bills,
    record: {
      ...close,
      budget: facts.total,
      savingsGoal: facts.savingsGoal,
      prompt,
      handled,
    },
  };
}

/** Last month's extra recounted now, so payments synced after it closed are in it. */
export function recountedExtra(facts: BudgetFacts, month: BudgetMonth): number {
  return closeMonth(budgetForCycle(facts, month.cycleEnd).inputs).extraSavings;
}

/** Whether the review opens on the extra-savings choice (step 1). */
export function asksExtraChoice(month: BudgetMonth | null): boolean {
  return (
    month !== null &&
    month.prompt &&
    month.choice === null &&
    month.extraSavings > 0 &&
    month.overspentBy <= 0
  );
}
