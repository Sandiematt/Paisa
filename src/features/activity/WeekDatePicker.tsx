import React, {useEffect, useMemo, useRef} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {CalendarBlank, CaretLeft, CaretRight} from 'phosphor-react-native';

import {PressableScale, Text} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {formatMoney} from '../../lib/formatMoney';
import {localDateISO} from '../../lib/transactionsStore';
import {colors, fonts, layout, radii, withAlpha} from '../../theme';
import {ActivityTransaction} from './types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
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
const tabular = {fontVariant: ['tabular-nums'] as const};
const DAY_W = 54;
const DAY_GAP = 8;
const DAY_SLOT = DAY_W + DAY_GAP;

type WeekDatePickerProps = {
  selected: Date;
  onSelect: (date: Date) => void;
  dayItems: ActivityTransaction[];
  currencySymbol: string;
};

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function clampDay(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

function shiftMonth(date: Date, delta: number): Date {
  return clampDay(date.getFullYear(), date.getMonth() + delta, date.getDate());
}

function shiftYear(date: Date, delta: number): Date {
  return clampDay(date.getFullYear() + delta, date.getMonth(), date.getDate());
}

function weekdayLabel(date: Date): string {
  const index = date.getDay() === 0 ? 6 : date.getDay() - 1;
  return WEEKDAYS[index] ?? '';
}

function monthDays(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const last = new Date(year, month + 1, 0).getDate();
  return Array.from(
    {length: last},
    (_, index) => new Date(year, month, index + 1),
  );
}

function summaryCopy(items: ActivityTransaction[], date: Date): string {
  const weekday = date.toLocaleDateString('en-US', {weekday: 'short'});
  const month = date.toLocaleDateString('en-US', {month: 'short'});
  const stamp = `${weekday}, ${month} ${date.getDate()}`;
  if (items.length === 0) {
    return `${stamp} · No activity`;
  }
  const expenses = items.filter(item => item.kind === 'expense').length;
  const income = items.length - expenses;
  if (expenses && income) {
    return `${stamp} · ${items.length} transactions`;
  }
  if (income) {
    return `${stamp} · ${income} income`;
  }
  return `${stamp} · ${expenses} ${expenses === 1 ? 'expense' : 'expenses'}`;
}

export function WeekDatePicker({
  selected,
  onSelect,
  dayItems,
  currencySymbol,
}: WeekDatePickerProps) {
  const reducedMotion = useReducedMotion();
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const viewport = useRef(0);
  const days = useMemo(() => monthDays(selected), [selected]);
  const selectedIndex = Math.max(0, selected.getDate() - 1);
  const total = dayItems.reduce((sum, item) => sum + item.amount, 0);
  const tone =
    total > 0 ? colors.mint : total < 0 ? colors.roseLight : colors.muted;

  const scrollToSelected = (animated: boolean) => {
    const width = viewport.current;
    if (width <= 0) {
      return;
    }
    const pad = layout.screenPadding;
    const center = pad + selectedIndex * DAY_SLOT + DAY_W / 2;
    const maxX = Math.max(0, days.length * DAY_SLOT - DAY_GAP + pad * 2 - width);
    const x = Math.min(maxX, Math.max(0, center - width / 2));
    scroller.current?.scrollTo({x, animated});
  };

  useEffect(() => {
    scrollToSelected(!reducedMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, reducedMotion, selectedIndex]);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.monthWrap}>
          <View style={styles.calSquare}>
            <CalendarBlank size={16} color={colors.lavender} weight="bold" />
          </View>
          <View style={styles.titleCol}>
            <Text
              fontFamily={fonts.jakartaBold}
              fontSize={16}
              lineHeight={21}
              letterSpacing={-0.1}
              color={colors.text}>
              {MONTHS[selected.getMonth()]}
            </Text>
            <View style={styles.yearRow}>
              <PressableScale
                scaleTo={0.94}
                onPress={() => onSelect(shiftYear(selected, -1))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Previous year"
                style={styles.yearBtn}>
                <CaretLeft size={12} color={colors.muted} weight="bold" />
              </PressableScale>
              <Text
                fontFamily={fonts.jakartaSemiBold}
                fontSize={12}
                lineHeight={16}
                color={colors.muted}
                style={tabular}>
                {String(selected.getFullYear())}
              </Text>
              <PressableScale
                scaleTo={0.94}
                onPress={() => onSelect(shiftYear(selected, 1))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Next year"
                style={styles.yearBtn}>
                <CaretRight size={12} color={colors.muted} weight="bold" />
              </PressableScale>
            </View>
          </View>
        </View>
        <View style={styles.nav}>
          <PressableScale
            scaleTo={0.94}
            onPress={() => onSelect(shiftMonth(selected, -1))}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={styles.navBtn}>
            <CaretLeft size={16} color={colors.text} weight="bold" />
          </PressableScale>
          <PressableScale
            scaleTo={0.94}
            onPress={() => onSelect(shiftMonth(selected, 1))}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            style={styles.navBtn}>
            <CaretRight size={16} color={colors.text} weight="bold" />
          </PressableScale>
        </View>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={DAY_SLOT}
        snapToAlignment="start"
        disableIntervalMomentum
        onLayout={event => {
          viewport.current = event.nativeEvent.layout.width;
          scrollToSelected(false);
        }}
        style={styles.weekScroll}
        contentContainerStyle={styles.week}
        accessibilityRole="adjustable"
        accessibilityLabel="Days of the month"
        accessibilityHint="Scroll to pick an earlier or later day">
        {days.map(day => {
          const active = sameDay(day, selected);
          return (
            <PressableScale
              key={localDateISO(day)}
              scaleTo={0.96}
              onPress={() => onSelect(day)}
              accessibilityRole="button"
              accessibilityState={{selected: active}}
              accessibilityLabel={day.toDateString()}
              containerStyle={styles.dayHit}
              style={[styles.dayFace, active && styles.dayOn]}>
              <Text
                fontFamily={active ? fonts.jakartaSemiBold : fonts.jakartaMedium}
                fontSize={12}
                lineHeight={16}
                color={active ? withAlpha(colors.ground, 0.7) : colors.muted}>
                {weekdayLabel(day)}
              </Text>
              <Text
                fontFamily={fonts.jakartaBold}
                fontSize={18}
                lineHeight={24}
                color={active ? colors.ground : colors.text}
                style={tabular}>
                {day.getDate()}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      <View style={styles.summary}>
        <View style={styles.summaryLabel}>
          <View style={[styles.dot, {backgroundColor: tone}]} />
          <Text
            fontFamily={fonts.jakartaMedium}
            fontSize={13}
            lineHeight={18}
            color={colors.muted}
            numberOfLines={1}>
            {summaryCopy(dayItems, selected)}
          </Text>
        </View>
        <Text
          fontFamily={fonts.jakartaBold}
          fontSize={15}
          lineHeight={20}
          color={tone}
          style={tabular}>
          {dayItems.length === 0
            ? formatMoney(0, currencySymbol)
            : formatMoney(total, currencySymbol, {signed: true})}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
  },
  monthWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    flex: 1,
  },
  titleCol: {
    minWidth: 0,
    gap: 1,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  yearBtn: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calSquare: {
    width: 36,
    height: 36,
    borderRadius: radii.iconSquareSm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.violet, 0.18),
    borderWidth: 1,
    borderColor: withAlpha(colors.lavender, 0.25),
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  weekScroll: {
    flexGrow: 0,
  },
  week: {
    flexDirection: 'row',
    marginTop: 14,
    gap: DAY_GAP,
    paddingHorizontal: layout.screenPadding,
  },
  dayHit: {
    width: DAY_W,
  },
  dayFace: {
    width: DAY_W,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: radii.tile,
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayOn: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingHorizontal: layout.screenPadding,
    gap: 8,
  },
  summaryLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
});
