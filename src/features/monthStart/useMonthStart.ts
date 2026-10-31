import {useEffect, useRef, useState} from 'react';

import {CycleBill, recordUnpaidBills} from '../../lib/billMonths';
import {BudgetFlowState} from '../../lib/budgetFlow';
import {BudgetFacts} from '../../lib/budgetInputs';
import {
  BudgetHistory,
  BudgetMonth,
  MonthCloseRecord,
  closeBudgetMonth,
} from '../../lib/budgetMonths';
import {closeRecordFor, planMonthStart} from './monthStart';

/** A long absence: the setup runs again, then the last month used is written down. */
export type RestartPlan = {
  /** Worked out before the restart, so values changed in it do not reach the old month. */
  close: {record: MonthCloseRecord; bills: CycleBill[]} | null;
};

/** Writes the last month used before a long absence, kept as savings with no review. */
export async function writeRestartClose(plan: RestartPlan) {
  if (plan.close) {
    await closeBudgetMonth(plan.close.record);
    await recordUnpaidBills(plan.close.bills);
  }
}

type MonthStartInput = {
  ready: boolean;
  today: string;
  payday: number | null;
  facts: BudgetFacts;
  flow: BudgetFlowState | null | undefined;
  history: BudgetHistory;
  /** Called after a cycle was written, so the stored facts are loaded again. */
  onChanged: () => void;
};

/**
 * Runs the first-open-of-a-cycle work (monthStart.planMonthStart): writes the
 * finished cycle once, then says whether to show the review or restart the
 * setup. Idempotent: a cycle another device already wrote is left alone.
 */
export function useMonthStart({
  ready,
  today,
  payday,
  facts,
  flow,
  history,
  onChanged,
}: MonthStartInput): {review: BudgetMonth | null; restart: RestartPlan | null} {
  const [review, setReview] = useState<BudgetMonth | null>(null);
  const [restart, setRestart] = useState<RestartPlan | null>(null);
  // One write in flight at a time; a cycle that failed is tried again on the next load.
  const busy = useRef<string | null>(null);
  const factsRef = useRef(facts);
  factsRef.current = facts;
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;

  useEffect(() => {
    if (!ready) {
      return;
    }
    const plan = planMonthStart(today, payday, flow, history);
    setRestart(current => {
      if (plan.kind !== 'restart') {
        return null;
      }
      // Kept as first worked out while the restart is open.
      if (current) {
        return current;
      }
      const close = plan.close
        ? closeRecordFor(factsRef.current, plan.close, false, true)
        : null;
      return {close: close ? {record: close.record, bills: close.bills} : null};
    });
    setReview(plan.kind === 'review' ? plan.month : null);
    if (plan.kind !== 'close' || busy.current === plan.cycle.start) {
      return;
    }
    busy.current = plan.cycle.start;
    const {record, bills} = closeRecordFor(factsRef.current, plan.cycle, plan.prompt, plan.handled);
    closeBudgetMonth(record)
      .then(() => recordUnpaidBills(bills))
      .then(() => changedRef.current())
      .catch(() => {})
      .finally(() => {
        busy.current = null;
      });
  }, [flow, history, payday, ready, today]);

  return {review, restart};
}
