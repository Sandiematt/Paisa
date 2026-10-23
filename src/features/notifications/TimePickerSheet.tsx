import React, {useEffect, useState} from 'react';
import {Platform, StyleSheet, View} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';

import {AppText, PrimaryButton} from '../../components/ui';
import {formatReminderTime} from '../../lib/notifications/reminders';
import {colors, spacing} from '../../theme';
import {SheetFrame} from '../profile/ProfileSheets';

type TimePickerSheetProps = {
  visible: boolean;
  /** Minutes after local midnight. */
  minutes: number;
  onSelect: (minutes: number) => void;
  onClose: () => void;
};

function dateAt(minutes: number): Date {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Daily reminder time. Android shows the system clock dialog; iOS shows a
 * wheel inside a sheet.
 */
export function TimePickerSheet({
  visible,
  minutes,
  onSelect,
  onClose,
}: TimePickerSheetProps) {
  const [chosen, setChosen] = useState(minutes);

  useEffect(() => {
    if (visible) {
      setChosen(minutes);
    }
  }, [minutes, visible]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) {
      return;
    }
    DateTimePickerAndroid.open({
      mode: 'time',
      display: 'clock',
      is24Hour: false,
      value: dateAt(minutes),
      onChange: (event, date) => {
        if (event.type === 'set' && date) {
          onSelect(minutesOf(date));
        }
        onClose();
      },
      onError: onClose,
    });
    // Open once per showing; the dialog owns its own state afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (Platform.OS === 'android') {
    return null;
  }

  return (
    <SheetFrame visible={visible} title="Reminder time" onClose={onClose}>
      <AppText variant="body" color={colors.muted} style={styles.lead}>
        Paisa reminds you at this time on days you haven’t logged an expense.
      </AppText>

      <View style={styles.preview}>
        <AppText variant="display" accessibilityLiveRegion="polite">
          {formatReminderTime(chosen)}
        </AppText>
      </View>

      <DateTimePicker
        mode="time"
        display="spinner"
        themeVariant="dark"
        textColor={colors.text}
        value={dateAt(chosen)}
        onChange={(_event, date) => {
          if (date) {
            setChosen(minutesOf(date));
          }
        }}
      />

      <PrimaryButton
        label="Done"
        style={styles.action}
        onPress={() => {
          onSelect(chosen);
          onClose();
        }}
      />
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  lead: {
    marginBottom: spacing.lg,
    marginHorizontal: spacing.xs,
  },
  preview: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  action: {
    marginTop: spacing.md,
  },
});
