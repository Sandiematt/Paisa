import React, {useMemo, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {SearchGlyph} from '../../components/icons/Glyphs';
import {AppText, Screen, TogglePill} from '../../components/ui';
import {formatMoney} from '../../lib/formatMoney';
import {colors, layout, radii, spacing} from '../../theme';
import {useFloatingNavClearance, useFloatingNavScroll} from '../NavBar/FloatingNavScroll';
import {SAMPLE_TRANSACTIONS} from './sampleTransactions';
import {ActivityFilter, ActivityTransaction} from './types';

const FILTERS: {id: ActivityFilter; label: string}[] = [
  {id: 'all', label: 'All'},
  {id: 'expenses', label: 'Expenses'},
  {id: 'income', label: 'Income'},
  {id: 'recurring', label: 'Recurring'},
];

type ActivityScreenProps = {
  currencySymbol: string;
};

type DayGroup = {
  date: string;
  label: string;
  total: number;
  items: ActivityTransaction[];
};

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatGroupLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const today = startOfDay(new Date());
  const then = startOfDay(date);
  const delta = Math.round((today - then) / 86400000);

  if (delta === 0) {
    return 'Today';
  }
  if (delta === 1) {
    return 'Yesterday';
  }

  return date
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    .toUpperCase();
}

function matchesQuery(item: ActivityTransaction, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = [
    item.merchant,
    item.category,
    item.account,
    item.note,
    String(Math.abs(item.amount)),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function matchesFilter(
  item: ActivityTransaction,
  filter: ActivityFilter,
): boolean {
  switch (filter) {
    case 'expenses':
      return item.kind === 'expense';
    case 'income':
      return item.kind === 'income';
    case 'recurring':
      return item.recurring;
    default:
      return true;
  }
}

export function ActivityScreen({currencySymbol}: ActivityScreenProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const navClearance = useFloatingNavClearance();
  const navScroll = useFloatingNavScroll();

  const normalizedQuery = query.trim().toLowerCase();

  const visible = useMemo(
    () =>
      SAMPLE_TRANSACTIONS.filter(
        item =>
          matchesFilter(item, filter) && matchesQuery(item, normalizedQuery),
      ),
    [filter, normalizedQuery],
  );

  const groups = useMemo(() => {
    const byDate = new Map<string, ActivityTransaction[]>();
    visible.forEach(item => {
      const list = byDate.get(item.date) ?? [];
      list.push(item);
      byDate.set(item.date, list);
    });

    return Array.from(byDate.entries()).map(
      ([date, items]): DayGroup => ({
        date,
        label: formatGroupLabel(date),
        total: items.reduce((sum, item) => sum + item.amount, 0),
        items,
      }),
    );
  }, [visible]);

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <AppText variant="display">Activity</AppText>
        <AppText variant="label" color={colors.inkMuted}>
          {visible.length} of {SAMPLE_TRANSACTIONS.length}
        </AppText>
      </View>

      <View style={styles.search}>
        <SearchGlyph color={colors.inkMuted} size={16} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search merchants, notes, amounts"
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
          accessibilityLabel="Search activity"
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filterRow}>
        {FILTERS.map(item => (
          <TogglePill
            key={item.id}
            label={item.label}
            selected={filter === item.id}
            onPress={() => setFilter(item.id)}
          />
        ))}
      </ScrollView>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {paddingBottom: spacing.xxl + navClearance},
        ]}
        onScroll={navScroll.onScroll}
        scrollEventThrottle={navScroll.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {groups.length === 0 ? (
          <View style={styles.empty}>
            <AppText variant="heading" align="center">
              No matching activity
            </AppText>
            <AppText
              variant="body"
              color={colors.inkSecondary}
              align="center"
              style={styles.emptyCopy}>
              Try a different search or filter.
            </AppText>
          </View>
        ) : (
          groups.map(group => (
            <View key={group.date} style={styles.group}>
              <View style={styles.groupHeader}>
                <AppText variant="caption" color={colors.inkMuted} style={styles.groupLabel}>
                  {group.label}
                </AppText>
                <AppText
                  variant="caption"
                  color={group.total >= 0 ? colors.positive : colors.inkMuted}
                  style={styles.groupTotal}>
                  {formatMoney(group.total, currencySymbol, {signed: true})}
                </AppText>
              </View>

              {group.items.map(item => (
                <TransactionRow
                  key={item.id}
                  item={item}
                  currencySymbol={currencySymbol}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function TransactionRow({
  item,
  currencySymbol,
}: {
  item: ActivityTransaction;
  currencySymbol: string;
}) {
  const income = item.kind === 'income';

  return (
    <View
      style={styles.row}
      accessibilityRole="text"
      accessibilityLabel={`${item.merchant}, ${item.category}, ${formatMoney(
        item.amount,
        currencySymbol,
        {signed: true},
      )}`}>
      <View style={styles.rowCopy}>
        <View style={styles.nameRow}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {item.merchant}
          </AppText>
          {item.recurring ? (
            <View style={styles.badge}>
              <AppText variant="caption" color={colors.inkMuted} style={styles.badgeLabel}>
                Repeats
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
          {item.category} · {item.account}
        </AppText>
      </View>
      <AppText
        variant="bodyStrong"
        color={income ? colors.positive : colors.ink}
        style={styles.amount}>
        {formatMoney(item.amount, currencySymbol, {signed: true})}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  search: {
    marginTop: spacing.lg,
    marginHorizontal: layout.screenPadding,
    height: 48,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    color: colors.ink,
    fontSize: 15,
    letterSpacing: -0.1,
  },
  filterRow: {
    flexGrow: 0,
    marginTop: spacing.md,
  },
  filters: {
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
  empty: {
    paddingTop: spacing.section,
    paddingHorizontal: spacing.xl,
  },
  emptyCopy: {
    marginTop: spacing.sm,
  },
  group: {
    marginTop: spacing.xl,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  groupLabel: {
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  groupTotal: {
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  rowCopy: {
    flex: 1,
    marginRight: spacing.md,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  name: {
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSunk,
  },
  badgeLabel: {
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontSize: 10,
    lineHeight: 14,
  },
  amount: {
    fontVariant: ['tabular-nums'],
  },
});
