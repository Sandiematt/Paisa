import {Linking, Platform} from 'react-native';
import * as Notifications from 'expo-notifications';

import {ReminderSlot, reminderKey} from './reminders';
import {
  NotificationKind,
  NotificationPayload,
  NotificationTarget,
  targetForKind,
} from './types';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

const BUDGET_CHANNEL = 'budget-alerts';
const REMINDER_CHANNEL = 'expense-reminders';
const REMINDER_PREFIX = 'reminder:';

let configured = false;

/** Safe to call repeatedly; sets up the foreground handler and channels. */
export async function configureNotifications(): Promise<void> {
  if (configured) {
    return;
  }
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(BUDGET_CHANNEL, {
      name: 'Budget alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Expense reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

function stateOf(status: Notifications.NotificationPermissionsStatus) {
  if (status.granted) {
    return 'granted' as const;
  }
  return status.canAskAgain && status.status === 'undetermined'
    ? ('undetermined' as const)
    : ('denied' as const);
}

export async function getPermissionState(): Promise<PermissionState> {
  try {
    return stateOf(await Notifications.getPermissionsAsync());
  } catch {
    return 'denied';
  }
}

export async function requestPermissionState(): Promise<PermissionState> {
  try {
    return stateOf(await Notifications.requestPermissionsAsync());
  } catch {
    return 'denied';
  }
}

export function openSystemSettings(): void {
  Linking.openSettings().catch(() => {});
}

function channelFor(kind: NotificationKind): string {
  return kind === 'expense_reminder' ? REMINDER_CHANNEL : BUDGET_CHANNEL;
}

function payloadFor(
  userId: string,
  id: string,
  kind: NotificationKind,
): NotificationPayload {
  return {paisa: 1, userId, id, kind, target: targetForKind(kind)};
}

/**
 * Shows a notification right now. The id doubles as the OS identifier, so a
 * repeat of the same key replaces the banner instead of stacking a second.
 */
export async function presentNotification(input: {
  userId: string;
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
}): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: input.id,
    content: {
      title: input.title,
      body: input.body,
      data: payloadFor(input.userId, input.id, input.kind),
    },
    trigger:
      Platform.OS === 'android' ? {channelId: channelFor(input.kind)} : null,
  });
}

export async function cancelReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(request => request.identifier.startsWith(REMINDER_PREFIX))
      .map(request =>
        Notifications.cancelScheduledNotificationAsync(request.identifier),
      ),
  );
}

export const REMINDER_COPY = {
  title: 'Log today’s expenses',
  body: 'Nothing logged yet today. Add what you spent to keep your budget accurate.',
};

/** Replaces the whole reminder queue with exactly `slots`. */
export async function replaceReminders(
  userId: string,
  slots: readonly ReminderSlot[],
): Promise<void> {
  await cancelReminders();
  for (const slot of slots) {
    const id = reminderKey(userId, slot.day);
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        ...REMINDER_COPY,
        data: payloadFor(userId, id, 'expense_reminder'),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: slot.fireAt,
        channelId: REMINDER_CHANNEL,
      },
    });
  }
}

export type ReceivedNotification = {
  id: string;
  userId: string;
  kind: NotificationKind;
  target: NotificationTarget;
  title: string;
  body: string;
  /** ISO timestamp the OS delivered it. */
  deliveredAt: string;
};

const KINDS: NotificationKind[] = [
  'budget_warning',
  'budget_exceeded',
  'expense_reminder',
];
const TARGETS: NotificationTarget[] = ['budget', 'expense', 'savings'];

/** Reads a Paisa notification, or null for anything foreign or malformed. */
export function parseNotification(
  notification: Notifications.Notification,
): ReceivedNotification | null {
  const {content} = notification.request;
  const data = content.data as Partial<NotificationPayload> | undefined;
  if (
    !data ||
    data.paisa !== 1 ||
    typeof data.userId !== 'string' ||
    typeof data.id !== 'string' ||
    !KINDS.includes(data.kind as NotificationKind) ||
    !TARGETS.includes(data.target as NotificationTarget)
  ) {
    return null;
  }
  return {
    id: data.id,
    userId: data.userId,
    kind: data.kind as NotificationKind,
    target: data.target as NotificationTarget,
    title: content.title ?? '',
    body: content.body ?? '',
    deliveredAt: new Date(notification.date).toISOString(),
  };
}

export async function presentedNotifications(): Promise<
  ReceivedNotification[]
> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    return presented
      .map(parseNotification)
      .filter((item): item is ReceivedNotification => item !== null);
  } catch {
    return [];
  }
}

export function onNotificationReceived(
  listener: (item: ReceivedNotification) => void,
): () => void {
  const subscription = Notifications.addNotificationReceivedListener(event => {
    const parsed = parseNotification(event);
    if (parsed) {
      listener(parsed);
    }
  });
  return () => subscription.remove();
}

export type NotificationTap = ReceivedNotification & {
  /** Distinguishes repeated taps on notifications sharing one identifier. */
  tapKey: string;
};

function tapFrom(
  response: Notifications.NotificationResponse,
): NotificationTap | null {
  if (
    response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
  ) {
    return null;
  }
  const parsed = parseNotification(response.notification);
  if (!parsed) {
    return null;
  }
  return {
    ...parsed,
    tapKey: `${response.notification.request.identifier}@${response.notification.date}`,
  };
}

export function onNotificationTap(
  listener: (tap: NotificationTap) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    response => {
      const tap = tapFrom(response);
      if (tap) {
        listener(tap);
      }
    },
  );
  return () => subscription.remove();
}

/** The tap that launched the app from a closed state, if any. */
export async function launchTap(): Promise<NotificationTap | null> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    return response ? tapFrom(response) : null;
  } catch {
    return null;
  }
}
