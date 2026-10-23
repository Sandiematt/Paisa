import type {OnboardingDraft} from '../onboarding/types';

export type ProfileGoalKey = 'income' | 'budget' | 'savings' | 'categories';

/** Order the nudge walks through when several goals are missing. */
export const PROFILE_GOAL_ORDER: readonly ProfileGoalKey[] = [
  'income',
  'budget',
  'savings',
  'categories',
];

export type ProfileCompleteness = {
  /** Number of goals that are set. */
  done: number;
  /** Number of goals tracked. */
  total: number;
  /** done / total, 0..1. */
  ratio: number;
  /** Goals still missing, in `PROFILE_GOAL_ORDER`. */
  missing: ProfileGoalKey[];
  /** First missing goal, or null when the profile is complete. */
  next: ProfileGoalKey | null;
};

export type ProfileCompletenessInput = Pick<
  OnboardingDraft,
  'monthlyIncome' | 'monthlyBudget' | 'monthlySavingsGoal' | 'categoryIds'
>;

function isPositiveAmount(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  const parsed = Number(text.replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0;
}

/**
 * How much of the money profile is filled in. A goal counts as set when the
 * amount is above zero, or when at least `minCategories` categories are
 * tracked.
 */
export function profileCompleteness(
  input: ProfileCompletenessInput,
  minCategories = 3,
): ProfileCompleteness {
  const set: Record<ProfileGoalKey, boolean> = {
    income: isPositiveAmount(input.monthlyIncome),
    budget: isPositiveAmount(input.monthlyBudget),
    savings: isPositiveAmount(input.monthlySavingsGoal),
    categories: (input.categoryIds?.length ?? 0) >= minCategories,
  };
  const missing = PROFILE_GOAL_ORDER.filter(key => !set[key]);
  const total = PROFILE_GOAL_ORDER.length;
  const done = total - missing.length;
  return {
    done,
    total,
    ratio: done / total,
    missing,
    next: missing[0] ?? null,
  };
}
