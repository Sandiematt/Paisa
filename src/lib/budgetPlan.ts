import {OnboardingDraft} from '../features/onboarding/types';

/**
 * The monthly budget, worked out from the plan unless the user set one.
 *
 * Income less the savings goal is what a month can spend. Monthly bills (rent,
 * EMIs, a mess) come off that first, and what is left is the day-to-day
 * budget the week and day limits split:
 *
 *   25,000 income - 15,000 rent - 5,000 mess - 2,000 savings = 3,000
 *
 * The stored budget keeps bills included (here 23,000), so the dashboard and
 * the UPI spend guard take the bills off the way they always have, and a bill
 * added later lowers the day-to-day budget without touching the profile.
 * Income that comes in above the plan is not spent: it adds to savings.
 */
export type BudgetFields = Pick<
  OnboardingDraft,
  'monthlyIncome' | 'monthlyBudget' | 'monthlySavingsGoal' | 'budgetCustom'
>;

function amount(text: string | undefined): number {
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Calculated unless the user set their own, and only once there is an income to work from. */
export function isAutomaticBudget(fields: BudgetFields): boolean {
  return !fields.budgetCustom && amount(fields.monthlyIncome) > 0;
}

/** Income less the savings goal: the calculated budget, bills included. */
export function automaticMonthlyBudget(fields: BudgetFields): number {
  return Math.max(0, amount(fields.monthlyIncome) - amount(fields.monthlySavingsGoal));
}

/** The monthly budget the app runs with, bills included. */
export function monthlyBudgetOf(fields: BudgetFields): number {
  return isAutomaticBudget(fields)
    ? automaticMonthlyBudget(fields)
    : amount(fields.monthlyBudget);
}

/** What a budget leaves for day-to-day spending once the month's bills are paid. */
export function dayToDayBudget(monthlyBudget: number, bills: number): number {
  return Math.max(0, monthlyBudget - Math.max(0, bills));
}

/**
 * The budget fields after the user types a day-to-day budget. Typing what the
 * calculation already gives keeps it calculated, so it follows later changes
 * to income, bills or the savings goal.
 */
export function withDayToDayBudget<T extends BudgetFields>(
  fields: T,
  typed: string,
  bills: number,
): T {
  const calculated = dayToDayBudget(automaticMonthlyBudget(fields), bills);
  if (amount(fields.monthlyIncome) > 0 && typed !== '' && amount(typed) === calculated) {
    return {...fields, budgetCustom: false, monthlyBudget: String(automaticMonthlyBudget(fields))};
  }
  return {
    ...fields,
    budgetCustom: true,
    monthlyBudget: typed === '' ? '' : String(amount(typed) + Math.max(0, bills)),
  };
}
