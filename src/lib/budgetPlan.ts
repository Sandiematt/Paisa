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

/**
 * The monthly budget as the user sets it: everything for the month, bills
 * and the savings goal included (handbook D1). The stored budget leaves the
 * goal out (see above), so this adds it back; spendable is then this less
 * bills less the goal, the same amount it always was. Calculated, it is the
 * income. 0 means no budget.
 */
export function monthlyTotalOf(fields: BudgetFields): number {
  if (isAutomaticBudget(fields)) {
    return amount(fields.monthlyIncome);
  }
  if ((fields.monthlyBudget ?? '') === '') {
    return 0;
  }
  const stored = Number(fields.monthlyBudget);
  return Math.max(0, (Number.isFinite(stored) ? stored : 0) + amount(fields.monthlySavingsGoal));
}

/**
 * The budget fields after the user types a monthly total. Typing the income
 * keeps the budget calculated. While typed (or when the goal is raised past
 * it), the stored budget can dip below zero; validation stops it being saved
 * that way (see budgetEngine.validatePlan).
 */
export function withMonthlyTotal<T extends BudgetFields>(fields: T, typed: string): T {
  const income = amount(fields.monthlyIncome);
  if (income > 0 && typed !== '' && amount(typed) === income) {
    return {...fields, budgetCustom: false, monthlyBudget: String(automaticMonthlyBudget(fields))};
  }
  if (typed === '') {
    return {...fields, budgetCustom: true, monthlyBudget: ''};
  }
  const stored = amount(typed) - amount(fields.monthlySavingsGoal);
  return {...fields, budgetCustom: true, monthlyBudget: String(Math.round(stored * 100) / 100)};
}

/** The budget fields with a new savings goal: the monthly total stays, so spendable shrinks. */
export function withSavingsGoal<T extends BudgetFields>(fields: T, goal: string): T {
  const total = monthlyTotalOf(fields);
  const next = {...fields, monthlySavingsGoal: goal};
  if (isAutomaticBudget(fields) || (fields.monthlyBudget ?? '') === '') {
    return next;
  }
  const stored = total - amount(goal);
  return {...next, monthlyBudget: String(Math.round(stored * 100) / 100)};
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
