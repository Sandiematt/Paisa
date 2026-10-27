import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {MagnifyingGlass, XCircle} from 'phosphor-react-native';

import {
  Card,
  PressableScale,
  Screen,
  Text,
} from '../../components/ui';
import {formatMoney} from '../../lib/formatMoney';
import {recurringRootId} from '../../lib/recurring';
import {CategoryRow} from '../../lib/categoriesStore';
import {
  TransactionRow,
  dateFromCalendarISO,
  deleteTransaction,
  duplicateTransaction,
  localDateISO,
  updateTransaction,
} from '../../lib/transactionsStore';
import {colors, fonts, layout, radii} from '../../theme';
import {useFloatingNavClearance, useFloatingNavDockHeight, useFloatingNavScroll} from '../NavBar/FloatingNavScroll';
import {ActivitySkeleton} from './ActivitySkeleton';
import {FloatingReceipt} from './FloatingReceipt';
import {
  ledgerForActivity,
  matchesFilter,
  matchesQuery,
  searchTokens,
} from './mapActivity';
import {SwipeableTxnRow} from './SwipeableTxnRow';
import {ActivityFilter, ActivityTransaction} from './types';
import {WeekDatePicker} from './WeekDatePicker';
import {useTutorialTarget} from '../tutorial/TutorialProvider';

const FILTERS: {id: ActivityFilter; label: string}[] = [
  {id: 'all', label: 'All'},
  {id: 'expenses', label: 'Expenses'},
  {id: 'income', label: 'Income'},
  {id: 'recurring', label: 'Recurring'},
];

const tabular = {fontVariant: ['tabular-nums'] as const};

type ActivityScreenProps = {
  currencySymbol: string;
  filter: ActivityFilter;
  onFilterChange: (filter: ActivityFilter) => void;
  transactions: TransactionRow[];
  categories: CategoryRow[];
  refreshing: boolean;
  reload: () => void;
  onUpsert: (row: TransactionRow) => void;
  onRemove: (id: string) => void;
  onEdit: (row: TransactionRow) => void;
  focusDate?: string | null;
  /** First load of the ledger: shows skeleton rows instead of the empty state. */
  loading?: boolean;
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

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function ActivityScreen({
  currencySymbol,
  filter,
  onFilterChange,
  transactions,
  categories,
  refreshing,
  reload,
  onUpsert,
  onRemove,
  onEdit,
  focusDate,
  loading = false,
}: ActivityScreenProps) {
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchTarget = useTutorialTarget('activity.search');
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const navClearance = useFloatingNavClearance();
  const navDockHeight = useFloatingNavDockHeight();
  const navScroll = useFloatingNavScroll();

  useEffect(() => {
    if (!focusDate) {
      return;
    }
    setSelectedDate(dateFromCalendarISO(focusDate));
  }, [focusDate]);

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;
  const highlight = useMemo(() => searchTokens(query), [query]);
  const ledger = useMemo(
    () => ledgerForActivity(transactions, categories),
    [categories, transactions],
  );

  const filtered = useMemo(
    () => ledger.filter(item => matchesFilter(item, filter)),
    [filter, ledger],
  );

  const matches = useMemo(
    () => filtered.filter(item => matchesQuery(item, normalizedQuery)),
    [filtered, normalizedQuery],
  );

  const selectedISO = localDateISO(selectedDate);
  const dayItems = useMemo(
    () =>
      filtered.filter(
        item =>
          item.date === selectedISO && matchesQuery(item, normalizedQuery),
      ),
    [filtered, normalizedQuery, selectedISO],
  );

  const daySummaries = useMemo(() => {
    const totals: Record<string, number> = {};
    filtered.forEach(item => {
      totals[item.date] = (totals[item.date] ?? 0) + item.amount;
    });
    return totals;
  }, [filtered]);

  const listed = searching ? matches : dayItems;

  const groups = useMemo(() => {
    const byDate = new Map<string, ActivityTransaction[]>();
    listed.forEach(item => {
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
  }, [listed]);

  const run = useCallback(
    async (work: () => Promise<TransactionRow | void>, failed: string) => {
      try {
        const saved = await work();
        if (saved) {
          onUpsert(saved);
        }
        reload();
      } catch (caught) {
        Alert.alert(
          failed,
          caught instanceof Error ? caught.message : 'Try again in a moment.',
        );
        reload();
      }
    },
    [onUpsert, reload],
  );

  const onDelete = useCallback(
    (item: ActivityTransaction) => {
      Alert.alert(
        `Delete ${item.merchant}?`,
        'This removes the transaction from your ledger. It cannot be undone.',
        [
          {text: 'Keep', style: 'cancel'},
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              onRemove(item.id);
              run(async () => {
                await deleteTransaction(item.id);
              }, 'Could not delete');
            },
          },
        ],
      );
    },
    [onRemove, run],
  );

  return (
    <Screen edges={['top']} glow bottomInset={navDockHeight}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text
            fontFamily={fonts.jakartaMedium}
            fontSize={13}
            lineHeight={18}
            color={colors.muted}>
            Recent activity
          </Text>
          <Text
            fontFamily={fonts.jakartaBold}
            fontSize={26}
            lineHeight={32}
            letterSpacing={-0.5}
            color={colors.text}
            accessibilityRole="header">
            Activity
          </Text>
        </View>
        <View
          style={styles.countPill}
          accessibilityLabel={`Showing ${listed.length} of ${filtered.length}`}>
          <Text
            fontFamily={fonts.jakartaSemiBold}
            fontSize={12}
            lineHeight={16}
            color={colors.muted}
            style={tabular}>
            {listed.length} of {filtered.length}
          </Text>
        </View>
      </View>

      <View
        ref={searchTarget}
        collapsable={false}
        style={[styles.searchWrap, searchFocused && styles.searchWrapFocused]}>
        <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search merchants, notes, amounts"
          placeholderTextColor={colors.muted}
          selectionColor={colors.lavender}
          style={styles.searchInput}
          accessibilityLabel="Search activity"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
        />
        {searching ? (
          <PressableScale
            scaleTo={0.94}
            onPress={() => setQuery('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search">
            <XCircle size={18} color={colors.muted} weight="fill" />
          </PressableScale>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={styles.filterRow}>
        {FILTERS.map(item => {
          const selected = filter === item.id;
          return (
            <PressableScale
              key={item.id}
              scaleTo={0.96}
              onPress={() => onFilterChange(item.id)}
              accessibilityRole="radio"
              accessibilityState={{selected}}
              accessibilityLabel={item.label}
              style={[styles.filterPill, selected && styles.filterOn]}>
              <Text
                fontFamily={
                  selected ? fonts.jakartaBold : fonts.jakartaMedium
                }
                fontSize={13}
                lineHeight={18}
                color={selected ? colors.ground : colors.muted}>
                {item.label}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      <WeekDatePicker
        selected={selectedDate}
        onSelect={setSelectedDate}
        dayItems={dayItems}
        currencySymbol={currencySymbol}
        daySummaries={daySummaries}
        searching={searching}
      />

      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {paddingBottom: navClearance - navDockHeight + 8},
        ]}
        onScroll={navScroll.onScroll}
        onScrollBeginDrag={() => {
          if (openRowId) {
            setOpenRowId(null);
          }
        }}
        scrollEventThrottle={navScroll.scrollEventThrottle}
        directionalLockEnabled
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={reload}
            tintColor={colors.text}
            colors={[colors.violet]}
            progressBackgroundColor={colors.surfaceRaised}
          />
        }>
        {loading && groups.length === 0 ? (
          <ActivitySkeleton />
        ) : groups.length === 0 ? (
          <Card radius={radii.cardHero} padding={0} style={styles.emptyCard}>
            <View style={styles.emptyInner}>
              <FloatingReceipt />
              <Text
                fontFamily={fonts.jakartaBold}
                fontSize={18}
                lineHeight={24}
                letterSpacing={-0.3}
                color={colors.text}
                textAlign="center">
                {ledger.length === 0
                  ? 'Nothing here yet'
                  : searching
                    ? 'No matching activity'
                    : 'Nothing on this day'}
              </Text>
              <Text
                fontFamily={fonts.jakartaMedium}
                fontSize={13}
                lineHeight={19}
                color={colors.muted}
                textAlign="center">
                {ledger.length === 0
                  ? 'Add an expense or income and it will land in this list.'
                  : searching
                    ? 'Try a different search or filter.'
                    : 'Pick another day, or add something for this one.'}
              </Text>
            </View>
          </Card>
        ) : (
          groups.map(group => (
            <Card
              key={group.date}
              radius={radii.card}
              padding={0}
              style={styles.group}>
              <View style={styles.groupHeader}>
                <Text
                  fontFamily={fonts.jakartaBold}
                  fontSize={15}
                  lineHeight={20}
                  letterSpacing={-0.1}
                  color={colors.text}
                  accessibilityRole="header">
                  {group.label}
                </Text>
                <Text
                  fontFamily={fonts.jakartaBold}
                  fontSize={13}
                  lineHeight={18}
                  color={group.total >= 0 ? colors.mint : colors.roseLight}
                  style={tabular}>
                  {formatMoney(group.total, currencySymbol, {signed: true})}
                </Text>
              </View>
              {group.items.map(item => (
                <SwipeableTxnRow
                  key={item.id}
                  item={item}
                  highlight={highlight}
                  currencySymbol={currencySymbol}
                  open={openRowId === item.id}
                  onOpen={() => setOpenRowId(item.id)}
                  onClose={() =>
                    setOpenRowId(current =>
                      current === item.id ? null : current,
                    )
                  }
                  onEdit={() => item.source && onEdit(item.source)}
                  onDelete={() => onDelete(item)}
                  onToggleRecurring={() =>
                    run(async () => {
                      const next = !item.recurring;
                      // A saved copy belongs to a series; turning it off ends
                      // the series, or the next month would add it again.
                      const rootId = item.source
                        ? recurringRootId(item.source)
                        : null;
                      if (rootId && !next) {
                        const root = transactions.find(
                          row => row.id === rootId,
                        );
                        if (root?.isRecurring) {
                          onUpsert(
                            await updateTransaction(rootId, {
                              isRecurring: false,
                            }),
                          );
                        }
                      }
                      return updateTransaction(item.id, {isRecurring: next});
                    }, 'Could not update')
                  }
                  onDuplicate={() =>
                    run(
                      () => duplicateTransaction(item.source!),
                      'Could not duplicate',
                    )
                  }
                />
              ))}
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: 8,
  },
  titleBlock: {
    gap: 2,
  },
  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchWrap: {
    marginTop: 18,
    marginHorizontal: layout.screenPadding,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchWrapFocused: {
    borderColor: colors.lavender,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    color: colors.text,
    fontFamily: fonts.jakartaMedium,
    fontSize: 14,
  },
  filterRow: {
    flexGrow: 0,
    marginTop: 14,
  },
  filters: {
    paddingHorizontal: layout.screenPadding,
    gap: 8,
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterOn: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  list: {
    flex: 1,
    marginTop: 18,
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    gap: 14,
  },
  group: {
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  emptyCard: {
    marginTop: 4,
  },
  emptyInner: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
});
