export type NotificationKind =
  | 'budget_warning'
  | 'budget_exceeded'
  | 'expense_reminder';

/** Where tapping a notification should land the user. */
export type NotificationTarget = 'budget' | 'expense' | 'savings';

export type NotificationPrefs = {
  budgetExceeded: boolean;
  budgetWarning: boolean;
  expenseReminder: boolean;
  /** Minutes after local midnight, e.g. 21:00 is 1260. */
  reminderMinutes: number;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  budgetExceeded: true,
  budgetWarning: true,
  expenseReminder: true,
  reminderMinutes: 21 * 60,
};

export type NotificationItem = {
  /** Unique key, also the OS notification identifier. */
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
  read: boolean;
  target: NotificationTarget;
};

/** Payload carried on every notification Paisa schedules or presents. */
export type NotificationPayload = {
  paisa: 1;
  userId: string;
  id: string;
  kind: NotificationKind;
  target: NotificationTarget;
};

export function targetForKind(kind: NotificationKind): NotificationTarget {
  return kind === 'expense_reminder' ? 'expense' : 'budget';
}
