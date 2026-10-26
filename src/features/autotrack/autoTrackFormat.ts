import {
  DailyAllowance,
  DetectedTxn,
  DetectorStatus,
  UPI_APP_NAMES,
} from '../../lib/autotrack/types';
import {localDateISO} from '../../lib/transactionsStore';
import {colors} from '../../theme';

/** Most payments the dashboard lists; older ones stay in the detector's store. */
export const MAX_LISTED_PAYMENTS = 50;
/** Most log lines the diagnostics panel shows (native returns newest first). */
export const MAX_LOG_LINES = 100;

export type AutoTrackState = 'checking' | 'active' | 'needs-permission' | 'unavailable';

/** Where auto-tracking stands, from platform support and the two permissions. */
export function autoTrackState(
  supported: boolean,
  status: DetectorStatus | null,
): AutoTrackState {
  if (!supported) {
    return 'unavailable';
  }
  if (!status) {
    return 'checking';
  }
  return status.accessibilityEnabled && status.notificationAccessEnabled
    ? 'active'
    : 'needs-permission';
}

export type PaymentPill = {
  label:
    | 'Synced'
    | 'Pending sync'
    | 'Not synced'
    | 'Needs review'
    | 'Failed'
    | 'Pending';
  /** Text and accent colour; the pill's wash is this colour at low alpha. */
  color: string;
};

/** The status pill for one detected payment. */
export function paymentPill(item: DetectedTxn): PaymentPill {
  if (item.status === 'FAILED') {
    return {label: 'Failed', color: colors.roseLight};
  }
  if (item.status === 'PENDING') {
    return {label: 'Pending', color: colors.gold};
  }
  if (item.flag) {
    return {label: 'Needs review', color: colors.gold};
  }
  // A payment whose direction was not readable is never uploaded.
  if (item.direction === 'UNKNOWN' && !item.synced) {
    return {label: 'Not synced', color: colors.muted};
  }
  if (item.synced && !item.dirty) {
    return {label: 'Synced', color: colors.mint};
  }
  return {label: 'Pending sync', color: colors.lavender};
}

export function appName(packageName: string): string {
  return UPI_APP_NAMES[packageName] ?? 'UPI app';
}

export function paymentTitle(item: DetectedTxn): string {
  return item.merchant?.trim() || appName(item.sourceApp);
}

/** Signed payment amount: credits positive, debits negative, unknown direction unsigned. */
export function signedAmount(item: DetectedTxn): number {
  const value = Math.abs(Number(item.amount));
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (item.direction === 'CREDIT') {
    return value;
  }
  if (item.direction === 'DEBIT') {
    return -value;
  }
  return value;
}

export function formatClock(millis: number): string {
  return new Date(millis).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export type PaymentGroup = {
  date: string;
  label: string;
  items: DetectedTxn[];
};

function dayLabel(isoDate: string, now: Date): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (delta === 0) {
    return 'Today';
  }
  if (delta === 1) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The newest `limit` payments, grouped by the local day they were detected,
 * newest day first and newest payment first inside a day.
 */
export function groupPayments(
  items: readonly DetectedTxn[],
  now = new Date(),
  limit = MAX_LISTED_PAYMENTS,
): PaymentGroup[] {
  const newest = [...items]
    .sort((a, b) => b.detectedAtMillis - a.detectedAtMillis)
    .slice(0, limit);
  const groups: PaymentGroup[] = [];
  for (const item of newest) {
    const date = localDateISO(new Date(item.detectedAtMillis));
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.items.push(item);
    } else {
      groups.push({date, label: dayLabel(date, now), items: [item]});
    }
  }
  return groups;
}

/** "Last synced 2:14 PM", with the date when it was not today. */
export function lastSyncLabel(lastSyncAt: number | null, now = new Date()): string {
  if (lastSyncAt === null) {
    return 'Not synced yet';
  }
  const at = new Date(lastSyncAt);
  const sameDay = localDateISO(at) === localDateISO(now);
  const clock = formatClock(lastSyncAt);
  if (sameDay) {
    return `Last synced ${clock}`;
  }
  const date = at.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  return `Last synced ${date}, ${clock}`;
}

/** Fraction of this week's budget already spent (today included), 0 to 1. */
export function weekProgress(allowance: DailyAllowance): number {
  const spent = allowance.spentWeekBeforeToday + allowance.spentToday;
  if (allowance.weekBudget <= 0) {
    return spent > 0 ? 1 : 0;
  }
  return Math.max(0, Math.min(1, spent / allowance.weekBudget));
}

export function daysLabel(days: number, suffix: string): string {
  return `${days} ${days === 1 ? 'day' : 'days'} ${suffix}`;
}
