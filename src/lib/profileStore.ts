import AsyncStorage from '@react-native-async-storage/async-storage';
import {User} from '@supabase/supabase-js';

import {DEFAULT_CATEGORY_IDS} from '../features/onboarding/constants';
import {GoalId, OnboardingDraft} from '../features/onboarding/types';
import {isAutomaticBudget, monthlyBudgetOf} from './budgetPlan';
import {
  SETUP_VERSION,
  scheduleFromDraft,
  scheduledMetadata,
} from './scheduledSetup';
import {supabase} from './supabase/client';
import {
  applyWalletAdjustment,
  loadTransactions,
  seedOpeningBalance,
  walletBalanceFrom,
} from './transactionsStore';

const cacheKey = (userId: string) => `sikka.profile.${userId}`;

const GOALS: GoalId[] = ['track', 'save', 'split'];

type ProfileRow = {
  id: string;
  name: string;
  currency: string;
  starting_balance: number | string | null;
  monthly_income: number | string | null;
  monthly_budget: number | string | null;
  monthly_savings_goal: number | string | null;
  goal: string | null;
  category_ids: string[] | null;
  avatar_url: string | null;
};

function asGoal(value: unknown): GoalId | null {
  return typeof value === 'string' && GOALS.includes(value as GoalId)
    ? (value as GoalId)
    : null;
}

function asPayday(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31
    ? value
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asCategories(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return DEFAULT_CATEGORY_IDS;
  }
  const ids = value.filter((item): item is string => typeof item === 'string');
  return ids.length > 0 ? ids : DEFAULT_CATEGORY_IDS;
}

function moneyToText(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return Number.isInteger(parsed) ? String(parsed) : String(parsed);
}

export function textToMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function rowToDraft(row: ProfileRow, email: string): OnboardingDraft {
  return {
    name: row.name,
    email,
    currency: row.currency || 'INR',
    startingBalance: moneyToText(row.starting_balance),
    monthlyIncome: moneyToText(row.monthly_income),
    monthlyBudget: moneyToText(row.monthly_budget),
    monthlySavingsGoal: moneyToText(row.monthly_savings_goal),
    goal: asGoal(row.goal),
    categoryIds: asCategories(row.category_ids),
    avatarUrl: row.avatar_url ?? undefined,
  };
}

function draftToRow(userId: string, draft: OnboardingDraft) {
  return {
    id: userId,
    name: draft.name,
    currency: draft.currency,
    starting_balance: textToMoney(draft.startingBalance),
    monthly_income: textToMoney(draft.monthlyIncome),
    // The budget in effect, so a calculated one is stored as it stands.
    monthly_budget: isAutomaticBudget(draft)
      ? monthlyBudgetOf(draft)
      : textToMoney(draft.monthlyBudget),
    monthly_savings_goal: textToMoney(draft.monthlySavingsGoal),
    goal: draft.goal,
    category_ids: draft.categoryIds,
    avatar_url: draft.avatarUrl ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function draftFromUser(
  user: User,
  stored?: OnboardingDraft | null,
): OnboardingDraft {
  const meta = user.user_metadata ?? {};
  // Google OAuth returns the display name as `full_name`; some providers use `name`.
  const metaName =
    asString(meta.full_name) || asString(meta.name) || asString(meta.display_name);
  // Google OAuth surfaces the email both on user.email and meta.email.
  const metaEmail = user.email || asString(meta.email);
  return {
    name: stored?.name || metaName || displayNameFromEmail(user.email),
    email: stored?.email || metaEmail,
    currency: stored?.currency || asString(meta.currency, 'INR'),
    startingBalance: stored?.startingBalance ?? asString(meta.startingBalance),
    monthlyIncome: stored?.monthlyIncome ?? asString(meta.monthlyIncome),
    monthlyBudget: stored?.monthlyBudget ?? asString(meta.monthlyBudget),
    monthlySavingsGoal:
      stored?.monthlySavingsGoal ?? asString(meta.monthlySavingsGoal),
    goal: stored?.goal ?? asGoal(meta.goal),
    categoryIds: stored?.categoryIds ?? asCategories(meta.categoryIds),
    // The profiles table has no payday column; it lives on the auth user.
    payday: stored?.payday ?? asPayday(meta.payday),
    // Same for whether the budget is the user's own: without it, it is calculated.
    budgetCustom: stored?.budgetCustom ?? meta.budgetCustom === true,
    avatarUrl:
      stored?.avatarUrl ||
      asString(meta.avatar_url) ||
      asString(meta.avatarUrl) ||
      undefined,
  };
}


export function profilePayload(draft: OnboardingDraft) {
  return {
    name: draft.name,
    currency: draft.currency,
    startingBalance: draft.startingBalance,
    monthlyIncome: draft.monthlyIncome,
    monthlyBudget: draft.monthlyBudget,
    monthlySavingsGoal: draft.monthlySavingsGoal,
    goal: draft.goal,
    categoryIds: draft.categoryIds,
    avatarUrl: draft.avatarUrl ?? null,
    payday: draft.payday ?? null,
    budgetCustom: draft.budgetCustom ?? false,
    // A new account goes through every current step, so it is never caught up later.
    setupVersion: SETUP_VERSION,
    ...scheduledMetadata(scheduleFromDraft(draft)),
  };
}

export async function loadProfile(
  userId: string,
): Promise<OnboardingDraft | null> {
  const {data, error} = await supabase
    .from('profiles')
    .select(
      'id, name, currency, starting_balance, monthly_income, monthly_budget, monthly_savings_goal, goal, category_ids, avatar_url',
    )
    .eq('id', userId)
    .maybeSingle();

  if (!error && data) {
    const draft = rowToDraft(data as ProfileRow, '');
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(draft));
    await trySeedOpeningBalance(draft.startingBalance);
    return draft;
  }

  return readCache(userId);
}

export type SaveProfileOptions = {
  targetWalletBalance?: number | null;
  keepCurrency?: boolean;
};

export async function saveProfile(
  userId: string,
  draft: OnboardingDraft,
  options?: SaveProfileOptions,
) {
  // Secrets typed during onboarding never reach the cache or the server.
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    password: _password,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    confirmPassword: _confirm,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    appLockPin: _pin,
    ...rest
  } = draft;
  await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(rest));

  const row: Omit<ReturnType<typeof draftToRow>, 'currency'> & {
    currency?: string;
  } = draftToRow(userId, rest);
  if (options?.keepCurrency) {
    delete row.currency;
  }
  const {error} = await supabase.from('profiles').upsert(row);
  if (error) {
    throw error;
  }

  await trySeedOpeningBalance(rest.startingBalance);
  await trySaveAccountFields(rest.payday, rest.budgetCustom);

  const target = options?.targetWalletBalance;
  if (target === null || target === undefined || !Number.isFinite(target)) {
    return;
  }

  const rows = await loadTransactions();
  await applyWalletAdjustment(target, walletBalanceFrom(rows));
}

async function trySaveAccountFields(
  payday: number | null | undefined,
  budgetCustom: boolean | undefined,
) {
  const data: Record<string, unknown> = {};
  if (payday !== undefined) {
    data.payday = payday ?? null;
  }
  if (budgetCustom !== undefined) {
    data.budgetCustom = budgetCustom;
  }
  if (Object.keys(data).length === 0) {
    return;
  }
  try {
    await supabase.auth.updateUser({data});
  } catch {
    // The cached draft still holds it; the next save retries.
  }
}

async function trySeedOpeningBalance(startingBalance: string) {
  const amount = textToMoney(startingBalance);
  if (amount === null) {
    return;
  }
  try {
    await seedOpeningBalance(amount);
  } catch {
    // Profile save should still succeed if the wallet seed is delayed.
  }
}

export async function clearProfileCache(userId: string): Promise<void> {
  await AsyncStorage.removeItem(cacheKey(userId));
}

async function readCache(userId: string): Promise<OnboardingDraft | null> {
  const raw = await AsyncStorage.getItem(cacheKey(userId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    return null;
  }
}

function displayNameFromEmail(email?: string): string {
  if (!email) {
    return '';
  }
  const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!local) {
    return '';
  }
  return local.replace(/\b\w/g, letter => letter.toUpperCase());
}
