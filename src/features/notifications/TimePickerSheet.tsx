import React, {useEffect, useState} from 'react';
import {Platform, StyleSheet, View} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';

import {AppText, PressableScale} from '../../components/ui';
import {formatReminderTime} from '../../lib/notifications/reminders';
import {colors, layout, radii, spacing} from '../../theme';
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
      <AppText variant="body" color={colors.inkSecondary} style={styles.lead}>
        Paisa reminds you at this time on days you haven’t logged an expense.
      </AppText>

      <View style={styles.preview}>
        <AppText variant="display">{formatReminderTime(chosen)}</AppText>
      </View>

      <DateTimePicker
        mode="time"
        display="spinner"
        value={dateAt(chosen)}
        onChange={(_event, date) => {
          if (date) {
            setChosen(minutesOf(date));
          }
        }}
      />

      <PressableScale
        onPress={() => {
          onSelect(chosen);
          onClose();
        }}
        scaleTo={0.98}
        accessibilityRole="button"
        style={styles.doneBtn}>
        <AppText variant="bodyStrong" color={colors.onInk}>
          Done
        </AppText>
      </PressableScale>
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
  doneBtn: {
    height: layout.controlHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
});
