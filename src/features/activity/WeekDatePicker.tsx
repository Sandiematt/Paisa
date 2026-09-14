import React, {useEffect, useMemo, useRef} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {Text} from '@tamagui/core';

import {CalendarGlyph} from '../../components/icons/Glyphs';
import {GlassPanel, PressableScale} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {formatMoney} from '../../lib/formatMoney';
import {localDateISO} from '../../lib/transactionsStore';
import {colors, fonts, radii, shadows} from '../../theme';
import {ActivityTransaction} from './types';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
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
const DAY_W = 44;
const DAY_GAP = 4;
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

function Chevron({color, flip}: {color: string; flip?: boolean}) {
  return (
    <View
      style={{
        width: 14,
        height: 14,
        transform: flip ? [{scaleX: -1}] : undefined,
      }}>
      <View
        style={{
          position: 'absolute',
          width: 8,
          height: 1.8,
          borderRadius: 1,
          backgroundColor: color,
          top: 3.6,
          left: 3,
          transform: [{rotate: '-40deg'}],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: 8,
          height: 1.8,
          borderRadius: 1,
          backgroundColor: color,
          top: 8.4,
          left: 3,
          transform: [{rotate: '40deg'}],
        }}
      />
    </View>
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
  const scroller = useRef<ScrollView>(null);
  const viewport = useRef(0);
  const days = useMemo(() => monthDays(selected), [selected]);
  const selectedIndex = Math.max(0, selected.getDate() - 1);
  const total = dayItems.reduce((sum, item) => sum + item.amount, 0);
  const tone =
    total > 0 ? colors.positive : total < 0 ? colors.coral : colors.inkMuted;

  const scrollToSelected = (animated: boolean) => {
    const width = viewport.current;
    if (width <= 0) {
      return;
    }
    const center = selectedIndex * DAY_SLOT + DAY_W / 2;
    const maxX = Math.max(0, days.length * DAY_SLOT - DAY_GAP - width);
    const x = Math.min(maxX, Math.max(0, center - width / 2));
    scroller.current?.scrollTo({x, animated});
  };

  useEffect(() => {
    scrollToSelected(!reducedMotion);
  }, [days, reducedMotion, selectedIndex]);

  return (
    <GlassPanel
      intensity="xl"
      overlayColor={colors.glass}
      radius={22}
      style={[styles.wrap, shadows.cardSoft]}
      contentStyle={styles.inner}>
      <View style={styles.header}>
        <View style={styles.monthWrap}>
          <View style={styles.calDisc}>
            <CalendarGlyph color={colors.gold} size={14} />
          </View>
          <View style={styles.titleCol}>
            <Text
              fontFamily={fonts.outfitSemi}
              fontSize={15}
              lineHeight={20}
              fontWeight="600"
              letterSpacing={-0.2}
              color={colors.ink}>
              {MONTHS[selected.getMonth()]}
            </Text>
            <View style={styles.yearRow}>
              <PressableScale
                scaleTo={0.94}
                onPress={() => onSelect(shiftYear(selected, -1))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Previous year"
                style={styles.yearBtn}>
                <Chevron color={colors.inkMuted} />
              </PressableScale>
              <Text
                fontFamily={fonts.interSemi}
                fontSize={12}
                lineHeight={16}
                fontWeight="600"
                color={colors.inkSecondary}
                style={tabular}>
                {String(selected.getFullYear())}
              </Text>
              <PressableScale
                scaleTo={0.94}
                onPress={() => onSelect(shiftYear(selected, 1))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Next year"
                style={styles.yearBtn}>
                <Chevron color={colors.inkMuted} flip />
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
            <Chevron color={colors.inkSecondary} />
          </PressableScale>
          <PressableScale
            scaleTo={0.94}
            onPress={() => onSelect(shiftMonth(selected, 1))}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            style={styles.navBtn}>
            <Chevron color={colors.inkSecondary} flip />
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
                fontFamily={fonts.interMedium}
                fontSize={11}
                lineHeight={14}
                fontWeight="500"
                color={active ? 'rgba(255,255,255,0.7)' : colors.inkMuted}>
                {weekdayLabel(day)}
              </Text>
              <Text
                fontFamily={fonts.outfitSemi}
                fontSize={14}
                lineHeight={18}
                fontWeight="600"
                color={active ? colors.onInk : colors.ink}>
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
            fontFamily={fonts.interMedium}
            fontSize={12}
            lineHeight={16}
            fontWeight="500"
            color={colors.inkSecondary}
            numberOfLines={1}>
            {summaryCopy(dayItems, selected)}
          </Text>
        </View>
        <Text
          fontFamily={fonts.outfitSemi}
          fontSize={15}
          lineHeight={20}
          fontWeight="600"
          color={tone}
          style={tabular}>
          {dayItems.length === 0
            ? formatMoney(0, currencySymbol)
            : formatMoney(total, currencySymbol, {signed: true})}
        </Text>
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 14,
    marginHorizontal: 20,
  },
  inner: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  titleCol: {
    minWidth: 0,
    gap: 2,
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
  calDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C88A2E33',
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  week: {
    flexDirection: 'row',
    marginTop: 14,
    gap: DAY_GAP,
    paddingRight: 2,
  },
  dayHit: {
    width: DAY_W,
  },
  dayFace: {
    width: DAY_W,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 8,
    borderRadius: 16,
    gap: 4,
  },
  dayOn: {
    backgroundColor: colors.ink,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.05)',
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
