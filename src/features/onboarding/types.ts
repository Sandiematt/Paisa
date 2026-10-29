export const STEP_KEYS = [
  'whatsnew',
  'basics',
  'money',
  'payday',
  'bills',
  'budget',
  'autotrack',
  'lock',
  'done',
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

export type GoalId = 'track' | 'save' | 'split';

/** A fixed monthly cost picked on the bills step. */
export type RecurringBill = {
  /** Preset id, unique within the draft. */
  id: string;
  label: string;
  /** Default category slug the bill is filed under. */
  slug: string;
  amount: string;
  /** Day of the month it is due, 1-31 (31 means the last day); null until picked. */
  day: number | null;
  /** Typed in by the user rather than picked from the presets; its label is editable. */
  custom?: boolean;
};

export type OnboardingDraft = {
  name: string;
  email: string;
  password?: string;
  /** Typed again on sign-up; must match `password`. Never sent anywhere. */
  confirmPassword?: string;
  currency: string;
  startingBalance: string;
  monthlyIncome: string;
  /** Edited from Profile; onboarding no longer asks and saves 'track'. */
  goal: GoalId | null;
  categoryIds: string[];
  /** Monthly budget, bills included. Calculated from income unless `budgetCustom` (see lib/budgetPlan). */
  monthlyBudget: string;
  monthlySavingsGoal: string;
  /** The user typed their own budget instead of the calculated one. */
  budgetCustom?: boolean;
  avatarUrl?: string;
  /** Day of the month salary arrives, 1-31; 31 means the last day. */
  payday?: number | null;
  /** Log monthly income as a repeating entry on payday. */
  logSalary?: boolean;
  bills?: RecurringBill[];
  /** How Paisa locks, set up on the lock step: a confirmed fingerprint scan, or an app PIN. */
  appLock?: AppLockMethod | null;
  /** The PIN picked on the lock step. In memory only: never saved with the profile. */
  appLockPin?: string;
  /** Auto-tracking toggles picked on the auto-track step (Android only). */
  autoTrackNotes?: boolean;
  autoTrackBlocking?: boolean;
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

export type AppLockMethod = 'biometric' | 'pin';

export type BillPreset = Omit<RecurringBill, 'amount' | 'day' | 'custom'>;

export type StepValidity = {
  canContinue: boolean;
  /** Optional steps render a skip action instead of forcing input. */
  skippable: boolean;
};
