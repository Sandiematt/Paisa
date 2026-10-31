import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BudgetFlow,
  budgetFlowFor,
  cycleRangeFor,
  nextCycleStart,
} from './budgetEngine';
import {supabase} from './supabase/client';
import {BudgetFlowSource} from './supabase/database.types';
import {isMissingSchema} from './supabase/schema';

/**
 * Where an account stands with the rolling budget: when its spending started
 * to count, and what it said it had spent before that. Kept on the profile
 * row (supabase/migrations/20261030120000_budget_flow.sql) so every device
 * agrees. `version` is the one-time move-over flag.
 */
export const BUDGET_FLOW_VERSION = 1;

export type BudgetFlowState = {
  /** 0 until the account has started the rolling budget. */
  version: number;
  /** First day whose spending counts, `YYYY-MM-DD`. */
  trackingStart: string | null;
  /** Spent before tracking began, for `trackingStart`'s cycle only. */
  alreadySpent: number;
  /** The day the account started (or restarted) this budget. */
  startedOn: string | null;
  source: BudgetFlowSource | null;
};

export const NO_BUDGET_FLOW: BudgetFlowState = {
  version: 0,
  trackingStart: null,
  alreadySpent: 0,
  startedOn: null,
  source: null,
};

export function hasStarted(state: BudgetFlowState | null): state is BudgetFlowState {
  return state !== null && state.version >= BUDGET_FLOW_VERSION && state.trackingStart !== null;
}

/**
 * Where tracking starts for an account starting the budget on `today`, from
 * the date check (handbook 5.5):
 *
 * - on the cycle's first day the whole cycle counts;
 * - mid-cycle, a new account counts from today (earlier days were never in
 *   Paisa) and may say what it already spent; an account moving over counts
 *   the whole cycle, since what it logged this month is real spending;
 * - in the last days the budget waits for the next cycle's first day,
 *   unless the user chose to start now: then it runs like mid-cycle, over
 *   the few days left.
 */
export function startBudgetFlow(
  source: BudgetFlowSource,
  today: string,
  payday?: number | null,
  alreadySpent = 0,
  startNow = false,
): BudgetFlowState {
  const cycle = cycleRangeFor(today, payday);
  const flow = flowForToday(today, payday, startNow);
  const trackingStart =
    flow === 'startNextMonth'
      ? nextCycleStart(today, payday)
      : source === 'migrated' || flow === 'normal'
        ? cycle.start
        : today;
  const spent = Number(alreadySpent);
  return {
    version: BUDGET_FLOW_VERSION,
    trackingStart,
    alreadySpent:
      flow === 'midMonth' && source !== 'migrated' && Number.isFinite(spent) && spent > 0
        ? Math.round(spent * 100) / 100
        : 0,
    startedOn: today,
    source,
  };
}

/**
 * The flow an account starting on `today` gets. In the last days of a cycle
 * the user may choose to start now (`startNow`) instead of waiting for the
 * next one; the budget then runs over the days left, as mid-cycle.
 */
export function flowForToday(
  today: string,
  payday?: number | null,
  startNow = false,
): BudgetFlow {
  const flow = budgetFlowFor(today, cycleRangeFor(today, payday));
  return flow === 'startNextMonth' && startNow ? 'midMonth' : flow;
}

/** Today is in the last days of a cycle, where starting now or next cycle is a choice. */
export function offersStartChoice(today: string, payday?: number | null): boolean {
  return flowForToday(today, payday) === 'startNextMonth';
}

/**
 * The one-time move to the rolling budget for an account that has used
 * Paisa before (handbook 5.3). Nothing it saved changes: the budget, goal
 * and bills stay as they are and only where tracking starts is added.
 * Returns null once it has been moved, so running it again does nothing.
 */
export function migrateLegacyBudget(
  state: BudgetFlowState | null,
  today: string,
  payday?: number | null,
  startNow = false,
): BudgetFlowState | null {
  if (state !== null && state.version >= BUDGET_FLOW_VERSION) {
    return null;
  }
  return startBudgetFlow('migrated', today, payday, 0, startNow);
}

// ---------------------------------------------------------------------------
// Storage

type FlowRow = {
  budget_flow_version: number | null;
  tracking_start: string | null;
  already_spent: number | string | null;
  budget_flow_started_on: string | null;
  budget_flow_source: BudgetFlowSource | null;
};

const cacheKey = (userId: string) => `paisa.budgetFlow.${userId}`;

function fromRow(row: FlowRow): BudgetFlowState {
  const spent = Number(row.already_spent);
  return {
    version: Number(row.budget_flow_version) || 0,
    trackingStart: row.tracking_start ? row.tracking_start.slice(0, 10) : null,
    alreadySpent: Number.isFinite(spent) && spent > 0 ? spent : 0,
    startedOn: row.budget_flow_started_on ? row.budget_flow_started_on.slice(0, 10) : null,
    source: row.budget_flow_source ?? null,
  };
}

/**
 * The account's budget flow, or null when the database does not have the
 * columns yet (the rolling budget then counts the whole current cycle and
 * keeps no month history). Falls back to the last copy on this phone offline.
 */
export async function loadBudgetFlow(userId: string): Promise<BudgetFlowState | null> {
  const {data, error} = await supabase
    .from('profiles')
    .select(
      'budget_flow_version, tracking_start, already_spent, budget_flow_started_on, budget_flow_source',
    )
    .eq('id', userId)
    .maybeSingle();
  if (isMissingSchema(error)) {
    return null;
  }
  if (!error) {
    const state = data ? fromRow(data as FlowRow) : NO_BUDGET_FLOW;
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(state)).catch(() => {});
    return state;
  }
  const cached = await AsyncStorage.getItem(cacheKey(userId)).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as BudgetFlowState;
    } catch {
      // Fall through to "not started".
    }
  }
  throw new Error('Could not load your budget. Check your connection.');
}

export async function saveBudgetFlow(userId: string, state: BudgetFlowState): Promise<void> {
  const {error} = await supabase
    .from('profiles')
    .update({
      budget_flow_version: state.version,
      tracking_start: state.trackingStart,
      already_spent: state.alreadySpent,
      budget_flow_started_on: state.startedOn,
      budget_flow_source: state.source,
    })
    .eq('id', userId);
  if (error && !isMissingSchema(error)) {
    throw error;
  }
  await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(state)).catch(() => {});
}

/**
 * What onboarding learned before the account existed, kept on the auth user
 * until the first time the app opens with it (see MainTabs). It is the
 * date-check answer for one cycle; a later cycle ignores it.
 */
export const PENDING_FLOW_KEY = 'budgetFlowPending';

export type PendingBudgetFlow = {
  /** The cycle the answer was given in, `YYYY-MM-DD` of its first day. */
  cycleStart: string;
  alreadySpent: number;
  /** In the last days of the cycle: start now rather than next cycle. */
  startNow?: boolean;
};

/**
 * The onboarding answer to keep on a new account until it first opens:
 * which cycle it was given in and what was already spent of it.
 */
export function pendingFlowFor(
  alreadySpent: string | undefined,
  today: string,
  payday?: number | null,
  startNow = false,
): PendingBudgetFlow {
  const spent = Number(alreadySpent);
  return {
    cycleStart: cycleRangeFor(today, payday).start,
    alreadySpent: Number.isFinite(spent) && spent > 0 ? spent : 0,
    ...(startNow ? {startNow: true} : {}),
  };
}

export function pendingFlowFrom(metadata: Record<string, unknown> | undefined): PendingBudgetFlow | null {
  const raw = metadata?.[PENDING_FLOW_KEY] as PendingBudgetFlow | undefined;
  if (!raw || typeof raw !== 'object' || typeof raw.cycleStart !== 'string') {
    return null;
  }
  const spent = Number(raw.alreadySpent);
  return {
    cycleStart: raw.cycleStart,
    alreadySpent: Number.isFinite(spent) && spent > 0 ? spent : 0,
    ...(raw.startNow === true ? {startNow: true} : {}),
  };
}

/**
 * The flow a new account starts with on its first open: the onboarding
 * answer applies only while it is still the cycle it was given in.
 */
export function startNewAccountFlow(
  pending: PendingBudgetFlow | null,
  today: string,
  payday?: number | null,
): BudgetFlowState {
  const cycle = cycleRangeFor(today, payday);
  const sameCycle = pending !== null && pending.cycleStart === cycle.start;
  return startBudgetFlow(
    'new',
    today,
    payday,
    sameCycle ? pending.alreadySpent : 0,
    sameCycle && pending.startNow === true,
  );
}
