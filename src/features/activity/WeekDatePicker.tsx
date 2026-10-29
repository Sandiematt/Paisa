import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ScrollView, View} from 'react-native';
import {
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
} from 'phosphor-react-native';

import {PressableScale, Text} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {formatMoney} from '../../lib/formatMoney';
import {localDateISO} from '../../lib/transactionsStore';
import {colors, fonts, layout, makeStyles, palettes, radii, withAlpha} from '../../theme';
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
const DAY_W = 56;
const DAY_GAP = 8;
const DAY_SLOT = DAY_W + DAY_GAP;

type WeekDatePickerProps = {
  selected: Date;
  onSelect: (date: Date) => void;
  dayItems: ActivityTransaction[];
  currencySymbol: string;
  /** Net total per local ISO date (YYYY-MM-DD). Drives the dots and day totals. */
  daySummaries?: Record<string, number>;
  /** When true the list below ignores the date, so the summary says so. */
  searching?: boolean;
};

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function clampDay(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, last));
}

function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
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

function compactAmount(value: number): string {
  const abs = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  if (abs >= 1000000) {
    return `${sign}${(abs / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${sign}${Math.round(abs)}`;
}

function toneFor(total: number): string {
  return total > 0 ? colors.mint : total < 0 ? colors.roseLight : colors.muted;
}

function dateHeading(date: Date, today: Date): string {
  const delta = Math.round(
    (startOfDay(today).getTime() - startOfDay(date).getTime()) / 86400000,
  );
  const stamp = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
  if (delta === 0) {
    return `Today · ${stamp}`;
  }
  if (delta === 1) {
    return `Yesterday · ${stamp}`;
  }
  if (delta === -1) {
    return `Tomorrow · ${stamp}`;
  }
  return stamp;
}

function countCopy(items: ActivityTransaction[]): string {
  if (items.length === 0) {
    return 'No activity';
  }
  return `${items.length} ${items.length === 1 ? 'transaction' : 'transactions'}`;
}

export function WeekDatePicker({
  selected,
  onSelect,
  dayItems,
  currencySymbol,
  daySummaries,
  searching = false,
}: WeekDatePickerProps) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const viewport = useRef(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(selected.getFullYear());

  const today = new Date();
  const todayStart = startOfDay(today);
  const isToday = sameDay(selected, today);
  const days = useMemo(() => monthDays(selected), [selected]);
  const selectedIndex = Math.max(0, selected.getDate() - 1);
  const total = dayItems.reduce((sum, item) => sum + item.amount, 0);
  const tone = toneFor(total);
  const viewingCurrentMonth = monthIndex(selected) >= monthIndex(today);
  const monthLabel = `${MONTHS[selected.getMonth()]} ${selected.getFullYear()}`;
  const yearAtLimit = pickerYear >= today.getFullYear();

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

  const stepMonth = (delta: number) => {
    const next = clampDay(
      selected.getFullYear(),
      selected.getMonth() + delta,
      selected.getDate(),
    );
    // Landing in the current month never jumps past today.
    onSelect(next > todayStart ? todayStart : next);
  };

  const togglePicker = () => {
    if (!pickerOpen) {
      setPickerYear(selected.getFullYear());
    }
    setPickerOpen(open => !open);
  };

  const chooseMonth = (month: number) => {
    const next = clampDay(pickerYear, month, selected.getDate());
    onSelect(next > todayStart ? todayStart : next);
    setPickerOpen(false);
  };

  const goToday = () => {
    onSelect(todayStart);
    setPickerOpen(false);
  };

  const summaryTone = searching ? colors.muted : tone;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <PressableScale
          scaleTo={0.97}
          onPress={togglePicker}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${monthLabel}. Choose month and year`}
          accessibilityState={{expanded: pickerOpen}}
          containerStyle={styles.monthBtnWrap}
          style={[styles.monthBtn, pickerOpen && styles.monthBtnOpen]}>
          <CalendarBlank size={16} color={colors.lavender} weight="bold" />
          <Text
            fontFamily={fonts.jakartaBold}
            fontSize={16}
            lineHeight={21}
            letterSpacing={-0.1}
            color={colors.text}
            numberOfLines={1}
            style={styles.monthText}>
            {monthLabel}
          </Text>
          {pickerOpen ? (
            <CaretUp size={14} color={colors.muted} weight="bold" />
          ) : (
            <CaretDown size={14} color={colors.muted} weight="bold" />
          )}
        </PressableScale>

        <View style={styles.nav}>
          {!isToday ? (
            <PressableScale
              scaleTo={0.94}
              onPress={goToday}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Jump to today"
              style={styles.todayBtn}>
              <Text
                fontFamily={fonts.jakartaBold}
                fontSize={12}
                lineHeight={16}
                color={colors.lavender}>
                Today
              </Text>
            </PressableScale>
          ) : null}
          <PressableScale
            scaleTo={0.94}
            onPress={() => stepMonth(-1)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={styles.navBtn}>
            <CaretLeft size={16} color={colors.text} weight="bold" />
          </PressableScale>
          <PressableScale
            scaleTo={0.94}
            onPress={() => stepMonth(1)}
            disabled={viewingCurrentMonth}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{disabled: viewingCurrentMonth}}
            style={[styles.navBtn, viewingCurrentMonth && styles.disabled]}>
            <CaretRight size={16} color={colors.text} weight="bold" />
          </PressableScale>
        </View>
      </View>

      {pickerOpen ? (
        <View style={styles.picker}>
          <View style={styles.yearRow}>
            <PressableScale
              scaleTo={0.94}
              onPress={() => setPickerYear(year => year - 1)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Previous year, ${pickerYear - 1}`}
              style={styles.navBtn}>
              <CaretLeft size={16} color={colors.text} weight="bold" />
            </PressableScale>
            <Text
              fontFamily={fonts.jakartaBold}
              fontSize={18}
              lineHeight={24}
              color={colors.text}
              accessibilityRole="header"
              style={tabular}>
              {String(pickerYear)}
            </Text>
            <PressableScale
              scaleTo={0.94}
              onPress={() => setPickerYear(year => year + 1)}
              disabled={yearAtLimit}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Next year, ${pickerYear + 1}`}
              accessibilityState={{disabled: yearAtLimit}}
              style={[styles.navBtn, yearAtLimit && styles.disabled]}>
              <CaretRight size={16} color={colors.text} weight="bold" />
            </PressableScale>
          </View>
          <View style={styles.monthGrid}>
            {MONTHS.map((name, month) => {
              const future = pickerYear * 12 + month > monthIndex(today);
              const active =
                pickerYear === selected.getFullYear() &&
                month === selected.getMonth();
              const current =
                pickerYear === today.getFullYear() &&
                month === today.getMonth();
              return (
                <PressableScale
                  key={name}
                  scaleTo={0.96}
                  onPress={() => chooseMonth(month)}
                  disabled={future}
                  accessibilityRole="button"
                  accessibilityLabel={`${name} ${pickerYear}${
                    current ? ', this month' : ''
                  }`}
                  accessibilityState={{selected: active, disabled: future}}
                  containerStyle={styles.monthCell}
                  style={[
                    styles.monthFace,
                    current && styles.monthCurrent,
                    active && styles.dayOn,
                    future && styles.disabled,
                  ]}>
                  <Text
                    fontFamily={
                      active ? fonts.jakartaBold : fonts.jakartaSemiBold
                    }
                    fontSize={14}
                    lineHeight={20}
                    color={active ? colors.ground : colors.text}>
                    {name.slice(0, 3)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}

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
        accessibilityLabel={`Days of ${monthLabel}`}>
        {days.map(day => {
          const active = sameDay(day, selected);
          const isTodayTile = sameDay(day, today);
          const future = day > todayStart;
          const iso = localDateISO(day);
          const net = daySummaries?.[iso];
          const has = net !== undefined;
          const dayTone = toneFor(net ?? 0);
          const money = formatMoney(net ?? 0, currencySymbol, {signed: true});
          return (
            <PressableScale
              key={iso}
              scaleTo={0.96}
              onPress={() => onSelect(day)}
              disabled={future}
              accessibilityRole="button"
              accessibilityState={{selected: active, disabled: future}}
              accessibilityLabel={`${day.toDateString()}${
                isTodayTile ? ', today' : ''
              }${has ? `, net ${money}` : ', no activity'}`}
              containerStyle={styles.dayHit}
              style={[
                styles.dayFace,
                isTodayTile && !active && styles.dayToday,
                active && styles.dayOn,
                future && styles.futureDay,
              ]}>
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
              <View style={styles.dayFoot}>
                {has ? (
                  <>
                    <View
                      style={[
                        styles.tinyDot,
                        {backgroundColor: active ? colors.ground : dayTone},
                      ]}
                    />
                    <Text
                      fontFamily={fonts.jakartaSemiBold}
                      fontSize={10}
                      lineHeight={13}
                      color={active ? colors.ground : dayTone}
                      numberOfLines={1}
                      style={tabular}>
                      {compactAmount(net ?? 0)}
                    </Text>
                  </>
                ) : null}
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>

      <View
        style={styles.summary}
        accessible
        accessibilityLabel={
          searching
            ? 'Search results across all dates'
            : `Showing ${dateHeading(selected, today)}. ${countCopy(dayItems)}`
        }>
        <View style={styles.summaryLabel}>
          <View style={[styles.dot, {backgroundColor: summaryTone}]} />
          <Text
            fontFamily={fonts.jakartaBold}
            fontSize={13}
            lineHeight={18}
            color={colors.text}
            numberOfLines={1}
            style={styles.summaryText}>
            {searching
              ? 'Search results · all dates'
              : dateHeading(selected, today)}
            {searching ? null : (
              <Text
                fontFamily={fonts.jakartaMedium}
                fontSize={13}
                lineHeight={18}
                color={colors.muted}>
                {` · ${countCopy(dayItems)}`}
              </Text>
            )}
          </Text>
        </View>
        {searching ? null : (
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
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(palette => ({
  wrap: {
    marginTop: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    gap: 8,
  },
  monthBtnWrap: {
    flexShrink: 1,
  },
  monthBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  monthBtnOpen: {
    borderColor: colors.lavender,
  },
  monthText: {
    flexShrink: 1,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.violet, 0.18),
    borderWidth: 1,
    borderColor: withAlpha(colors.lavender, 0.35),
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
  disabled: {
    // 0.35 of a dark glyph on a light tile all but vanishes.
    opacity: palette === palettes.light ? 0.5 : 0.35,
  },
  picker: {
    marginTop: 12,
    marginHorizontal: layout.screenPadding,
    padding: 12,
    gap: 12,
    borderRadius: radii.tile,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthCell: {
    width: '23.5%',
  },
  monthFace: {
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  monthCurrent: {
    borderColor: colors.lavender,
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
    paddingBottom: 8,
    borderRadius: radii.tile,
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayToday: {
    borderColor: colors.lavender,
  },
  dayOn: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  futureDay: {
    opacity: palette === palettes.light ? 0.55 : 0.35,
  },
  dayFoot: {
    height: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tinyDot: {
    width: 4,
    height: 4,
    borderRadius: radii.pill,
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
  summaryText: {
    flexShrink: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
}));
