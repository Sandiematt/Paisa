import AsyncStorage from '@react-native-async-storage/async-storage';
import {User} from '@supabase/supabase-js';

import {DEFAULT_CATEGORY_IDS} from '../features/onboarding/constants';
import {GoalId, OnboardingDraft} from '../features/onboarding/types';
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
    monthly_budget: textToMoney(draft.monthlyBudget),
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
  return {
    name: stored?.name || asString(meta.name) || displayNameFromEmail(user.email),
    email: stored?.email || user.email || asString(meta.email),
    currency: stored?.currency || asString(meta.currency, 'INR'),
    startingBalance:
      stored?.startingBalance !== undefined
        ? stored.startingBalance
        : asString(meta.startingBalance),
    monthlyIncome: stored?.monthlyIncome || asString(meta.monthlyIncome),
    monthlyBudget: stored?.monthlyBudget || asString(meta.monthlyBudget),
    monthlySavingsGoal:
      stored?.monthlySavingsGoal || asString(meta.monthlySavingsGoal),
    goal: stored?.goal ?? asGoal(meta.goal),
    categoryIds: stored?.categoryIds ?? asCategories(meta.categoryIds),
    avatarUrl: stored?.avatarUrl || asString(meta.avatarUrl) || undefined,
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
};

export async function saveProfile(
  userId: string,
  draft: OnboardingDraft,
  options?: SaveProfileOptions,
) {
  const {password: _password, ...rest} = draft;
  await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(rest));

  const {error} = await supabase.from('profiles').upsert(draftToRow(userId, rest));
  if (error) {
    throw error;
  }

  await trySeedOpeningBalance(rest.startingBalance);

  const target = options?.targetWalletBalance;
  if (target === null || target === undefined || !Number.isFinite(target)) {
    return;
  }

  const rows = await loadTransactions();
  await applyWalletAdjustment(target, walletBalanceFrom(rows));
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
