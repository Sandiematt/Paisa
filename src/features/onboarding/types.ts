export const STEP_KEYS = [
  'basics',
  'money',
  'goal',
  'categories',
  'budget',
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

export type GoalId = 'track' | 'save' | 'split';

export type OnboardingDraft = {
  name: string;
  email: string;
  password?: string;
  currency: string;
  startingBalance: string;
  monthlyIncome: string;
  goal: GoalId | null;
  categoryIds: string[];
  monthlyBudget: string;
  monthlySavingsGoal: string;
  avatarUrl?: string;
};

export type CategoryPreset = {
  id: string;
  label: string;
  color: string;
};

export type CurrencyPreset = {
  code: string;
  symbol: string;
  label: string;
};

export type GoalPreset = {
  id: GoalId;
  title: string;
  description: string;
  accent: string;
};

export type StepValidity = {
  canContinue: boolean;
  /** Optional steps render a skip action instead of forcing input. */
  skippable: boolean;
};
