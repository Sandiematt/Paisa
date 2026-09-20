import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {SearchGlyph} from '../../components/icons/Glyphs';
import {GlassPanel, PressableScale, Screen, Text} from '../../components/ui';
import {formatMoney} from '../../lib/formatMoney';
import {CategoryRow} from '../../lib/categoriesStore';
import {
  TransactionRow,
  dateFromCalendarISO,
  deleteTransaction,
  duplicateTransaction,
  localDateISO,
  updateTransaction,
} from '../../lib/transactionsStore';
import {colors, fonts, layout, radii, shadows} from '../../theme';
import {CategoryDisc} from '../add/categoryIcons';
import {HomeAmbient} from '../home/HomeAmbient';
import {useFloatingNavClearance, useFloatingNavDockHeight, useFloatingNavScroll} from '../NavBar/FloatingNavScroll';
import {ledgerForActivity, matchesFilter, matchesQuery} from './mapActivity';
import {SwipeableTxnRow} from './SwipeableTxnRow';
import {ActivityFilter, ActivityTransaction} from './types';
import {WeekDatePicker} from './WeekDatePicker';

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
    return 'TODAY';
  }
  if (delta === 1) {
    return 'YESTERDAY';
  }

  return date
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    .toUpperCase();
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
}: ActivityScreenProps) {
  const [query, setQuery] = useState('');
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
    <Screen edges={['top']} backdrop={<HomeAmbient />} bottomInset={navDockHeight}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text
            fontFamily={fonts.interMedium}
            fontSize={13}
            lineHeight={18}
            fontWeight="500"
            color={colors.inkSoft}>
            Recent activity
          </Text>
          <Text
            fontFamily={fonts.outfitSemi}
            fontSize={26}
            lineHeight={32}
            fontWeight="600"
            letterSpacing={-0.65}
            color={colors.ink}>
            Activity
          </Text>
        </View>
        <GlassPanel
          intensity="md"
          overlayColor="#FFFFFFCC"
          radius={radii.pill}
          style={shadows.avatar}
          contentStyle={styles.countFace}>
          <Text
            fontFamily={fonts.interSemi}
            fontSize={12}
            lineHeight={16}
            fontWeight="600"
            color={colors.inkSecondary}>
            {listed.length} of {filtered.length}
          </Text>
        </GlassPanel>
      </View>

      <GlassPanel
        intensity="xl"
        overlayColor={colors.glass}
        radius={radii.pill}
        style={[styles.searchWrap, shadows.cardSoft]}
        contentStyle={styles.searchFace}>
        <SearchGlyph color={colors.inkMuted} size={17} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search merchants, notes, amounts"
          placeholderTextColor={colors.inkMuted}
          style={styles.searchInput}
          accessibilityLabel="Search activity"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        {searching ? (
          <PressableScale
            scaleTo={0.94}
            onPress={() => setQuery('')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search">
            <Text
              fontFamily={fonts.interSemi}
              fontSize={12}
              lineHeight={16}
              fontWeight="600"
              color={colors.inkMuted}>
              Clear
            </Text>
          </PressableScale>
        ) : null}
      </GlassPanel>

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
              style={selected ? styles.filterOn : undefined}>
              {selected ? (
                <Text
                  fontFamily={fonts.interSemi}
                  fontSize={13}
                  lineHeight={18}
                  fontWeight="600"
                  color={colors.onInk}>
                  {item.label}
                </Text>
              ) : (
                <GlassPanel
                  intensity="md"
                  overlayColor={colors.glass}
                  radius={radii.pill}
                  contentStyle={styles.filterOffFace}>
                  <Text
                    fontFamily={fonts.interMedium}
                    fontSize={13}
                    lineHeight={18}
                    fontWeight="500"
                    color={colors.inkSecondary}>
                    {item.label}
                  </Text>
                </GlassPanel>
              )}
            </PressableScale>
          );
        })}
      </ScrollView>

      <WeekDatePicker
        selected={selectedDate}
        onSelect={setSelectedDate}
        dayItems={dayItems}
        currencySymbol={currencySymbol}
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
            tintColor={colors.ink}
            colors={[colors.ink]}
          />
        }>
        {groups.length === 0 ? (
          <GlassPanel
            style={shadows.card}
            radius={24}
            contentStyle={styles.emptyInner}>
            <CategoryDisc id="other" />
            <Text
              fontFamily={fonts.outfitSemi}
              fontSize={18}
              lineHeight={24}
              fontWeight="600"
              letterSpacing={-0.45}
              color={colors.ink}
              textAlign="center">
              {ledger.length === 0
                ? 'Nothing here yet'
                : searching
                  ? 'No matching activity'
                  : 'Nothing on this day'}
            </Text>
            <Text
              fontFamily={fonts.interMedium}
              fontSize={13}
              lineHeight={18}
              fontWeight="500"
              color={colors.inkMuted}
              textAlign="center">
              {ledger.length === 0
                ? 'Add an expense or income and it will land in this list.'
                : searching
                  ? 'Try a different search or filter.'
                  : 'Pick another day, or add something for this one.'}
            </Text>
          </GlassPanel>
        ) : (
          <GlassPanel
            style={shadows.card}
            radius={24}
            contentStyle={styles.groupInner}>
            {groups.map((group, index) => (
              <View key={group.date}>
                <View
                  style={[
                    styles.groupHeader,
                    index > 0 ? styles.groupHeaderLater : null,
                  ]}>
                  <Text
                    fontFamily={fonts.interSemi}
                    fontSize={11}
                    lineHeight={15}
                    fontWeight="600"
                    letterSpacing={0.5}
                    color={colors.inkMuted}>
                    {group.label}
                  </Text>
                  <Text
                    fontFamily={fonts.interSemi}
                    fontSize={12}
                    lineHeight={16}
                    fontWeight="600"
                    color={group.total >= 0 ? colors.positive : colors.coral}
                    style={tabular}>
                    {formatMoney(group.total, currencySymbol, {signed: true})}
                  </Text>
                </View>
                {group.items.map(item => (
                  <SwipeableTxnRow
                    key={item.id}
                    item={item}
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
                      run(
                        () =>
                          updateTransaction(item.id, {
                            isRecurring: !item.recurring,
                          }),
                        'Could not update',
                      )
                    }
                    onDuplicate={() =>
                      run(
                        () => duplicateTransaction(item.source!),
                        'Could not duplicate',
                      )
                    }
                  />
                ))}
              </View>
            ))}
          </GlassPanel>
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
  countFace: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchWrap: {
    marginTop: 18,
    marginHorizontal: layout.screenPadding,
    alignSelf: 'stretch',
  },
  searchFace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    color: colors.ink,
    fontFamily: fonts.interMedium,
    fontSize: 14,
    fontWeight: '500',
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
  filterOn: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
  },
  filterOffFace: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  list: {
    flex: 1,
    marginTop: 18,
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
  },
  emptyInner: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 8,
  },
  groupInner: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  groupHeaderLater: {
    marginTop: 4,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
});
