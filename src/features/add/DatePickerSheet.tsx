import React, {useEffect, useMemo, useState} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {AppText, PrimaryButton} from '../../components/ui';
import {colors, layout, radii, spacing} from '../../theme';

type DatePickerSheetProps = {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onChange: (date: Date) => void;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function clampDay(year: number, monthIndex: number, day: number): Date {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, last));
}

function monthWeeks(month: Date): (Date | null)[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDate = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells: (Date | null)[] = Array.from(
    {length: first.getDay()},
    () => null,
  );
  for (let day = 1; day <= lastDate; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  const weeks: (Date | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

export function DatePickerSheet({
  visible,
  value,
  onClose,
  onChange,
}: DatePickerSheetProps) {
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const [month, setMonth] = useState(() => startOfDay(value));
  const [draft, setDraft] = useState(() => startOfDay(value));

  useEffect(() => {
    if (!visible) {
      return;
    }
    setMonth(startOfDay(value));
    setDraft(startOfDay(value));
  }, [value, visible]);

  const weeks = useMemo(() => monthWeeks(month), [month]);
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const cellSize = Math.floor(
    (width - layout.screenPadding * 2 - spacing.sm * 6) / 7,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md},
          ]}>
          <View style={styles.handle} />
          <AppText variant="heading">Date</AppText>

          <View style={styles.quick}>
            <Pressable
              onPress={() => {
                setDraft(today);
                setMonth(today);
              }}
              accessibilityRole="button"
              accessibilityLabel="Today"
              style={[
                styles.quickChip,
                sameDay(draft, today) && styles.quickChipOn,
              ]}>
              <AppText
                variant="bodyStrong"
                color={sameDay(draft, today) ? colors.onInk : colors.ink}>
                Today
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => {
                setDraft(yesterday);
                setMonth(yesterday);
              }}
              accessibilityRole="button"
              accessibilityLabel="Yesterday"
              style={[
                styles.quickChip,
                sameDay(draft, yesterday) && styles.quickChipOn,
              ]}>
              <AppText
                variant="bodyStrong"
                color={sameDay(draft, yesterday) ? colors.onInk : colors.ink}>
                Yesterday
              </AppText>
            </Pressable>
          </View>

          <View style={styles.monthRow}>
            <Pressable
              onPress={() => {
                const next = shiftMonth(month, -1);
                setMonth(next);
                setDraft(current =>
                  clampDay(next.getFullYear(), next.getMonth(), current.getDate()),
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={styles.monthBtn}>
              <AppText variant="heading">{'‹'}</AppText>
            </Pressable>
            <AppText variant="bodyStrong">
              {MONTHS[month.getMonth()]}
            </AppText>
            <Pressable
              onPress={() => {
                const next = shiftMonth(month, 1);
                setMonth(next);
                setDraft(current =>
                  clampDay(next.getFullYear(), next.getMonth(), current.getDate()),
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={styles.monthBtn}>
              <AppText variant="heading">{'›'}</AppText>
            </Pressable>
          </View>

          <View style={styles.monthRow}>
            <Pressable
              onPress={() => {
                const year = month.getFullYear() - 1;
                setMonth(current => new Date(year, current.getMonth(), 1));
                setDraft(current =>
                  clampDay(year, current.getMonth(), current.getDate()),
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Previous year"
              style={styles.monthBtn}>
              <AppText variant="heading">{'‹'}</AppText>
            </Pressable>
            <AppText variant="bodyStrong">{String(month.getFullYear())}</AppText>
            <Pressable
              onPress={() => {
                const year = month.getFullYear() + 1;
                setMonth(current => new Date(year, current.getMonth(), 1));
                setDraft(current =>
                  clampDay(year, current.getMonth(), current.getDate()),
                );
              }}
              accessibilityRole="button"
              accessibilityLabel="Next year"
              style={styles.monthBtn}>
              <AppText variant="heading">{'›'}</AppText>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((day, index) => (
              <View
                key={`${day}-${index}`}
                style={[styles.cell, {width: cellSize, height: 28}]}>
                <AppText variant="caption" color={colors.inkMuted} align="center">
                  {day}
                </AppText>
              </View>
            ))}
          </View>

          {weeks.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} style={styles.weekRow}>
              {week.map((cell, dayIndex) => {
                if (!cell) {
                  return (
                    <View
                      key={`empty-${weekIndex}-${dayIndex}`}
                      style={[styles.cell, {width: cellSize, height: cellSize}]}
                    />
                  );
                }
                const selected = sameDay(cell, draft);
                const isToday = sameDay(cell, today);
                return (
                  <Pressable
                    key={cell.toISOString()}
                    onPress={() => setDraft(cell)}
                    accessibilityRole="button"
                    accessibilityState={{selected}}
                    accessibilityLabel={cell.toDateString()}
                    style={[
                      styles.cell,
                      {
                        width: cellSize,
                        height: cellSize,
                        borderRadius: cellSize / 2,
                      },
                      selected && styles.cellOn,
                      !selected && isToday && styles.cellToday,
                    ]}>
                    <AppText
                      variant="bodyStrong"
                      color={selected ? colors.onInk : colors.ink}
                      align="center">
                      {String(cell.getDate())}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <View style={styles.confirm}>
            <PrimaryButton
              label="Use this date"
              style={styles.confirmButton}
              onPress={() => {
                onChange(draft);
                onClose();
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(21, 20, 18, 0.28)',
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.hairlineStrong,
    marginBottom: spacing.xl,
  },
  quick: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  quickChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  quickChipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellOn: {
    backgroundColor: colors.ink,
  },
  cellToday: {
    backgroundColor: colors.accentSoft,
  },
  confirm: {
    marginTop: spacing.xl,
  },
  confirmButton: {
    width: '100%',
  },
});
