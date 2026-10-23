import {addDays} from '../../features/home/homeReport';
import {
  TransactionRow,
  isLedgerSpecial,
  localDateISO,
} from '../transactionsStore';

/**
 * Local notifications cannot check "did the user log anything?" at fire time,
 * so a one-shot reminder is queued for each of the next few days and rebuilt
 * whenever the app opens or a transaction changes. If the app is never opened
 * again the queue runs out after this many days rather than nagging forever.
 */
export const REMINDER_HORIZON_DAYS = 7;

export type ReminderSlot = {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  fireAt: Date;
};

export function reminderKey(userId: string, day: string): string {
  return `reminder:${userId}:${day}`;
}

/**
 * True when the user logged a real expense on `day`, either dated that day or
 * entered that day (a backdated entry still counts as logging).
 */
export function hasExpenseOnDay(
  transactions: readonly TransactionRow[],
  day: string,
): boolean {
  return transactions.some(row => {
    if (row.type !== 'expense' || isLedgerSpecial(row)) {
      return false;
    }
    if (row.transactionDate === day) {
      return true;
    }
    const created = new Date(row.createdAt);
    return !Number.isNaN(created.getTime()) && localDateISO(created) === day;
  });
}

export function planReminders(input: {
  now: Date;
  minutes: number;
  transactions: readonly TransactionRow[];
  horizon?: number;
}): ReminderSlot[] {
  const {now, minutes, transactions, horizon = REMINDER_HORIZON_DAYS} = input;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const slots: ReminderSlot[] = [];

  for (let offset = 0; offset < horizon; offset += 1) {
    const date = addDays(now, offset);
    const fireAt = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hour,
      minute,
    );
    if (fireAt.getTime() <= now.getTime()) {
      continue;
    }
    const day = localDateISO(date);
    // Only today can be ruled out; future days are unknown until they happen.
    if (offset === 0 && hasExpenseOnDay(transactions, day)) {
      continue;
    }
    slots.push({day, fireAt});
  }
  return slots;
}

export function formatReminderTime(minutes: number): string {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}
