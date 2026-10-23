import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationItem,
  NotificationPrefs,
} from './types';

const prefsKey = (userId: string) => `sikka.notifications.prefs.${userId}`;
const historyKey = (userId: string) => `sikka.notifications.history.${userId}`;
const handledKey = (userId: string) => `sikka.notifications.handled.${userId}`;
const PERMISSION_ASKED_KEY = 'sikka.notifications.permissionAsked';

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function asMinutes(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < 24 * 60
    ? value
    : DEFAULT_NOTIFICATION_PREFS.reminderMinutes;
}

function asFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export async function loadNotificationPrefs(
  userId: string,
): Promise<NotificationPrefs> {
  const stored = await readJson<Partial<NotificationPrefs>>(prefsKey(userId));
  const defaults = DEFAULT_NOTIFICATION_PREFS;
  return {
    budgetExceeded: asFlag(stored?.budgetExceeded, defaults.budgetExceeded),
    budgetWarning: asFlag(stored?.budgetWarning, defaults.budgetWarning),
    expenseReminder: asFlag(stored?.expenseReminder, defaults.expenseReminder),
    reminderMinutes: asMinutes(stored?.reminderMinutes),
  };
}

export async function saveNotificationPrefs(
  userId: string,
  prefs: NotificationPrefs,
): Promise<void> {
  await AsyncStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
}

export async function loadNotificationHistory(
  userId: string,
): Promise<NotificationItem[]> {
  const stored = await readJson<NotificationItem[]>(historyKey(userId));
  return Array.isArray(stored)
    ? stored.filter(item => item && typeof item.id === 'string')
    : [];
}

export async function saveNotificationHistory(
  userId: string,
  items: readonly NotificationItem[],
): Promise<void> {
  await AsyncStorage.setItem(historyKey(userId), JSON.stringify(items));
}

/**
 * Keys of budget alerts already handled, with the time they were. Kept apart
 * from the visible history so clearing the list never re-fires an alert.
 */
export async function loadHandledKeys(
  userId: string,
): Promise<Record<string, string>> {
  const stored = await readJson<Record<string, string>>(handledKey(userId));
  return stored && typeof stored === 'object' && !Array.isArray(stored)
    ? stored
    : {};
}

export async function saveHandledKeys(
  userId: string,
  handled: Record<string, string>,
): Promise<void> {
  await AsyncStorage.setItem(handledKey(userId), JSON.stringify(handled));
}

export async function wasPermissionAsked(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PERMISSION_ASKED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markPermissionAsked(): Promise<void> {
  try {
    await AsyncStorage.setItem(PERMISSION_ASKED_KEY, '1');
  } catch {
    // Asking again next launch is harmless.
  }
}

export async function clearNotificationData(userId: string): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(prefsKey(userId)),
    AsyncStorage.removeItem(historyKey(userId)),
    AsyncStorage.removeItem(handledKey(userId)),
  ]);
}
