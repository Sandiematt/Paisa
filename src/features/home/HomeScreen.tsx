import React, {useEffect} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {RefreshGlyph, TrendUpGlyph} from '../../components/icons/Glyphs';
import {
  AppText,
  PressableScale,
  ProgressBar,
  Screen,
  TogglePill,
} from '../../components/ui';
import {formatMoney} from '../../lib/formatMoney';
import {colors, layout, radii, spacing} from '../../theme';
import {useFloatingNavClearance, useFloatingNavScroll} from '../NavBar/FloatingNavScroll';
import {DonutChart} from './charts';
import {HomeRange, MoneyPlan, SpendSlice, rangeScopeLabel} from './homeReport';
import {useHomeDashboard} from './useHomeDashboard';

type HomeScreenProps = {
  name: string;
  currencySymbol: string;
  avatarUrl?: string;
  onProfilePress?: () => void;
  onBudgetPress?: () => void;
  onSavingsPress?: () => void;
  /** Called whenever the live report data changes, so parents can read budget figures. */
  onReportReady?: (report: import('./homeReport').HomeReport) => void;
  refreshNonce?: number;
  openingAmount?: number;
  plan?: MoneyPlan;
};

const RANGES: {id: HomeRange; label: string}[] = [
  {id: 'week', label: 'Week'},
  {id: 'month', label: 'Month'},
  {id: 'year', label: 'Year'},
];

// A soft shadow shared across every raised surface, so depth reads as one
// consistent material rather than a different shadow per card.
const cardShadow = {
  shadowColor: '#0F1A2E',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: {width: 0, height: 4},
  elevation: 2,
};

function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up,';
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  if (hour < 21) return 'Good evening,';
  return 'Good night,';
}

// ─── Income icon (green, arrow in) ──────────────────────────────────────────
// Money coming in is upward motion — no rotation, and it stays green.
function IncomeIcon() {
  return (
    <View style={[styles.summaryIcon, {backgroundColor: '#E8F5EE'}]}>
      <TrendUpGlyph color={colors.positive} size={13} />
    </View>
  );
}

// ─── Expense icon (red, arrow out) ──────────────────────────────────────────
// Money leaving is downward motion, so the glyph is flipped — previously this
// and the income icon had the rotation backwards.
function ExpenseIcon() {
  return (
    <View style={[styles.summaryIcon, {backgroundColor: '#FDECEA'}]}>
      <View style={styles.flipVertical}>
        <TrendUpGlyph color={colors.danger} size={13} />
      </View>
    </View>
  );
}

// ─── Saved icon (leaf / coin) ────────────────────────────────────────────────
function SavedIcon() {
  return (
    <View style={[styles.summaryIcon, {backgroundColor: '#FBF0DA'}]}>
      <AppText style={styles.leafEmoji}>🌿</AppText>
    </View>
  );
}

// ─── Three-column summary row ─────────────────────────────────────────────────
function SummaryRow({
  income,
  spent,
  saved,
  currencySymbol,
}: {
  income: number;
  spent: number;
  saved: number;
  currencySymbol: string;
}) {
  return (
    <View style={styles.summaryRow}>
      {/* Income */}
      <View style={styles.summaryCard}>
        <IncomeIcon />
        <AppText
          variant="caption"
          color={colors.inkMuted}
          style={styles.summaryLabel}
          numberOfLines={1}>
          Income
        </AppText>
        <AppText
          variant="label"
          style={styles.summaryAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {formatMoney(income, currencySymbol, {decimals: 0})}
        </AppText>
        <View style={styles.summaryBar}>
          <View style={[styles.summaryBarFill, {backgroundColor: colors.positive, width: '100%'}]} />
        </View>
      </View>

      <View style={styles.summaryDivider} />

      {/* Expenses */}
      <View style={styles.summaryCard}>
        <ExpenseIcon />
        <AppText
          variant="caption"
          color={colors.inkMuted}
          style={styles.summaryLabel}
          numberOfLines={1}>
          Expenses
        </AppText>
        <AppText
          variant="label"
          style={styles.summaryAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {formatMoney(spent, currencySymbol, {decimals: 0})}
        </AppText>
        <View style={styles.summaryBar}>
          <View
            style={[
              styles.summaryBarFill,
              {
                backgroundColor: colors.danger,
                width: income > 0 ? `${Math.min(100, (spent / income) * 100)}%` : '0%',
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.summaryDivider} />

      {/* Saved */}
      <View style={styles.summaryCard}>
        <SavedIcon />
        <AppText
          variant="caption"
          color={colors.inkMuted}
          style={styles.summaryLabel}
          numberOfLines={1}>
          Saved
        </AppText>
        <AppText
          variant="label"
          style={styles.summaryAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {formatMoney(Math.max(0, saved), currencySymbol, {decimals: 0})}
        </AppText>
        <View style={styles.summaryBar}>
          <View
            style={[
              styles.summaryBarFill,
              {
                backgroundColor: colors.accent,
                width: income > 0 ? `${Math.min(100, Math.max(0, (saved / income) * 100))}%` : '0%',
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

// ─── Spending card: donut + legend ───────────────────────────────────────────
function SpendingCard({
  slices,
  spent,
  currencySymbol,
  overBudget,
}: {
  slices: SpendSlice[];
  spent: number;
  currencySymbol: string;
  overBudget: boolean;
}) {
  const tone = overBudget ? colors.danger : colors.positive;
  const hasSlices = slices.length > 0;
  const visibleSlices = slices.slice(0, 4);
  const remainder = slices.length - visibleSlices.length;

  return (
    <View style={[styles.card, cardShadow]}>
      <View style={styles.spendingHeader}>
        <AppText variant="heading">Spending</AppText>
        {hasSlices ? (
          <View
            style={styles.spendingStatus}
            accessibilityRole="text"
            accessibilityLabel={`Spending ${overBudget ? 'off track' : 'on track'}`}>
            <View style={[styles.onTrackDot, {backgroundColor: tone}]} />
            <AppText variant="caption" color={tone}>
              {overBudget ? 'Off track' : 'On track'}
            </AppText>
          </View>
        ) : null}
      </View>

      {/* Chart + Legend */}
      <View style={styles.spendingBody}>
        {/* Donut */}
        <DonutChart
          slices={hasSlices ? slices : [{id: 'empty', label: 'None', color: colors.hairline, percent: 100}]}
          size={140}>
          <View style={styles.donutCenter}>
            <AppText variant="caption" color={colors.inkMuted} style={styles.donutLabel}>
              Spent
            </AppText>
            <AppText variant="label" style={styles.donutAmount} numberOfLines={1}>
              {formatMoney(spent, currencySymbol, {decimals: 0})}
            </AppText>
          </View>
        </DonutChart>

        {/* Legend */}
        {hasSlices ? (
          <View style={styles.legend}>
            {visibleSlices.map(slice => (
              <View key={slice.id} style={styles.legendRow}>
                <View style={[styles.legendDot, {backgroundColor: slice.color}]} />
                <AppText
                  variant="caption"
                  color={colors.inkSecondary}
                  style={styles.legendLabel}
                  numberOfLines={1}>
                  {slice.label}
                </AppText>
                <AppText variant="caption" color={colors.ink} style={styles.legendPct}>
                  {slice.percent}%
                </AppText>
              </View>
            ))}
            {remainder > 0 ? (
              <AppText variant="caption" color={colors.inkMuted}>
                +{remainder} more
              </AppText>
            ) : null}
          </View>
        ) : (
          <View style={styles.legendEmpty}>
            <AppText variant="caption" color={colors.inkMuted}>
              Nothing logged yet — spending will show up here once you add it.
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Budget card ──────────────────────────────────────────────────────────────
function BudgetCard({
  budget,
  remainingBudget,
  currencySymbol,
  range,
  onPress,
}: {
  budget: number;
  remainingBudget: number;
  currencySymbol: string;
  range: HomeRange;
  onPress?: () => void;
}) {
  const scope = rangeScopeLabel(range);
  const usedAmount = Math.max(0, budget - remainingBudget);
  const progress = budget > 0 ? Math.max(0, Math.min(1, usedAmount / budget)) : 0;
  const overBudget = remainingBudget < 0;
  const usedPct =
    budget > 0 ? Math.min(100, Math.round((usedAmount / budget) * 100)) : 0;

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Budget, ${formatMoney(Math.abs(remainingBudget), currencySymbol, {decimals: 0})} ${
        overBudget ? `over ${scope}` : `left ${scope}`
      }`}
      containerStyle={styles.halfCardWrap}
      style={[styles.halfCard, cardShadow]}>
      <View style={styles.halfCardHeader}>
        <View style={[styles.halfCardIconWrap, {backgroundColor: '#E8F0FE'}]}>
          <AppText style={styles.halfCardEmoji}>💰</AppText>
        </View>
        <AppText
          variant="caption"
          color={colors.inkMuted}
          style={styles.halfCardTitle}
          numberOfLines={1}>
          Budget
        </AppText>
        <AppText variant="caption" color={colors.inkMuted}>
          {' ›'}
        </AppText>
      </View>
      <AppText
        variant="heading"
        color={overBudget ? colors.danger : colors.ink}
        style={styles.halfCardAmount}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}>
        {formatMoney(Math.abs(remainingBudget), currencySymbol, {decimals: 0})}
      </AppText>
      <AppText variant="caption" color={colors.inkMuted} style={styles.halfCardSub} numberOfLines={1}>
        {overBudget ? `over ${scope}` : `left ${scope}`}
      </AppText>
      <View style={styles.halfCardMeter}>
        <ProgressBar
          progress={progress}
          color={overBudget ? colors.danger : colors.accent}
        />
        <View style={styles.halfCardFooter}>
          <AppText variant="caption" color={colors.inkMuted}>
            {overBudget ? 'Over budget' : `${usedPct}% used`}
          </AppText>
          <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
            {formatMoney(usedAmount, currencySymbol, {decimals: 0})}
          </AppText>
        </View>
      </View>
    </PressableScale>
  );
}

// ─── Savings Goal card ───────────────────────────────────────────────────────
function SavingsGoalCard({
  actualSavings,
  periodSavingsTarget,
  savingsVsTarget,
  savingsUsesPlannedIncome,
  currencySymbol,
  range,
  onPress,
}: {
  actualSavings: number;
  periodSavingsTarget: number;
  savingsVsTarget: number;
  savingsUsesPlannedIncome: boolean;
  currencySymbol: string;
  range: HomeRange;
  onPress?: () => void;
}) {
  const scope = rangeScopeLabel(range);
  const saved = Math.max(0, actualSavings);
  const onTrack = savingsVsTarget >= 0;
  const progress =
    periodSavingsTarget > 0
      ? Math.max(0, Math.min(1, saved / periodSavingsTarget))
      : saved > 0
      ? 1
      : 0;
  const savedPct = Math.round(progress * 100);

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`Savings goal, ${formatMoney(saved, currencySymbol, {
        decimals: 0,
      })} saved ${scope}, ${onTrack ? 'on track' : 'off track'}`}
      containerStyle={styles.halfCardWrap}
      style={[styles.halfCard, cardShadow]}>
      <View style={styles.halfCardHeader}>
        <View style={[styles.halfCardIconWrap, {backgroundColor: '#FFE8E8'}]}>
          <AppText style={styles.halfCardEmoji}>🎯</AppText>
        </View>
        <AppText
          variant="caption"
          color={colors.inkMuted}
          style={styles.halfCardTitle}
          numberOfLines={1}>
          Savings Goal
        </AppText>
        <AppText variant="caption" color={colors.inkMuted}>
          {' ›'}
        </AppText>
      </View>
      <AppText
        variant="heading"
        color={colors.ink}
        style={styles.halfCardAmount}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}>
        {formatMoney(saved, currencySymbol, {decimals: 0})}
      </AppText>
      {periodSavingsTarget > 0 ? (
        <AppText variant="caption" color={colors.inkMuted} style={styles.halfCardSub} numberOfLines={1}>
          of {formatMoney(periodSavingsTarget, currencySymbol, {decimals: 0})} {scope}
          {savingsUsesPlannedIncome ? ' · vs plan' : ''}
        </AppText>
      ) : (
        <AppText variant="caption" color={colors.inkMuted} style={styles.halfCardSub} numberOfLines={1}>
          saved {scope}
          {savingsUsesPlannedIncome ? ' · vs plan' : ''}
        </AppText>
      )}
      <View style={styles.halfCardMeter}>
        <ProgressBar
          progress={progress}
          color={onTrack ? colors.positive : colors.danger}
        />
        <View style={styles.halfCardFooter}>
          <AppText variant="caption" color={colors.inkMuted}>
            {savedPct}% of goal
          </AppText>
          <View style={styles.onTrackPill}>
            <View style={[styles.onTrackDot, {backgroundColor: onTrack ? colors.positive : colors.danger}]} />
            <AppText
              variant="caption"
              color={onTrack ? colors.positive : colors.danger}>
              {onTrack ? 'On track' : 'Off track'}
            </AppText>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function HomeScreen({
  name,
  currencySymbol,
  avatarUrl,
  onProfilePress,
  onBudgetPress,
  onSavingsPress,
  onReportReady,
  refreshNonce = 0,
  openingAmount = 0,
  plan,
}: HomeScreenProps) {
  const navClearance = useFloatingNavClearance();
  const navScroll = useFloatingNavScroll();
  const {
    range,
    setRange,
    report: data,
    status,
    refreshing,
    error,
    updatedAt,
    reload,
  } = useHomeDashboard(refreshNonce, openingAmount, plan);

  // Notify parent whenever the live report data changes
  useEffect(() => {
    onReportReady?.(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Announce refresh failures to screen readers — a red caption alone won't
  // reach anyone who can't see the sync row.
  useEffect(() => {
    if (status === 'error' && error) {
      AccessibilityInfo.announceForAccessibility(`Sync failed: ${error}`);
    }
  }, [status, error]);

  const displayName = name.trim() || 'there';
  const firstName = displayName.split(/\s+/)[0];
  const initials = initialsFrom(displayName);
  const changePositive =
    (data.changePct ?? data.changeAmount) >= 0;
  const showChangeBadge = !data.empty && data.changePct !== null;
  const syncLabel = syncCaption(status, refreshing, error, updatedAt, data.empty);
  const savedAmount = data.actualSavings;

  const rangeWord =
    range === 'week' ? 'this week' : range === 'year' ? 'this year' : 'this month';

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {paddingBottom: navClearance},
        ]}
        onScroll={navScroll.onScroll}
        scrollEventThrottle={navScroll.scrollEventThrottle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={reload}
            tintColor={colors.ink}
            colors={[colors.ink]}
          />
        }
        showsVerticalScrollIndicator={false}>

        {/* ── Top bar: greeting + avatar + sync ── */}
        <View style={styles.topBar}>
          <View style={styles.nameRow}>
            <View style={styles.nameTextWrap}>
              <AppText variant="caption" color={colors.inkMuted} numberOfLines={1}>
                {timeGreeting()}
              </AppText>
              <AppText variant="display" numberOfLines={1} style={styles.displayName}>
                {firstName}
              </AppText>
            </View>
            <PressableScale
              onPress={onProfilePress}
              scaleTo={0.94}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              style={styles.avatar}>
              {avatarUrl ? (
                <Image
                  source={{uri: avatarUrl}}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <AppText variant="label" color={colors.ink} style={styles.avatarInitials}>
                  {initials}
                </AppText>
              )}
            </PressableScale>
          </View>
          <PressableScale
            onPress={reload}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel={`Sync now. ${syncLabel}`}
            containerStyle={styles.syncHit}
            style={styles.syncRow}>
            {refreshing || status === 'loading' ? (
              <ActivityIndicator size="small" color={colors.inkMuted} />
            ) : (
              <RefreshGlyph color={colors.inkMuted} size={12} />
            )}
            <View
              style={[
                styles.liveDot,
                status === 'error' && styles.liveDotError,
                data.empty && status === 'ready' && styles.liveDotMuted,
              ]}
            />
            <AppText
              variant="caption"
              color={status === 'error' ? colors.danger : colors.inkMuted}
              style={styles.syncCopy}
              numberOfLines={1}>
              {syncLabel}
            </AppText>
          </PressableScale>
        </View>

        {/* ── Hero balance ── */}
        <View style={styles.heroSection}>
          <AppText variant="caption" color={colors.inkMuted} style={styles.availableLabel}>
            Available Balance
          </AppText>
          <AppText
            variant="numericHero"
            color={data.balance < 0 ? colors.danger : colors.ink}
            style={styles.heroAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}>
            {formatMoney(data.balance, currencySymbol, {decimals: 0})}
          </AppText>
          {/* % change badge */}
          {showChangeBadge ? (
            <View style={[styles.changeBadge, changePositive ? styles.changeBadgePos : styles.changeBadgeNeg]}>
              <View style={changePositive ? undefined : styles.flipVertical}>
                <TrendUpGlyph
                  color={changePositive ? colors.positive : colors.danger}
                  size={10}
                />
              </View>
              <AppText
                variant="caption"
                color={changePositive ? colors.positive : colors.danger}
                style={styles.changeBadgeText}>
                {`${changePositive ? '+' : ''}${data.changePct}% vs last ${
                  range === 'week' ? 'week' : range === 'year' ? 'year' : 'month'
                }`}
              </AppText>
            </View>
          ) : null}
        </View>

        {/* ── Range selector ── */}
        <View
          style={styles.ranges}
          accessibilityRole="tablist">
          {RANGES.map(item => (
            <TogglePill
              key={item.id}
              label={item.label}
              selected={range === item.id}
              onPress={() => setRange(item.id)}
            />
          ))}
        </View>

        {/* ── 3-column summary row ── */}
        <View style={[styles.summaryRow, cardShadow]}>
          <SummaryRowContent
            income={data.income}
            spent={data.spent}
            saved={savedAmount}
            currencySymbol={currencySymbol}
          />
        </View>

        {/* ── Spending card ── */}
        <SpendingCard
          slices={data.slices}
          spent={data.spent}
          currencySymbol={currencySymbol}
          overBudget={data.overBudget}
        />

        {(data.monthlyBudget > 0 || data.monthlySavingsGoal > 0) ? (
          <View style={styles.halfRow}>
            {data.monthlyBudget > 0 ? (
              <BudgetCard
                budget={data.budget}
                remainingBudget={data.remainingBudget}
                currencySymbol={currencySymbol}
                range={range}
                onPress={onBudgetPress}
              />
            ) : null}
            {data.monthlyBudget > 0 && data.monthlySavingsGoal > 0 ? (
              <View style={styles.halfGap} />
            ) : null}
            {data.monthlySavingsGoal > 0 ? (
              <SavingsGoalCard
                actualSavings={data.actualSavings}
                periodSavingsTarget={data.periodSavingsTarget}
                savingsVsTarget={data.savingsVsTarget}
                savingsUsesPlannedIncome={data.savingsUsesPlannedIncome}
                currencySymbol={currencySymbol}
                range={range}
                onPress={onSavingsPress}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// Extracted so the summary row's outer View can carry the shared card shadow
// without duplicating the row's internal layout.
function SummaryRowContent(props: {
  income: number;
  spent: number;
  saved: number;
  currencySymbol: string;
}) {
  const {income, spent, saved, currencySymbol} = props;
  return (
    <>
      <View style={styles.summaryCard}>
        <IncomeIcon />
        <AppText variant="caption" color={colors.inkMuted} style={styles.summaryLabel} numberOfLines={1}>
          Income
        </AppText>
        <AppText
          variant="label"
          style={styles.summaryAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {formatMoney(income, currencySymbol, {decimals: 0})}
        </AppText>
        <View style={styles.summaryBar}>
          <View style={[styles.summaryBarFill, {backgroundColor: colors.positive, width: '100%'}]} />
        </View>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryCard}>
        <ExpenseIcon />
        <AppText variant="caption" color={colors.inkMuted} style={styles.summaryLabel} numberOfLines={1}>
          Expenses
        </AppText>
        <AppText
          variant="label"
          style={styles.summaryAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {formatMoney(spent, currencySymbol, {decimals: 0})}
        </AppText>
        <View style={styles.summaryBar}>
          <View
            style={[
              styles.summaryBarFill,
              {
                backgroundColor: colors.danger,
                width: income > 0 ? `${Math.min(100, (spent / income) * 100)}%` : '0%',
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.summaryCard}>
        <SavedIcon />
        <AppText variant="caption" color={colors.inkMuted} style={styles.summaryLabel} numberOfLines={1}>
          Saved
        </AppText>
        <AppText
          variant="label"
          style={styles.summaryAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {formatMoney(Math.max(0, saved), currencySymbol, {decimals: 0})}
        </AppText>
        <View style={styles.summaryBar}>
          <View
            style={[
              styles.summaryBarFill,
              {
                backgroundColor: colors.accent,
                width: income > 0 ? `${Math.min(100, Math.max(0, (saved / income) * 100))}%` : '0%',
              },
            ]}
          />
        </View>
      </View>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function syncCaption(
  status: 'loading' | 'ready' | 'error',
  refreshing: boolean,
  error: string | null,
  updatedAt: Date | null,
  empty: boolean,
): string {
  if (refreshing || status === 'loading') {
    return 'Updating…';
  }
  if (status === 'error') {
    return error ? `${error} · Tap to retry` : 'Could not sync · Tap to retry';
  }
  if (empty) {
    return 'No activity yet · Tap to sync';
  }
  if (!updatedAt) {
    return 'Tap to sync';
  }
  const minutes = Math.max(
    0,
    Math.round((Date.now() - updatedAt.getTime()) / 60000),
  );
  if (minutes < 1) {
    return 'Updated just now';
  }
  if (minutes === 1) {
    return 'Updated 1 min ago';
  }
  return `Updated ${minutes} min ago`;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'S';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
  },

  // Top bar
  topBar: {
    marginBottom: spacing.xl,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  nameTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  displayName: {
    includeFontPadding: false,
  },
  syncHit: {
    alignSelf: 'stretch',
    marginTop: spacing.xs,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
    gap: spacing.sm,
  },
  syncCopy: {
    flex: 1,
    includeFontPadding: false,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.positive,
  },
  liveDotError: {
    backgroundColor: colors.danger,
  },
  liveDotMuted: {
    backgroundColor: colors.inkMuted,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
  },
  avatarInitials: {
    includeFontPadding: false,
  },

  // Hero
  heroSection: {
    marginBottom: spacing.xl,
  },
  availableLabel: {
    marginBottom: spacing.xs,
    includeFontPadding: false,
  },
  heroAmount: {
    includeFontPadding: false,
    marginBottom: spacing.sm,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    gap: spacing.xs,
  },
  changeBadgePos: {
    backgroundColor: '#E8F5EE',
  },
  changeBadgeNeg: {
    backgroundColor: '#FDECEA',
  },
  changeBadgeText: {
    includeFontPadding: false,
  },
  flipVertical: {
    transform: [{scaleY: -1}],
  },

  // Range selector
  ranges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'stretch',
  },
  summaryCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.hairline,
    marginHorizontal: spacing.md,
    alignSelf: 'stretch',
  },
  summaryIcon: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    includeFontPadding: false,
    marginBottom: spacing.xs,
  },
  leafEmoji: {
    fontSize: 11,
    lineHeight: 14,
    includeFontPadding: false,
  },
  summaryAmount: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    marginBottom: spacing.sm,
    width: '100%',
  },
  summaryBar: {
    height: 3,
    width: '100%',
    backgroundColor: colors.hairline,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  summaryBarFill: {
    height: 3,
    borderRadius: radii.pill,
  },

  // Card base
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },

  // Spending card
  spendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  spendingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  spendingBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  donutCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutLabel: {
    marginBottom: 2,
    includeFontPadding: false,
  },
  donutAmount: {
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    fontWeight: '700',
  },
  legend: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: spacing.md,
  },
  legendEmpty: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 18,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  legendLabel: {
    flex: 1,
    includeFontPadding: false,
  },
  legendPct: {
    minWidth: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    fontWeight: '600',
  },

  // Half cards row
  halfRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: spacing.lg,
  },
  halfGap: {
    width: spacing.md,
  },
  halfCardWrap: {
    flex: 1,
    minWidth: 0,
  },
  halfCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
  },
  halfCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  halfCardIconWrap: {
    width: 24,
    height: 24,
    borderRadius: radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  halfCardEmoji: {
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
  },
  halfCardTitle: {
    flex: 1,
    includeFontPadding: false,
  },
  halfCardAmount: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  halfCardSub: {
    marginTop: 2,
    includeFontPadding: false,
  },
  halfCardMeter: {
    marginTop: 'auto',
    paddingTop: spacing.md,
  },
  halfCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  onTrackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  onTrackDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
});