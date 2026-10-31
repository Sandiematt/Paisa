import React, {useState} from 'react';
import {Alert} from 'react-native';
import {Bell} from 'phosphor-react-native/src/icons/Bell';
import {BellRinging} from 'phosphor-react-native/src/icons/BellRinging';
import {Clock} from 'phosphor-react-native/src/icons/Clock';
import {ClockCountdown} from 'phosphor-react-native/src/icons/ClockCountdown';
import {Percent} from 'phosphor-react-native/src/icons/Percent';
import {Warning} from 'phosphor-react-native/src/icons/Warning';

import {SettingsRow, ToggleSwitch} from '../../components/ui';
import {colors} from '../../theme';
import {openSystemSettings} from '../../lib/notifications/notificationService';
import {formatReminderTime} from '../../lib/notifications/reminders';
import {NotificationPrefs} from '../../lib/notifications/types';
import {NotificationHistorySheet} from '../notifications/NotificationHistorySheet';
import {useNotifications} from '../notifications/NotificationsProvider';
import {TimePickerSheet} from '../notifications/TimePickerSheet';

type ToggleKey = 'budgetExceeded' | 'budgetWarning' | 'expenseReminder';

const ICON_SIZE = 24;

/**
 * Notification preference rows for the "App settings" group, plus the sheets
 * they open. Rows are returned as an array of elements because `SettingsGroup`
 * needs its rows as direct children; render `sheets` anywhere in the screen.
 */
export function useNotificationSettings() {
  const {prefs, updatePrefs, permission, ensurePermission, unreadCount} =
    useNotifications();
  const [timeOpen, setTimeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const blocked = permission === 'denied';

  const toggle = async (key: ToggleKey, next: boolean) => {
    updatePrefs({[key]: next} as Partial<NotificationPrefs>);
    if (!next) {
      return;
    }
    const state = await ensurePermission();
    if (state === 'denied') {
      Alert.alert(
        'Notifications are off',
        'Alerts will still appear in your notification history. To get them on your device too, allow notifications for Paisa in system settings.',
        [
          {text: 'Not now', style: 'cancel'},
          {text: 'Open settings', onPress: openSystemSettings},
        ],
      );
    }
  };

  const toggleRow = (
    key: ToggleKey,
    label: string,
    icon: React.ReactNode,
  ) => (
    <SettingsRow
      key={key}
      icon={icon}
      label={label}
      trailing={
        <ToggleSwitch
          value={prefs[key]}
          onValueChange={next => toggle(key, next)}
          accessibilityLabel={label}
        />
      }
    />
  );

  const rows: React.ReactElement[] = [
    toggleRow(
      'budgetExceeded',
      'Budget exceeded alert',
      <Warning size={ICON_SIZE} color={colors.text} />,
    ),
    toggleRow(
      'budgetWarning',
      '80% budget warning',
      <Percent size={ICON_SIZE} color={colors.text} />,
    ),
    toggleRow(
      'expenseReminder',
      'Daily expense reminder',
      <ClockCountdown size={ICON_SIZE} color={colors.text} />,
    ),
  ];

  if (prefs.expenseReminder) {
    rows.push(
      <SettingsRow
        key="reminderTime"
        icon={<Clock size={ICON_SIZE} color={colors.text} />}
        label="Reminder time"
        value={formatReminderTime(prefs.reminderMinutes)}
        onPress={() => setTimeOpen(true)}
        accessibilityLabel={`Reminder time, ${formatReminderTime(prefs.reminderMinutes)}`}
      />,
    );
  }
  if (blocked) {
    rows.push(
      <SettingsRow
        key="allow"
        icon={<BellRinging size={ICON_SIZE} color={colors.text} />}
        label="Allow notifications"
        value="System settings"
        onPress={openSystemSettings}
      />,
    );
  }
  rows.push(
    <SettingsRow
      key="history"
      icon={<Bell size={ICON_SIZE} color={colors.text} />}
      label="Notification history"
      value={unreadCount > 0 ? `${unreadCount} unread` : undefined}
      onPress={() => setHistoryOpen(true)}
      accessibilityLabel={
        unreadCount > 0
          ? `Notification history, ${unreadCount} unread`
          : 'Notification history'
      }
    />,
  );

  const sheets = (
    <>
      <TimePickerSheet
        visible={timeOpen}
        minutes={prefs.reminderMinutes}
        onSelect={minutes => updatePrefs({reminderMinutes: minutes})}
        onClose={() => setTimeOpen(false)}
      />
      <NotificationHistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );

  return {
    rows,
    sheets,
    blocked,
    /** Shown under the group when the OS has blocked notifications. */
    blockedNote:
      'Paisa is blocked from sending notifications. Alerts still collect in your history.',
  };
}
