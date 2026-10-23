import React, {useState} from 'react';
import {Alert, Switch} from 'react-native';

import {BellGlyph, CalendarGlyph} from '../../components/icons/Glyphs';
import {colors} from '../../theme';
import {openSystemSettings} from '../../lib/notifications/notificationService';
import {formatReminderTime} from '../../lib/notifications/reminders';
import {NotificationPrefs} from '../../lib/notifications/types';
import {NotificationHistorySheet} from '../notifications/NotificationHistorySheet';
import {useNotifications} from '../notifications/NotificationsProvider';
import {TimePickerSheet} from '../notifications/TimePickerSheet';
import {SettingsRow} from './SettingsRow';
import {SettingsSection} from './SettingsSection';

const ICON = '#6F6553';

type ToggleKey = 'budgetExceeded' | 'budgetWarning' | 'expenseReminder';

export function NotificationsSettingsSection() {
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

  const toggleRow = (key: ToggleKey, label: string, subtitle: string) => (
    <SettingsRow
      label={label}
      subtitle={subtitle}
      kind="toggle"
      accessory={
        <Switch
          value={prefs[key]}
          onValueChange={next => toggle(key, next)}
          trackColor={{false: 'rgba(0,0,0,0.08)', true: colors.accent}}
          thumbColor="#FFFFFF"
          ios_backgroundColor="rgba(0,0,0,0.08)"
          accessibilityLabel={`${label}, ${prefs[key] ? 'on' : 'off'}`}
        />
      }
    />
  );

  return (
    <>
      <SettingsSection
        title="Notifications"
        footer={
          blocked
            ? 'Paisa is blocked from sending notifications. Alerts still collect in your history.'
            : undefined
        }>
        {toggleRow(
          'budgetExceeded',
          'Budget exceeded',
          'When this month’s spending passes your budget',
        )}
        {toggleRow(
          'budgetWarning',
          '80% budget warning',
          'Once, when spending reaches 80% of your budget',
        )}
        {toggleRow(
          'expenseReminder',
          'Daily expense reminder',
          'If nothing is logged by your reminder time',
        )}
        {prefs.expenseReminder ? (
          <SettingsRow
            icon={<CalendarGlyph color={ICON} size={16} />}
            label="Reminder time"
            value={formatReminderTime(prefs.reminderMinutes)}
            kind="nav"
            onPress={() => setTimeOpen(true)}
          />
        ) : null}
        {blocked ? (
          <SettingsRow
            label="Allow notifications"
            subtitle="Open system settings"
            kind="nav"
            onPress={openSystemSettings}
          />
        ) : null}
        <SettingsRow
          icon={<BellGlyph color={ICON} size={16} />}
          label="Notification history"
          value={unreadCount > 0 ? `${unreadCount} unread` : undefined}
          kind="nav"
          last
          onPress={() => setHistoryOpen(true)}
        />
      </SettingsSection>

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
}
