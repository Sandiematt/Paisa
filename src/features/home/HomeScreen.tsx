import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Image,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';

import {CaretRight} from 'phosphor-react-native/src/icons/CaretRight';
import {ChartBar} from 'phosphor-react-native/src/icons/ChartBar';
import {Plus} from 'phosphor-react-native/src/icons/Plus';
import {Warning} from 'phosphor-react-native/src/icons/Warning';
import {X} from 'phosphor-react-native/src/icons/X';

import {
  AnimatedNumber,
  AppText,
  GlassPanel,
  GradientIconSquare,
  GradientView,
  Loader,
  PressableScale,
  ProgressRing,
  Screen,
  SectionTitle,
  SegmentedControl,
  TileLottieIcon,
  BannerPill,
  ThemeToggle,
} from '../../components/ui';
import {CategoryRow} from '../../lib/categoriesStore';
import {formatMoney} from '../../lib/formatMoney';
import {TransactionRow} from '../../lib/transactionsStore';
import {
  Palette,
  colors,
  dataReveal,
  fonts,
  layout,
  makeStyles,
  palettes,
  radii,
  shadows,
  useTheme,
} from '../../theme';
import {useFloatingNavClearance, useFloatingNavDockHeight, useFloatingNavScroll} from '../NavBar/FloatingNavScroll';
import {isLocalAvatarUri} from '../profile/avatarImage';
import {useNotifications} from '../notifications/NotificationsProvider';
import {useTutorialTarget} from '../tutorial/TutorialProvider';
import {AreaChart} from './charts';
import {spotlightGradient} from './DetailsParts';
import {
  dayMonthLabel,
  daysToGo,
  daysToGoLabel,
  greetingForHour,
  recentTransactions,
  weeklySpendNudge,
} from './homeInsights';
import {MonthState} from '../../lib/budgetEngine';
import {budgetCardFigures, budgetStripLine, dayMonth} from './budgetCopy';
import {HomeRange, HomeReport, rangeNoun, rangeScopeLabel} from './homeReport';
import {RelatedTransactions} from './RelatedTransactions';

const RECENT_LIMIT = 5;

type DashboardStatus = 'loading' | 'ready' | 'error';

type HomeScreenProps = {
  name: string;
  avatarUrl?: string;
  currencySymbol: string;
  /** 0..1, how much of the profile is filled in (the ring around the avatar). */
  profileProgress: number;
  onBudgetPress?: () => void;
  onSavingsPress?: () => void;
  /** Opens where the budget is set when there is none yet. */
  /** Opens the budget editor: sets a first budget or changes the current one. */
  onEditBudgetPress?: () => void;
  onProfilePress?: () => void;
  onNotificationsPress?: () => void;
  /** Jumps to the Activity tab. */
  onSeeAllPress?: () => void;
  report: HomeReport;
  /** This cycle's rolling budget (src/lib/budgetEngine.ts); null when no budget is set. */
  budget?: MonthState | null;
  transactions: TransactionRow[];
  categories: CategoryRow[];
  status: DashboardStatus;
  refreshing: boolean;
  error: string | null;
  updatedAt: Date | null;
  reload: () => void;
  range: HomeRange;
  setRange: (range: HomeRange) => void;
  /** Week key of the nudge the user closed this session. */
  dismissedNudgeKey: string | null;
  onDismissNudge: (key: string) => void;
};

const RANGE_OPTIONS = [
  {value: 'week' as const, label: 'Week'},
  {value: 'month' as const, label: 'Month'},
];

const AVATAR_RING = 46;
const AVATAR_PHOTO = 36;

const tabular = {fontVariant: ['tabular-nums'] as const};

const isLight = (palette: Palette) => palette === palettes.light;

/** Light cards lift off the ground with a soft shadow; dark cards sit flat on their hairline. */
const lightLift = (palette: Palette) => (isLight(palette) ? shadows.cardSoft : null);

function isSafeAvatarUrl(url: string | undefined): url is string {
  if (!url) {
    return false;
  }
  // A photo the user picked is copied into the app's own folder.
  if (isLocalAvatarUri(url)) {
    return true;
  }
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'P';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/** Same size steps as Insights, so long balances never wrap or flash. */
function balanceFontSize(text: string): {fontSize: number; lineHeight: number} {
  if (text.length > 12) {
    return {fontSize: 30, lineHeight: 34};
  }
  if (text.length > 9) {
    return {fontSize: 36, lineHeight: 40};
  }
  return {fontSize: 44, lineHeight: 48};
}

function syncCaption(
  status: DashboardStatus,
  refreshing: boolean,
  error: string | null,
  updatedAt: Date | null,
  empty: boolean,
): string {
  if (refreshing || status === 'loading') {
    return 'Updating…';
  }
  if (status === 'error') {
    return error ? `${error} • Tap to retry` : 'Could not sync • Tap to retry';
  }
  if (empty) {
    return 'No activity yet • Tap to sync';
  }
  if (!updatedAt) {
    return 'Tap to sync';
  }
  const minutes = Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 60000));
  if (minutes < 1) {
    return 'Updated just now';
  }
  if (minutes === 1) {
    return 'Updated 1 min ago';
  }
  return `Updated ${minutes} min ago`;
}

/**
 * Bell that gives a short ring when a new notification arrives while Home is
 * open. Never on mount: an unread badge the user has already seen stays still.
 */
function RingingBell({unreadCount}: {unreadCount: number}) {
  const [rings, setRings] = useState(0);
  const previous = useRef(unreadCount);

  useEffect(() => {
    if (unreadCount > previous.current) {
      setRings(count => count + 1);
    }
    previous.current = unreadCount;
  }, [unreadCount]);

  // The bell sits on the glass pill, not a gradient square, so it takes the
  // text colour instead of the artwork's baked white.
  useTheme();
  return (
    <TileLottieIcon
      kind="bell"
      size={20}
      color={colors.text}
      replayKey={rings}
      playOnMount={false}
    />
  );
}

type StatTileProps = {
  label: string;
  amount: string;
  icon: React.ReactNode;
  accessibilityLabel: string;
};

function StatTile({label, amount, icon, accessibilityLabel}: StatTileProps) {
  const styles = useStyles();
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.tileWrap, styles.tile]}>
      <GradientIconSquare size={38} glow>
        {icon}
      </GradientIconSquare>
      <View style={styles.tileText}>
        <AppText variant="caption" color={colors.muted}>
          {label}
        </AppText>
        <AppText
          variant="bodyStrong"
          style={[styles.tileAmount, tabular]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}>
          {amount}
        </AppText>
      </View>
    </View>
  );
}

type GoalCardProps = {
  icon: React.ReactNode;
  iconGradient: 'primary' | 'savings';
  ringProgress: number;
  ringGradient: 'primary' | 'savings' | 'rose';
  centerTop: React.ReactNode;
  centerSub?: string;
  title: string;
  value: string;
  valueTone?: string;
  accessibilityLabel: string;
  onPress?: () => void;
  /** Swaps the caret for a + button with its own action. */
  onAddPress?: () => void;
  addLabel?: string;
};

function GoalCard({
  icon,
  iconGradient,
  ringProgress,
  ringGradient,
  centerTop,
  centerSub,
  title,
  value,
  valueTone = colors.muted,
  accessibilityLabel,
  onPress,
  onAddPress,
  addLabel,
}: GoalCardProps) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      containerStyle={styles.goalWrap}
      style={styles.goalCard}>
      <View style={styles.goalHead}>
        <GradientIconSquare size={34} gradient={iconGradient}>
          {icon}
        </GradientIconSquare>
        {onAddPress ? (
          <PressableScale
            onPress={onAddPress}
            scaleTo={0.88}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={addLabel}
            style={styles.goalAdd}>
            <Plus size={16} color={colors.text} weight="bold" />
          </PressableScale>
        ) : (
          <CaretRight size={18} color={colors.muted} weight="bold" />
        )}
      </View>
      <ProgressRing
        size={112}
        stroke={10}
        progress={ringProgress}
        gradient={ringGradient}
        trackColor={colors.track}
        style={styles.ring}>
        <View style={styles.ringCenter}>
          {centerTop}
          {centerSub ? (
            <AppText variant="caption" color={colors.muted}>
              {centerSub}
            </AppText>
          ) : null}
        </View>
      </ProgressRing>
      <View style={styles.goalText}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="label" color={valueTone}>
          {value}
        </AppText>
      </View>
    </PressableScale>
  );
}

function RingPercent({
  text,
  percent,
  color = colors.text,
}: {
  text: string;
  /** Counts up alongside the ring sweep instead of showing `text` outright. */
  percent?: number;
  color?: string;
}) {
  const styles = useStyles();
  if (percent != null) {
    return (
      <AnimatedNumber
        value={percent}
        format={value => `${Math.round(value)}%`}
        durationMs={dataReveal.ring}
        style={[styles.ringPercent, tabular, {color}]}
        numberOfLines={1}
      />
    );
  }
  return (
    <AppText
      style={[styles.ringPercent, tabular, {color}]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}>
      {text}
    </AppText>
  );
}

function BudgetGoalCard({
  budget,
  currencySymbol,
  range,
  onPress,
  onEditPress,
}: {
  /** This cycle's budget; null when none is set. */
  budget: MonthState | null;
  currencySymbol: string;
  range: HomeRange;
  onPress?: () => void;
  onEditPress?: () => void;
}) {
  const money = (amount: number) => formatMoney(amount, currencySymbol, {decimals: 0});
  const icon = (
    <TileLottieIcon kind="wallet" size={20} replayKey={budget ? budget.remaining : 0} />
  );

  if (!budget) {
    return (
      <GoalCard
        icon={icon}
        iconGradient="primary"
        ringProgress={0}
        ringGradient="primary"
        centerTop={<RingPercent text="Set up" color={colors.lavender} />}
        title="Budget"
        value="Add a budget"
        accessibilityLabel="Budget, not set. Add a budget"
        onPress={onEditPress}
        onAddPress={onEditPress}
        addLabel="Add budget"
      />
    );
  }

  if (budget.kind !== 'active') {
    const waiting = budget.kind === 'waiting' && budget.startsOn !== null;
    const value = waiting
      ? `Starts ${dayMonth(budget.startsOn as string)}`
      : 'Bills and goal over budget';
    return (
      <GoalCard
        icon={icon}
        iconGradient="primary"
        ringProgress={0}
        ringGradient={waiting ? 'primary' : 'rose'}
        centerTop={
          <RingPercent
            text={waiting ? 'Soon' : 'Fix'}
            color={waiting ? colors.lavender : colors.roseLight}
          />
        }
        title="Budget"
        value={value}
        valueTone={waiting ? colors.muted : colors.roseLight}
        accessibilityLabel={`Budget, ${value}`}
        onPress={onPress}
        onAddPress={onEditPress}
        addLabel="Edit budget"
      />
    );
  }

  const {budget: total, used, over} = budgetCardFigures(budget, range);
  const progress = total > 0 ? Math.max(0, Math.min(1, used / total)) : 0;
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const scope = rangeScopeLabel(range);
  const overBy = range === 'week' ? used - total : budget.overspentBy;
  const value = over
    ? range === 'week'
      ? `${money(overBy)} over the week's limits`
      : `Overspent by ${money(overBy)}`
    : `${money(used)} of ${money(total)}`;

  return (
    <GoalCard
      icon={icon}
      iconGradient="primary"
      ringProgress={over ? 1 : progress}
      ringGradient={over ? 'rose' : 'primary'}
      centerTop={
        over ? (
          <RingPercent text="Over" color={colors.roseLight} />
        ) : (
          <RingPercent text={`${usedPct}%`} percent={usedPct} />
        )
      }
      // Bills and the savings goal are already set aside, so the ring is day-to-day spending.
      centerSub={over ? 'budget' : 'used'}
      title="Budget"
      value={value}
      valueTone={over ? colors.roseLight : colors.muted}
      accessibilityLabel={`Budget, ${
        over ? `${money(overBy)} over ${scope}` : `${money(total - used)} left ${scope}`
      }, ${usedPct} percent used`}
      onPress={onPress}
      onAddPress={onEditPress}
      addLabel="Edit budget"
    />
  );
}

function SavingsGoalCard({
  budget,
  currencySymbol,
  onPress,
}: {
  budget: MonthState | null;
  currencySymbol: string;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const money = (amount: number) => formatMoney(amount, currencySymbol, {decimals: 0});
  const goal = budget?.savingsGoal ?? 0;
  const extra = budget && budget.kind === 'active' ? budget.projectedExtra : 0;
  const icon = <TileLottieIcon kind="piggy" size={20} replayKey={goal + extra} />;

  if (!budget || (goal <= 0 && budget.kind !== 'active')) {
    return (
      <GoalCard
        icon={icon}
        iconGradient="savings"
        ringProgress={0}
        ringGradient="savings"
        centerTop={<RingPercent text="Set up" color={colors.lavender} />}
        title="Savings"
        value="No goal set"
        accessibilityLabel="Savings, no goal set"
        onPress={onPress}
      />
    );
  }

  // The goal is set aside from the first day, so it is always whole; what is
  // left unspent at month end is extra savings on top.
  const line = budget.overspent
    ? 'No extra this month'
    : extra > 0
      ? `+${money(extra)} if you don't spend it`
      : goal > 0
        ? 'Saved this month'
        : 'No goal set';
  return (
    <GoalCard
      icon={icon}
      iconGradient="savings"
      ringProgress={goal > 0 ? 1 : 0}
      ringGradient="savings"
      centerTop={
        <AppText
          style={[styles.ringAmount, tabular]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}>
          {money(goal > 0 ? goal : extra)}
        </AppText>
      }
      centerSub={goal > 0 ? 'goal' : 'extra'}
      title="Savings"
      value={line}
      valueTone={budget.overspent ? colors.roseLight : colors.muted}
      accessibilityLabel={`Savings, ${money(goal)} goal set aside this month. ${line}`}
      onPress={onPress}
    />
  );
}

export function HomeScreen({
  name,
  avatarUrl,
  currencySymbol,
  profileProgress,
  onBudgetPress,
  onSavingsPress,
  onEditBudgetPress,
  onProfilePress,
  onNotificationsPress,
  onSeeAllPress,
  report: data,
  budget = null,
  transactions,
  categories,
  status,
  refreshing,
  error,
  updatedAt,
  reload,
  range,
  setRange,
  dismissedNudgeKey,
  onDismissNudge,
}: HomeScreenProps) {
  const styles = useStyles();
  const {scheme} = useTheme();
  const navClearance = useFloatingNavClearance();
  const navDockHeight = useFloatingNavDockHeight();
  const navScroll = useFloatingNavScroll();
  const {unreadCount} = useNotifications();

  useEffect(() => {
    if (status === 'error' && error) {
      AccessibilityInfo.announceForAccessibility(`Sync failed: ${error}`);
    }
  }, [status, error]);

  const firstName = useMemo(
    () => (name.trim() || 'there').split(/\s+/)[0],
    [name],
  );

  const recent = useMemo(
    () => recentTransactions(transactions, RECENT_LIMIT),
    [transactions],
  );

  const nudge = useMemo(
    () => weeklySpendNudge(transactions, categories),
    [categories, transactions],
  );
  const showNudge = nudge !== null && nudge.key !== dismissedNudgeKey;

  const money = (amount: number, signed = false) =>
    formatMoney(amount, currencySymbol, {decimals: 0, signed});

  const noun = rangeNoun(range);
  const syncLabel = syncCaption(status, refreshing, error, updatedAt, data.empty);
  const syncing = refreshing || status === 'loading';
  const balanceText = money(data.balance);
  const balanceSize = balanceFontSize(balanceText);
  const change = data.balanceChange;
  const sinceLabel = dayMonthLabel(data.periodStart.day, data.periodStart.monthIndex);
  const daysLabel = daysToGoLabel(daysToGo(range));
  const hasAvatar = isSafeAvatarUrl(avatarUrl);
  const progressPct = Math.round(Math.max(0, Math.min(1, profileProgress)) * 100);

  let stripText: string;
  let stripOver = false;
  if (budget) {
    const line = budgetStripLine(budget, range, money);
    stripText = line.text;
    stripOver = line.tone === 'over';
  } else if (data.empty) {
    stripText = 'Add your first transaction to get started';
  } else {
    stripText = `${money(data.spent)} spent this ${noun} · ${daysLabel}`;
  }

  const strip = (
    <GradientView
      gradient={stripOver ? 'rose' : 'budgetStrip'}
      angle={90}
      style={styles.strip}>
      <TileLottieIcon kind="wallet" size={18} replayKey={stripText} />
      <AppText
        variant="bodyStrong"
        style={styles.stripText}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}>
        {stripText}
      </AppText>
    </GradientView>
  );

  const spotlightFill = spotlightGradient(scheme);

  const notificationsLabel =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications';

  const profileTarget = useTutorialTarget('home.profile');
  const notificationsTarget = useTutorialTarget('home.notifications');
  const balanceTarget = useTutorialTarget('home.balance');
  const totalsTarget = useTutorialTarget('home.totals');
  const limitTarget = useTutorialTarget('home.limit');
  const goalsTarget = useTutorialTarget('home.goals');

  return (
    <Screen edges={['top']} glow={300} bottomInset={navDockHeight}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {paddingBottom: navClearance - navDockHeight},
        ]}
        onScroll={navScroll.onScroll}
        scrollEventThrottle={navScroll.scrollEventThrottle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={reload}
            tintColor={colors.text}
            colors={[colors.lavender]}
            progressBackgroundColor={colors.surfaceRaised}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View ref={profileTarget} collapsable={false}>
            <PressableScale
              onPress={onProfilePress}
              disabled={!onProfilePress}
              scaleTo={0.94}
              accessibilityRole="button"
              accessibilityLabel={`Open profile, ${progressPct} percent complete`}>
              <ProgressRing
                size={AVATAR_RING}
                stroke={3}
                progress={profileProgress}
                style={styles.avatarRing}>
                <View style={styles.avatarFace}>
                  {hasAvatar ? (
                    <Image
                      source={{uri: avatarUrl}}
                      style={styles.avatarPhoto}
                      resizeMode="cover"
                    />
                  ) : (
                    <AppText style={styles.avatarInitials}>{initialsFrom(name)}</AppText>
                  )}
                </View>
              </ProgressRing>
            </PressableScale>
          </View>

          <GlassPanel
            style={styles.greetingPill}
            radius={AVATAR_RING / 2}
            intensity="md"
            contentStyle={styles.greetingContent}>
            <AppText
              variant="label"
              style={styles.greetingText}
              numberOfLines={1}
              accessibilityRole="header">
              {`${greetingForHour(new Date().getHours())} ${firstName}`}
            </AppText>
            <ThemeToggle />
            <View ref={notificationsTarget} collapsable={false}>
              <PressableScale
                onPress={onNotificationsPress}
                disabled={!onNotificationsPress}
                scaleTo={0.9}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={notificationsLabel}
                style={styles.bell}>
                <RingingBell unreadCount={unreadCount} />
                {unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
              </PressableScale>
            </View>
          </GlassPanel>
        </View>

        <AppText variant="sectionTitle" accessibilityRole="header" style={styles.spotlightTitle}>
          {`This ${noun} at a glance`}
        </AppText>

        <View ref={balanceTarget} collapsable={false} style={styles.spotlight}>
          <GradientView
            gradient={spotlightFill.stops}
            angle={160}
            positions={spotlightFill.positions}
            style={styles.spotlightFill}>
            <View style={styles.spotlightBody}>
              <View style={styles.spotlightTop}>
                <View style={styles.liveLabel}>
                  <AppText variant="caption" style={styles.liveLabelText}>
                    Tracked balance
                  </AppText>
                </View>
                <SegmentedControl
                  options={RANGE_OPTIONS}
                  value={range}
                  onChange={setRange}
                  accessibilityLabel="Time range"
                  style={styles.rangeControl}
                />
              </View>

              {/* Sized from the final text so the font never steps mid-count. */}
              <AnimatedNumber
                value={data.balance}
                format={value => money(Math.round(value))}
                durationMs={dataReveal.count}
                memoryKey="home-balance"
                style={[
                  styles.balance,
                  balanceSize,
                  data.balance < 0 ? {color: colors.roseLight} : null,
                ]}
                numberOfLines={1}
              />

              {/* A brand-new wallet has only its starting balance: no change to report yet. */}
              {data.empty || (change === 0 && data.startedThisPeriod) ? null : (
                <AppText style={styles.changeLine} numberOfLines={1}>
                  {change === 0 ? (
                    <AppText style={styles.changeMuted}>{`No change since ${sinceLabel}`}</AppText>
                  ) : (
                    <>
                      <AppText
                        style={[
                          styles.changeAmount,
                          {color: change > 0 ? colors.mint : colors.roseLight},
                        ]}>
                        {money(change, true)}
                      </AppText>
                      <AppText style={styles.changeMuted}>{` since ${sinceLabel}`}</AppText>
                    </>
                  )}
                </AppText>
              )}

              <PressableScale
                onPress={reload}
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel={`Sync now. ${syncLabel}`}
                style={styles.syncRow}>
                {syncing ? (
                  <Loader size={22} />
                ) : status === 'error' ? (
                  <Warning size={13} weight="fill" color={colors.roseLight} />
                ) : null}
                <AppText
                  variant="caption"
                  color={status === 'error' ? colors.roseLight : colors.muted}
                  numberOfLines={1}
                  style={styles.syncText}>
                  {syncLabel}
                </AppText>
              </PressableScale>

              <View style={styles.chart}>
                <AreaChart
                  values={data.series}
                  accessibilityLabel={`Balance trend this ${noun}`}
                />
              </View>
            </View>

            <View ref={limitTarget} collapsable={false}>
              {strip}
            </View>
          </GradientView>
        </View>

        <View ref={totalsTarget} collapsable={false} style={styles.tiles}>
          <StatTile
            label="Expense"
            amount={money(data.spent)}
            icon={<TileLottieIcon kind="expense" size={20} replayKey={data.spent} />}
            accessibilityLabel={`Expense this ${noun}, ${money(data.spent)}`}
          />
          <StatTile
            label="Income"
            amount={money(data.income)}
            icon={<TileLottieIcon kind="income" size={20} replayKey={data.income} />}
            accessibilityLabel={`Income this ${noun}, ${money(data.income)}`}
          />
        </View>

        {showNudge && nudge ? (
          <BannerPill
            style={styles.nudge}
            iconGradient={nudge.direction === 'under' ? 'savings' : 'rose'}
            icon={<ChartBar size={20} weight="fill" color={colors.onAccent} />}
            title={`${money(nudge.amount)} ${nudge.direction} last week`}
            subtitle={
              nudge.category
                ? `${nudge.category.name} is ${
                    nudge.direction === 'under' ? 'down' : 'up'
                  } ${money(nudge.category.amount)} on the same days last week`
                : 'Compared with the same days last week'
            }
            trailing={
              <PressableScale
                onPress={() => onDismissNudge(nudge.key)}
                scaleTo={0.88}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Dismiss weekly spending note"
                style={styles.nudgeClose}>
                <X size={20} weight="bold" color={colors.text} />
              </PressableScale>
            }
          />
        ) : null}

        <SectionTitle title="Budget and savings" style={styles.goalsTitle} />
        <View ref={goalsTarget} collapsable={false} style={styles.goals}>
          <BudgetGoalCard
            budget={budget}
            currencySymbol={currencySymbol}
            range={range}
            onPress={onBudgetPress}
            onEditPress={onEditBudgetPress}
          />
          <SavingsGoalCard
            budget={budget}
            currencySymbol={currencySymbol}
            onPress={onSavingsPress}
          />
        </View>

        <View style={styles.recent}>
          <RelatedTransactions
            title="Recent transactions"
            rows={recent}
            categories={categories}
            currencySymbol={currencySymbol}
            emptyText="Nothing yet. Tap + to add your first transaction."
            onSeeAll={recent.length > 0 ? onSeeAllPress : undefined}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFace: {
    width: AVATAR_PHOTO,
    height: AVATAR_PHOTO,
    borderRadius: AVATAR_PHOTO / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  avatarPhoto: {
    width: AVATAR_PHOTO,
    height: AVATAR_PHOTO,
  },
  avatarInitials: {
    fontFamily: fonts.jakartaBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.lavender,
  },
  greetingPill: {
    flex: 1,
    minWidth: 0,
  },
  greetingContent: {
    height: AVATAR_RING - 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 14,
  },
  greetingText: {
    flex: 1,
    fontFamily: fonts.jakartaMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  bell: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 1,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.roseLight,
  },
  spotlightTitle: {
    marginTop: 22,
  },
  spotlight: {
    marginTop: 14,
    borderRadius: radii.cardHero,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    ...lightLift(c),
  },
  spotlightFill: {
    width: '100%',
    // Clip here rather than on the card so the light shadow is not clipped.
    borderRadius: radii.cardHero - 1,
    overflow: 'hidden',
  },
  spotlightBody: {
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  spotlightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  liveLabel: {
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: isLight(c) ? colors.wash : 'rgba(255, 255, 255, 0.1)',
  },
  liveLabelText: {
    fontFamily: fonts.jakartaMedium,
    color: isLight(c) ? colors.indigo : colors.text,
  },
  rangeControl: {
    width: 136,
  },
  balance: {
    marginTop: 10,
    fontFamily: fonts.jakartaExtraBold,
    letterSpacing: -1.5,
    color: colors.text,
    includeFontPadding: false,
    ...tabular,
  },
  changeLine: {
    marginTop: 4,
  },
  changeAmount: {
    fontFamily: fonts.jakartaSemiBold,
    fontSize: 13,
    lineHeight: 18,
    ...tabular,
  },
  changeMuted: {
    fontFamily: fonts.jakartaMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  syncText: {
    flexShrink: 1,
  },
  chart: {
    marginTop: 12,
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  stripText: {
    flexShrink: 1,
    fontFamily: fonts.jakartaSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onAccent,
  },
  tiles: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  tileWrap: {
    flex: 1,
    minWidth: 0,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderRadius: radii.tile,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    ...lightLift(c),
  },
  tileText: {
    flex: 1,
    minWidth: 0,
  },
  tileAmount: {
    fontFamily: fonts.jakartaBold,
    fontSize: 17,
    lineHeight: 22,
  },
  nudge: {
    marginTop: 14,
    ...lightLift(c),
  },
  nudgeClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalsTitle: {
    marginTop: 26,
  },
  goals: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginTop: 14,
  },
  goalWrap: {
    flex: 1,
    minWidth: 0,
  },
  goalCard: {
    flex: 1,
    padding: 16,
    gap: 14,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    ...lightLift(c),
  },
  goalAdd: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  recent: {
    marginTop: 26,
  },
  goalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ring: {
    alignSelf: 'center',
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 84,
  },
  ringPercent: {
    fontFamily: fonts.jakartaExtraBold,
    fontSize: 24,
    lineHeight: 28,
    includeFontPadding: false,
  },
  ringAmount: {
    fontFamily: fonts.jakartaExtraBold,
    fontSize: 20,
    lineHeight: 24,
    color: colors.text,
    includeFontPadding: false,
  },
  goalText: {
    gap: 2,
  },
}));
