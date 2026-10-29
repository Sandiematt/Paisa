import React, {useEffect, useMemo, useState} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {CaretDown, CaretLeft, CaretRight, CaretUp} from 'phosphor-react-native';

import {AppText, PressableScale, PrimaryButton} from '../../components/ui';
import {colors, layout, makeStyles, palettes, radii, spacing} from '../../theme';
import {
  isAfterDay,
  longDateLabel,
  monthHasPastDays,
  MONTHS,
  monthWeeks,
  quickPicks,
  relativeDayLabel,
  sameDay,
  shiftMonth,
  shortDateLabel,
  startOfDay,
  startOfMonth,
  WEEKDAYS,
} from './datePickerModel';

type DatePickerSheetProps = {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onChange: (date: Date) => void;
};

const MAX_CELL = 44;

/**
 * Picks the day a transaction happened. The header always says which day is
 * chosen; browsing months never changes it; future days cannot be picked.
 * Tapping the month name switches to a month-and-year grid for big jumps.
 */
export function DatePickerSheet({
  visible,
  value,
  onClose,
  onChange,
}: DatePickerSheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(() => startOfMonth(value));
  const [draft, setDraft] = useState(() => startOfDay(value));
  const [choosingMonth, setChoosingMonth] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setMonth(startOfMonth(value));
    setDraft(startOfDay(value));
    setChoosingMonth(false);
  }, [value, visible]);

  const weeks = useMemo(() => monthWeeks(month), [month]);
  const canGoForward = monthHasPastDays(shiftMonth(month, 1), today);
  const cellSize = Math.min(
    MAX_CELL,
    Math.floor((width - layout.screenPadding * 2) / 7),
  );
  const relative = relativeDayLabel(draft, today);

  const pick = (date: Date) => {
    setDraft(startOfDay(date));
    setMonth(startOfMonth(date));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.layer}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close date picker"
        />
        <View
          style={[
            styles.sheet,
            {paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md},
          ]}>
          <View style={styles.handle} />

          <View style={styles.header} accessibilityLiveRegion="polite">
            <AppText variant="caption" color={colors.muted}>
              {relative ? `Date · ${relative}` : 'Date'}
            </AppText>
            <AppText
              variant="title"
              color={colors.text}
              accessibilityRole="header">
              {longDateLabel(draft, today)}
            </AppText>
          </View>

          <View style={styles.quick}>
            {quickPicks(today).map(option => {
              const on = sameDay(draft, option.date);
              return (
                <PressableScale
                  key={option.label}
                  onPress={() => pick(option.date)}
                  scaleTo={0.96}
                  accessibilityRole="radio"
                  accessibilityState={{selected: on}}
                  accessibilityLabel={option.label}
                  style={[styles.quickChip, on && styles.quickChipOn]}>
                  <AppText
                    variant="label"
                    color={on ? colors.onAccent : colors.inkSecondary}>
                    {option.label}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>

          <View style={styles.monthRow}>
            <PressableScale
              onPress={() =>
                choosingMonth
                  ? setMonth(current => shiftMonth(current, -12))
                  : setMonth(current => shiftMonth(current, -1))
              }
              scaleTo={0.92}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={
                choosingMonth ? 'Previous year' : 'Previous month'
              }
              style={styles.navBtn}>
              <CaretLeft size={16} color={colors.text} weight="bold" />
            </PressableScale>

            <PressableScale
              onPress={() => setChoosingMonth(current => !current)}
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityState={{expanded: choosingMonth}}
              accessibilityLabel={
                choosingMonth
                  ? `Showing months of ${month.getFullYear()}. Back to days`
                  : `${
                      MONTHS[month.getMonth()]
                    } ${month.getFullYear()}. Choose month and year`
              }
              style={styles.monthTitle}>
              <AppText variant="bodyStrong" color={colors.text}>
                {choosingMonth
                  ? String(month.getFullYear())
                  : `${MONTHS[month.getMonth()]} ${month.getFullYear()}`}
              </AppText>
              {choosingMonth ? (
                <CaretUp size={12} color={colors.lavender} weight="bold" />
              ) : (
                <CaretDown size={12} color={colors.lavender} weight="bold" />
              )}
            </PressableScale>

            <PressableScale
              onPress={() =>
                choosingMonth
                  ? setMonth(current => shiftMonth(current, 12))
                  : setMonth(current => shiftMonth(current, 1))
              }
              disabled={
                choosingMonth
                  ? month.getFullYear() >= today.getFullYear()
                  : !canGoForward
              }
              scaleTo={0.92}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={choosingMonth ? 'Next year' : 'Next month'}
              style={[
                styles.navBtn,
                (choosingMonth
                  ? month.getFullYear() >= today.getFullYear()
                  : !canGoForward) && styles.navBtnOff,
              ]}>
              <CaretRight size={16} color={colors.text} weight="bold" />
            </PressableScale>
          </View>

          {choosingMonth ? (
            <View style={styles.monthGrid}>
              {MONTHS.map((name, index) => {
                const candidate = new Date(month.getFullYear(), index, 1);
                const future = !monthHasPastDays(candidate, today);
                const current = index === month.getMonth();
                return (
                  <PressableScale
                    key={name}
                    onPress={() => {
                      setMonth(candidate);
                      setChoosingMonth(false);
                    }}
                    disabled={future}
                    scaleTo={0.96}
                    accessibilityRole="button"
                    accessibilityState={{disabled: future, selected: current}}
                    accessibilityLabel={`${name} ${month.getFullYear()}`}
                    containerStyle={styles.monthCell}
                    style={[
                      styles.monthChip,
                      current && styles.monthChipOn,
                      future && styles.dayOff,
                    ]}>
                    <AppText
                      variant="label"
                      color={current ? colors.onAccent : colors.inkSecondary}>
                      {name.slice(0, 3)}
                    </AppText>
                  </PressableScale>
                );
              })}
            </View>
          ) : (
            <View>
              <View style={styles.weekRow}>
                {WEEKDAYS.map(day => (
                  <View key={day} style={[styles.cell, {width: cellSize}]}>
                    <AppText
                      variant="caption"
                      color={colors.muted}
                      align="center">
                      {day.slice(0, 1)}
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
                          style={{width: cellSize, height: cellSize}}
                        />
                      );
                    }
                    const selected = sameDay(cell, draft);
                    const isToday = sameDay(cell, today);
                    const future = isAfterDay(cell, today);
                    return (
                      <Pressable
                        key={cell.toISOString()}
                        onPress={() => setDraft(cell)}
                        disabled={future}
                        accessibilityRole="button"
                        accessibilityState={{selected, disabled: future}}
                        accessibilityLabel={`${longDateLabel(cell, today)}${
                          isToday ? ', today' : ''
                        }`}
                        style={[
                          styles.cell,
                          {
                            width: cellSize,
                            height: cellSize,
                            borderRadius: cellSize / 2,
                          },
                          selected && styles.dayOn,
                          !selected && isToday && styles.dayToday,
                          future && styles.dayOff,
                        ]}>
                        <AppText
                          variant="bodyStrong"
                          color={
                            selected
                              ? colors.onAccent
                              : isToday
                              ? colors.lavender
                              : colors.text
                          }
                          align="center">
                          {String(cell.getDate())}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          <View style={styles.confirm}>
            <PrimaryButton
              label={`Use ${shortDateLabel(draft, today)}`}
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

const useStyles = makeStyles(palette => {
  const light = palette === palettes.light;
  // The sheet is white in light mode, so white chips would sit on white.
  const chipFill = light ? colors.ground : colors.surface;
  return {
  layer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.hairlineStrong,
    marginBottom: spacing.lg,
  },
  header: {
    gap: 2,
  },
  quick: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  quickChip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: chipFill,
  },
  quickChipOn: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  monthTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: chipFill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  navBtnOff: {
    opacity: light ? 0.5 : 0.35,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayOn: {
    backgroundColor: colors.violet,
  },
  dayToday: {
    borderWidth: 1,
    borderColor: colors.lavender,
  },
  dayOff: {
    opacity: light ? 0.4 : 0.3,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  monthCell: {
    width: '33.333%',
    padding: spacing.xs,
  },
  monthChip: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.tile,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: chipFill,
  },
  monthChipOn: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  confirm: {
    marginTop: spacing.xl,
  },
  confirmButton: {
    width: '100%',
  },
};
});
