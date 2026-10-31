/**
 * The budget month. By default it is the calendar month; with a payday set it
 * runs from payday to the day before the next one, so a salary on the 25th
 * starts a "month" of 25 Oct to 24 Nov. A payday past a short month's end
 * falls on that month's last day (31 means "last day").
 *
 * Mirrored by the Kotlin BudgetPlan.cycleFor; both run the vectors in
 * __tests__/fixtures/dailyAllowanceVectors.json.
 */
export type BudgetCycle = {
  start: Date;
  end: Date;
  /** Days in the cycle, start and end included. */
  length: number;
};

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Payday as a cycle start day; null, 1 or anything invalid means calendar months. */
export function cycleStartDay(payday: number | null | undefined): number {
  return typeof payday === 'number' && Number.isInteger(payday) && payday >= 1 && payday <= 31
    ? payday
    : 1;
}

/** The cycle's first day in a given month. */
function startIn(year: number, month: number, startDay: number): Date {
  return new Date(year, month, Math.min(startDay, daysInMonth(year, month)));
}

export function cycleFor(date: Date, payday?: number | null): BudgetCycle {
  const startDay = cycleStartDay(payday);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const here = startIn(day.getFullYear(), day.getMonth(), startDay);
  const start =
    day >= here ? here : startIn(day.getFullYear(), day.getMonth() - 1, startDay);
  const next = startIn(start.getFullYear(), start.getMonth() + 1, startDay);
  const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
  return {
    start,
    end,
    length: Math.round((next.getTime() - start.getTime()) / 86400000),
  };
}

/** The cycle just before the one holding `date`. */
export function previousCycle(date: Date, payday?: number | null): BudgetCycle {
  const current = cycleFor(date, payday);
  const dayBefore = new Date(
    current.start.getFullYear(),
    current.start.getMonth(),
    current.start.getDate() - 1,
  );
  return cycleFor(dayBefore, payday);
}

export function isCalendarCycle(payday: number | null | undefined): boolean {
  return cycleStartDay(payday) === 1;
}

/**
 * The payday the app is running with. Set from the signed-in profile, the way
 * the active colour scheme is, so helpers deep in the dashboard pick it up
 * without every caller passing it along. Pure functions that need to be exact
 * (the home report, the daily allowance) take it as an argument instead.
 */
let activePayday: number | null = null;

export function setActivePayday(payday: number | null | undefined) {
  activePayday = typeof payday === 'number' ? payday : null;
}

export function getActivePayday(): number | null {
  return activePayday;
}
