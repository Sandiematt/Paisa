import {User} from '@supabase/supabase-js';

import {OnboardingDraft} from '../features/onboarding/types';
import {categoryForSlug, loadCategories} from './categoriesStore';
import {PendingBill} from './recurring';
import {supabase} from './supabase/client';
import {MoneyFlow} from './supabase/database.types';
import {dataErrorMessage} from './supabase/errors';
import {localDateISO, roundMoney} from './transactionsStore';

/**
 * Salary and bills picked during onboarding become "repeats monthly" rows,
 * but only once their first date arrives: a row dated in the future would
 * count toward the wallet balance before the money moved. Until then they
 * wait in the auth user's metadata, which exists before the profile does and
 * survives an email-confirmation round trip. Each entry is written at most
 * once: its external_ref is unique per user, and it leaves the waiting list
 * as soon as it is saved, so deleting the row later does not bring it back.
 */
const METADATA_KEY = 'scheduledSetup';
const REF_PREFIX = 'onboarding:';

export type ScheduledEntry = {
  ref: string;
  type: MoneyFlow;
  amount: number;
  slug: string;
  description: string;
  /** First date, `YYYY-MM-DD`; the monthly repeats follow from it. */
  date: string;
};

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * The first date after `today` that falls on `day` of a month, clamped to the
 * month's last day (31 means "last day"). Today itself is skipped: the
 * starting balance already counts whatever landed today.
 */
export function nextMonthlyDate(day: number, today: string): string {
  const [year, month, date] = today.split('-').map(Number);
  for (let step = 0; step <= 1; step += 1) {
    const index = year * 12 + (month - 1) + step;
    const targetYear = Math.floor(index / 12);
    const targetMonth = (index % 12) + 1;
    const clamped = Math.min(day, daysInMonth(targetYear, targetMonth));
    if (step === 1 || clamped > date) {
      return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(
        clamped,
      ).padStart(2, '0')}`;
    }
  }
  return today;
}

export function scheduleFromDraft(
  draft: OnboardingDraft,
  today: string = localDateISO(),
): ScheduledEntry[] {
  const entries: ScheduledEntry[] = [];
  const income = Number(draft.monthlyIncome) || 0;
  if (draft.logSalary && draft.payday && income > 0) {
    entries.push({
      ref: `${REF_PREFIX}salary`,
      type: 'income',
      amount: roundMoney(income),
      slug: 'salary',
      description: 'Salary',
      date: nextMonthlyDate(draft.payday, today),
    });
  }
  for (const bill of draft.bills ?? []) {
    const amount = Number(bill.amount) || 0;
    if (amount <= 0 || bill.day === null) {
      continue;
    }
    entries.push({
      ref: `${REF_PREFIX}bill:${bill.id}`,
      type: 'expense',
      amount: roundMoney(amount),
      slug: bill.slug,
      description: bill.label.trim(),
      date: nextMonthlyDate(bill.day, today),
    });
  }
  return entries;
}

function isEntry(value: unknown): value is ScheduledEntry {
  const entry = value as ScheduledEntry;
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof entry.ref === 'string' &&
    entry.ref.startsWith(REF_PREFIX) &&
    (entry.type === 'income' || entry.type === 'expense') &&
    typeof entry.amount === 'number' &&
    entry.amount > 0 &&
    typeof entry.slug === 'string' &&
    typeof entry.description === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
  );
}

export function scheduledFromUser(user: User | null): ScheduledEntry[] {
  const raw = user?.user_metadata?.[METADATA_KEY];
  return Array.isArray(raw) ? raw.filter(isEntry) : [];
}

/** Bills picked at sign-up that have not reached their first date yet. */
export function pendingBillsFromUser(user: User | null): PendingBill[] {
  return scheduledFromUser(user)
    .filter(entry => entry.type === 'expense')
    .map(entry => ({
      key: entry.ref,
      label: entry.description,
      amount: entry.amount,
      date: entry.date,
    }));
}

/** Metadata to merge into the sign-up payload or an OAuth user's update. */
export function scheduledMetadata(entries: ScheduledEntry[]) {
  return {[METADATA_KEY]: entries.length > 0 ? entries : null};
}

/**
 * Which round of setup steps an account has been through. Accounts made
 * before payday, bills and app lock existed have none, and are asked those
 * once (the catch-up flow); finishing or dismissing it brings them current.
 */
export const SETUP_VERSION = 2;

export function setupIsCurrent(user: User | null): boolean {
  const version = user?.user_metadata?.setupVersion;
  return typeof version === 'number' && version >= SETUP_VERSION;
}

export async function markSetupCurrent() {
  const {error} = await supabase.auth.updateUser({
    data: {setupVersion: SETUP_VERSION},
  });
  if (error) {
    throw error;
  }
}

/** Adds entries to what is already waiting; a new entry replaces one with the same ref. */
export async function addScheduledSetup(user: User, entries: ScheduledEntry[]) {
  const refs = new Set(entries.map(entry => entry.ref));
  await saveScheduledSetup([
    ...scheduledFromUser(user).filter(entry => !refs.has(entry.ref)),
    ...entries,
  ]);
}

/** Saves the entries an OAuth user picked; they already have an account. */
export async function saveScheduledSetup(entries: ScheduledEntry[]) {
  const {error} = await supabase.auth.updateUser({
    data: scheduledMetadata(entries),
  });
  if (error) {
    throw error;
  }
}

/**
 * Writes the entries whose first date has arrived, then keeps only the rest
 * waiting. Returns how many rows were written.
 */
export async function applyScheduledSetup(
  user: User,
  today: string = localDateISO(),
): Promise<number> {
  const entries = scheduledFromUser(user);
  const due = entries.filter(entry => entry.date <= today);
  if (due.length === 0) {
    return 0;
  }

  const categories = await loadCategories();
  const {error} = await supabase.from('transactions').upsert(
    due.map(entry => ({
      user_id: user.id,
      type: entry.type,
      amount: entry.amount,
      category_id: categoryForSlug(categories, entry.slug, entry.type)?.id ?? null,
      description: entry.description,
      merchant: null,
      transaction_date: entry.date,
      payment_method: null,
      notes: null,
      kind: 'regular' as const,
      is_recurring: true,
      source: 'manual' as const,
      external_ref: entry.ref,
      upi_ref: null,
    })),
    {onConflict: 'user_id,external_ref', ignoreDuplicates: true},
  );
  if (error) {
    throw new Error(dataErrorMessage(error));
  }

  await saveScheduledSetup(entries.filter(entry => entry.date > today));
  return due.length;
}
