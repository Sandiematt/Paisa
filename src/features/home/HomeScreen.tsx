import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {Text} from '@tamagui/core';

import {
  ArrowDownRightIcon,
  ChevronRightIcon,
  CreditCardIcon,
  TrendingUpIcon,
} from '../../components/icons/FeatherIcons';
import {
  MoneyInGlyph,
  MoneyOutGlyph,
  RefreshGlyph,
  SavedGlyph,
} from '../../components/icons/Glyphs';
import {GlassPanel, PressableScale, ProgressBar, Screen} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {formatMoney} from '../../lib/formatMoney';
import {colors, fonts, layout, radii, shadows} from '../../theme';
import {useFloatingNavClearance, useFloatingNavDockHeight, useFloatingNavScroll} from '../NavBar/FloatingNavScroll';
import {DonutChart} from './charts';
import {HomeAmbient} from './HomeAmbient';
import {HomeRange, HomeReport, SpendSlice, rangeScopeLabel} from './homeReport';

type DashboardStatus = 'loading' | 'ready' | 'error';

type HomeScreenProps = {
  name: string;
  currencySymbol: string;
  avatarUrl?: string;
  onProfilePress?: () => void;
  onBudgetPress?: () => void;
  onSavingsPress?: () => void;
  report: HomeReport;
  status: DashboardStatus;
  refreshing: boolean;
  error: string | null;
  updatedAt: Date | null;
  reload: () => void;
  range: HomeRange;
  setRange: (range: HomeRange) => void;
};

const RANGES: {id: HomeRange; label: string}[] = [
  {id: 'week', label: 'Week'},
  {id: 'month', label: 'Month'},
  {id: 'year', label: 'Year'},
];

const AVATAR_SIZE = 44;
const DONUT_SIZE = 104;
const MAX_VISIBLE_SLICES = 4;
const RANGE_PAD = 5;
const RANGE_SEG_H = 34;

const TINTS = {
  income: colors.alertPositive,
  expense: colors.alertDanger,
  saved: colors.accentSoft,
} as const;

const tabular = {fontVariant: ['tabular-nums'] as const};

function Circle({
  size,
  backgroundColor,
  borderColor,
  children,
  style,
}: {
  size: number;
  backgroundColor?: string;
  borderColor?: string;
  children?: React.ReactNode;
  style?: object;
}) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: backgroundColor ?? 'transparent',
          borderWidth: borderColor ? 1 : 0,
          borderColor,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up,';
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  if (hour < 21) return 'Good evening,';
  return 'Good night,';
}

function isSafeAvatarUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
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

type SummaryKind = 'income' | 'expense' | 'saved';

const SummaryIcon = React.memo(function SummaryIcon({kind}: {kind: SummaryKind}) {
  if (kind === 'income') {
    return <MoneyInGlyph color={colors.positive} size={16} />;
  }
  if (kind === 'expense') {
    return <MoneyOutGlyph color={colors.danger} size={16} />;
  }
  return <SavedGlyph color="#C88A2E" size={16} />;
});

function IconDisk({
  size,
  backgroundColor,
  borderColor,
  children,
}: {
  size: number;
  backgroundColor: string;
  borderColor: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor,
      }}>
      {children}
    </View>
  );
}

function StatTile({
  kind,
  label,
  amount,
  currencySymbol,
}: {
  kind: SummaryKind;
  label: string;
  amount: number;
  currencySymbol: string;
}) {
  const disk =
    kind === 'income'
      ? {backgroundColor: TINTS.income, borderColor: '#3F7A4E33'}
      : kind === 'expense'
        ? {backgroundColor: TINTS.expense, borderColor: '#C0523A33'}
        : {backgroundColor: TINTS.saved, borderColor: '#C88A2E33'};

  return (
    <GlassPanel style={[styles.statCard, shadows.cardSoft]} radius={radii.card} contentStyle={styles.statInner}>
      <IconDisk size={32} {...disk}>
        <SummaryIcon kind={kind} />
      </IconDisk>
      <Text
        fontFamily={fonts.interMedium}
        fontSize={12}
        lineHeight={16}
        fontWeight="500"
        color={colors.inkSecondary}
        numberOfLines={1}>
        {label}
      </Text>
      <Text
        fontFamily={fonts.outfitSemi}
        fontSize={17}
        lineHeight={22}
        fontWeight="600"
        color={colors.ink}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={tabular}>
        {formatMoney(amount, currencySymbol, {decimals: 0})}
      </Text>
    </GlassPanel>
  );
}

const SummaryRow = React.memo(function SummaryRow({
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
    <View style={styles.statRow}>
      <StatTile kind="income" label="Income" amount={income} currencySymbol={currencySymbol} />
      <StatTile kind="expense" label="Expenses" amount={spent} currencySymbol={currencySymbol} />
      <StatTile kind="saved" label="Saved" amount={Math.max(0, saved)} currencySymbol={currencySymbol} />
    </View>
  );
});

const SpendingCard = React.memo(function SpendingCard({
  slices,
  spent,
  currencySymbol,
  overBudget,
}: {
  slices: SpendSlice[] | undefined;
  spent: number;
  currencySymbol: string;
  overBudget: boolean;
}) {
  const tone = overBudget ? colors.danger : colors.positive;
  const safeSlices = slices ?? [];
  const hasSlices = safeSlices.length > 0;
  const visibleSlices = safeSlices.slice(0, MAX_VISIBLE_SLICES);
  const remainder = safeSlices.length - visibleSlices.length;

  return (
    <GlassPanel style={[styles.spendCard, shadows.card]} radius={24} contentStyle={styles.spendInner}>
      <View style={styles.rowBetween}>
        <View>
          <Text
            fontFamily={fonts.outfitSemi}
            fontSize={18}
            lineHeight={24}
            fontWeight="600"
            letterSpacing={-0.45}
            color={colors.ink}>
            Spending
          </Text>
          <Text fontFamily={fonts.interMedium} fontSize={12} lineHeight={16} fontWeight="500" color={colors.inkMuted}>
            By category
          </Text>
        </View>
        {hasSlices ? (
          <View
            style={[
              styles.chip,
              {
                backgroundColor: overBudget ? TINTS.expense : TINTS.income,
                borderColor: overBudget ? '#C0523A40' : '#3F7A4E40',
              },
            ]}
            accessibilityRole="text"
            accessibilityLabel={`Spending ${overBudget ? 'off track' : 'on track'}`}>
            <Circle size={6} backgroundColor={tone} />
            <Text fontFamily={fonts.interSemi} fontSize={11} lineHeight={15} fontWeight="600" color={tone}>
              {overBudget ? 'Off track' : 'On track'}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.spendBody}>
        <DonutChart
          slices={hasSlices ? safeSlices : [{id: 'empty', label: 'None', color: colors.hairline, percent: 100}]}
          size={DONUT_SIZE}>
          <View style={styles.donutLabel}>
            <Text
              fontFamily={fonts.interMedium}
              fontSize={10}
              lineHeight={13}
              fontWeight="500"
              color={colors.inkMuted}>
              Spent
            </Text>
            <Text
              fontFamily={fonts.outfitSemi}
              fontSize={15}
              lineHeight={18}
              fontWeight="600"
              color={colors.ink}
              numberOfLines={1}
              style={tabular}>
              {formatMoney(spent, currencySymbol, {decimals: 0})}
            </Text>
          </View>
        </DonutChart>

        {hasSlices ? (
          <View style={styles.categoryCol}>
            {visibleSlices.map(slice => (
              <View key={slice.id} style={styles.categoryBlock}>
                <View style={styles.rowBetween}>
                  <View style={styles.categoryName}>
                    <Circle size={7} backgroundColor={slice.color} />
                    <Text
                      fontFamily={fonts.interMedium}
                      fontSize={13}
                      lineHeight={17}
                      fontWeight="500"
                      color={colors.inkSecondary}
                      numberOfLines={1}
                      style={{flex: 1}}>
                      {slice.label}
                    </Text>
                  </View>
                  <Text
                    fontFamily={fonts.interSemi}
                    fontSize={13}
                    lineHeight={17}
                    fontWeight="600"
                    color={colors.ink}
                    style={tabular}>
                    {slice.percent}%
                  </Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.trackFill,
                      {
                        backgroundColor: slice.color,
                        width: `${Math.min(100, Math.max(0, slice.percent))}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
            {remainder > 0 ? (
              <Text fontSize={12} lineHeight={17} fontWeight="500" color={colors.inkMuted}>
                +{remainder} more
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.categoryCol}>
            <Text fontSize={13} lineHeight={19} fontWeight="500" color={colors.inkMuted}>
              Nothing logged yet — spending will show up here once you add it.
            </Text>
          </View>
        )}
      </View>
    </GlassPanel>
  );
});

type MetricCardProps = {
  title: string;
  amount: number;
  amountColor: string;
  currencySymbol: string;
  progress: number;
  progressColor: string;
  progressGradient?: [string, string];
  footerLeft: string;
  footerTone: string;
  accessibilityLabel: string;
  icon: React.ReactNode;
  iconBackground: string;
  iconBorder: string;
  onPress?: () => void;
};

function MetricCard({
  title,
  amount,
  amountColor,
  currencySymbol,
  progress,
  progressColor,
  progressGradient,
  footerLeft,
  footerTone,
  accessibilityLabel,
  icon,
  iconBackground,
  iconBorder,
  onPress,
}: MetricCardProps) {
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      containerStyle={styles.metricWrap}
      style={[styles.metricPress, shadows.cardSoft]}>
      <GlassPanel radius={radii.cardMetric} contentStyle={styles.metricCard} style={styles.metricGlass}>
      <View style={styles.rowBetween}>
        <View style={styles.metricTitle}>
          <IconDisk size={28} backgroundColor={iconBackground} borderColor={iconBorder}>
            {icon}
          </IconDisk>
          <Text fontFamily={fonts.interSemi} fontSize={13} lineHeight={18} fontWeight="600" color={colors.ink}>
            {title}
          </Text>
        </View>
        <ChevronRightIcon color={colors.inkMuted} size={16} />
      </View>
      <Text
        fontFamily={fonts.outfitBold}
        fontSize={22}
        lineHeight={26}
        fontWeight="700"
        color={amountColor}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={tabular}>
        {formatMoney(amount, currencySymbol, {decimals: 0})}
      </Text>
      <ProgressBar progress={progress} color={progressColor} gradient={progressGradient} />
      <Text fontFamily={fonts.interMedium} fontSize={11} lineHeight={15} fontWeight="500" color={footerTone}>
        {footerLeft}
      </Text>
      </GlassPanel>
    </PressableScale>
  );
}

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
  const usedPct = budget > 0 ? Math.min(100, Math.round((usedAmount / budget) * 100)) : 0;

  return (
    <MetricCard
      title="Budget"
      amount={Math.abs(remainingBudget)}
      amountColor={overBudget ? colors.danger : colors.ink}
      currencySymbol={currencySymbol}
      progress={progress}
      progressColor={overBudget ? colors.danger : colors.accent}
      progressGradient={overBudget ? ['#D98A2B', '#C0523A'] : ['#D98A2B', '#E8B15A']}
      footerLeft={overBudget ? 'Over budget' : `${usedPct}% used`}
      footerTone={overBudget ? colors.danger : colors.inkMuted}
      icon={<CreditCardIcon color={colors.gold} size={14} />}
      iconBackground={TINTS.saved}
      iconBorder="#C88A2E33"
      accessibilityLabel={`Budget, ${formatMoney(Math.abs(remainingBudget), currencySymbol, {
        decimals: 0,
      })} ${overBudget ? `over ${scope}` : `left ${scope}`}`}
      onPress={onPress}
    />
  );
}

function SavingsGoalCard({
  actualSavings,
  periodSavingsTarget,
  savingsVsTarget,
  savingsUsesPlannedIncome: _savingsUsesPlannedIncome,
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
    periodSavingsTarget > 0 ? Math.max(0, Math.min(1, saved / periodSavingsTarget)) : saved > 0 ? 1 : 0;
  const savedPct = Math.round(progress * 100);
  return (
    <MetricCard
      title="Savings"
      amount={saved}
      amountColor={colors.ink}
      currencySymbol={currencySymbol}
      progress={progress}
      progressColor={onTrack ? colors.positive : colors.danger}
      progressGradient={onTrack ? ['#3F7A4E', '#6BA85A'] : ['#D98A2B', '#C0523A']}
      footerLeft={`${savedPct}% of goal`}
      footerTone={onTrack ? colors.positive : colors.danger}
      icon={<TrendingUpIcon color={onTrack ? colors.positive : colors.danger} size={14} />}
      iconBackground={onTrack ? TINTS.income : TINTS.expense}
      iconBorder={onTrack ? '#3F7A4E33' : '#C0523A33'}
      accessibilityLabel={`Savings goal, ${formatMoney(saved, currencySymbol, {
        decimals: 0,
      })} saved ${scope}, ${onTrack ? 'on track' : 'off track'}`}
      onPress={onPress}
    />
  );
}

function RangeSwitch({
  range,
  setRange,
}: {
  range: HomeRange;
  setRange: (range: HomeRange) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [trackW, setTrackW] = useState(0);
  const selectedIndex = Math.max(
    0,
    RANGES.findIndex(item => item.id === range),
  );
  const innerW = Math.max(0, trackW - RANGE_PAD * 2);
  const segmentW = innerW > 0 ? innerW / RANGES.length : 0;
  const slideX = selectedIndex * segmentW;

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackW(event.nativeEvent.layout.width);
  };

  const slide = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  useEffect(() => {
    if (segmentW <= 0) {
      return;
    }
    if (!placed.current) {
      slide.setValue(slideX);
      placed.current = true;
      return;
    }
    Animated.timing(slide, {
      toValue: slideX,
      duration: reducedMotion ? 0 : 180,
      useNativeDriver: true,
    }).start();
  }, [reducedMotion, segmentW, slide, slideX]);

  return (
    <View accessibilityRole="tablist" style={styles.rangeTrack} onLayout={onTrackLayout}>
      {segmentW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rangeThumb,
            {width: segmentW, transform: [{translateX: slide}]},
          ]}
        />
      ) : null}
      {RANGES.map(item => {
        const selected = range === item.id;
        return (
          <Pressable
            key={item.id}
            style={styles.rangeSeg}
            onPress={() => setRange(item.id)}
            accessibilityRole="tab"
            accessibilityState={{selected}}>
            <Text
              fontFamily={selected ? fonts.interSemi : fonts.interMedium}
              fontSize={13}
              lineHeight={18}
              fontWeight={selected ? '600' : '500'}
              color={selected ? '#FFFFFF' : colors.inkSecondary}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HomeScreen({
  name,
  currencySymbol,
  avatarUrl,
  onProfilePress,
  onBudgetPress,
  onSavingsPress,
  report: data,
  status,
  refreshing,
  error,
  updatedAt,
  reload,
  range,
  setRange,
}: HomeScreenProps) {
  const navClearance = useFloatingNavClearance();
  const navDockHeight = useFloatingNavDockHeight();
  const navScroll = useFloatingNavScroll();

  useEffect(() => {
    if (status === 'error' && error) {
      AccessibilityInfo.announceForAccessibility(`Sync failed: ${error}`);
    }
  }, [status, error]);

  const {firstName, initials} = useMemo(() => {
    const trimmedName = name.trim() || 'there';
    return {
      firstName: trimmedName.split(/\s+/)[0],
      initials: initialsFrom(trimmedName),
    };
  }, [name]);

  const hasSecureAvatar = isSafeAvatarUrl(avatarUrl);
  const changePositive = (data.changePct ?? data.changeAmount ?? 0) >= 0;
  const showChangeBadge = !data.empty;
  const changePct = Math.abs(data.changePct ?? 0);
  const syncLabel = syncCaption(status, refreshing, error, updatedAt, data.empty);
  const savedAmount = data.actualSavings;
  const rangeWord = range === 'week' ? 'week' : range === 'year' ? 'year' : 'month';
  const showBudget = data.monthlyBudget > 0;
  const showSavings = data.monthlySavingsGoal > 0;
  return (
    <Screen edges={['top']} backdrop={<HomeAmbient />} bottomInset={navDockHeight}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: layout.screenPadding,
          paddingTop: 8,
          paddingBottom: navClearance - navDockHeight,
        }}
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
        <View style={styles.header}>
          <View style={styles.greeting}>
            <Text
              fontFamily={fonts.interMedium}
              fontSize={13}
              lineHeight={18}
              fontWeight="500"
              color={colors.inkSoft}
              numberOfLines={1}>
              {timeGreeting()}
            </Text>
            <Text
              fontFamily={fonts.outfitSemi}
              fontSize={26}
              lineHeight={32}
              fontWeight="600"
              letterSpacing={-0.65}
              color={colors.ink}
              numberOfLines={1}>
              {firstName}
            </Text>
          </View>
          <PressableScale
            scaleTo={0.94}
            onPress={onProfilePress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            style={shadows.avatar}>
            <GlassPanel
              intensity="md"
              overlayColor="#FFFFFFCC"
              radius={AVATAR_SIZE / 2}
              contentStyle={styles.avatarFace}>
              {hasSecureAvatar ? (
                <Image
                  source={{uri: avatarUrl}}
                  style={{width: AVATAR_SIZE, height: AVATAR_SIZE}}
                  resizeMode="cover"
                />
              ) : (
                <Text
                  fontFamily={fonts.outfitSemi}
                  fontSize={15}
                  lineHeight={18}
                  fontWeight="600"
                  color={colors.gold}>
                  {initials}
                </Text>
              )}
            </GlassPanel>
          </PressableScale>
        </View>

        <GlassPanel
          style={styles.heroCard}
          radius={radii.cardHero}
          contentStyle={styles.heroInner}
          overlayColor={colors.glass}>
            <View pointerEvents="none" style={styles.heroGlow} />
            <View style={styles.rowBetween}>
              <Text
                fontFamily={fonts.interMedium}
                fontSize={13}
                lineHeight={18}
                fontWeight="500"
                color={colors.inkSecondary}>
                Available balance
              </Text>
              {showChangeBadge ? (
                <View
                  style={[
                    styles.chip,
                    {
                      backgroundColor: changePositive ? TINTS.income : TINTS.expense,
                      borderColor: changePositive ? '#3F7A4E40' : '#C0523A40',
                    },
                  ]}
                  accessibilityRole="text"
                  accessibilityLabel={`${
                    changePositive ? 'Up' : 'Down'
                  } ${changePct} percent ${data.compareLabel}`}>
                  {changePositive ? (
                    <TrendingUpIcon color={colors.positive} size={13} />
                  ) : (
                    <ArrowDownRightIcon color={colors.danger} size={13} />
                  )}
                  <Text
                    fontFamily={fonts.interSemi}
                    fontSize={11}
                    lineHeight={15}
                    fontWeight="600"
                    color={changePositive ? colors.positive : colors.danger}>
                    {`${changePositive ? '' : '−'}${changePct}%`}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              fontFamily={fonts.outfitBold}
              fontSize={42}
              lineHeight={42}
              fontWeight="700"
              letterSpacing={-1.05}
              color={data.balance < 0 ? colors.danger : colors.ink}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              style={[tabular, styles.heroAmount]}>
              {formatMoney(data.balance, currencySymbol, {decimals: 0})}
            </Text>
            <PressableScale
              onPress={reload}
              accessibilityRole="button"
              accessibilityLabel={`Sync now. ${syncLabel}`}
              style={styles.syncRow}>
              {refreshing || status === 'loading' ? (
                <ActivityIndicator size="small" color={colors.inkMuted} />
              ) : status === 'error' ? (
                <RefreshGlyph color={colors.danger} size={12} />
              ) : null}
              <Text
                fontFamily={fonts.interMedium}
                fontSize={12}
                lineHeight={16}
                fontWeight="500"
                color={status === 'error' ? colors.danger : colors.inkMuted}
                numberOfLines={1}>
                {data.empty
                  ? 'No activity yet • Tap to sync'
                  : `This ${rangeWord} • ${syncLabel}`}
              </Text>
            </PressableScale>
        </GlassPanel>

        <RangeSwitch range={range} setRange={setRange} />

        <SummaryRow
          income={data.income}
          spent={data.spent}
          saved={savedAmount}
          currencySymbol={currencySymbol}
        />

        <SpendingCard
          slices={data.slices}
          spent={data.spent}
          currencySymbol={currencySymbol}
          overBudget={data.overBudget}
        />

        {showBudget || showSavings ? (
          <View style={styles.metricRow}>
            {showBudget ? (
              <BudgetCard
                budget={data.budget}
                remainingBudget={data.remainingBudget}
                currencySymbol={currencySymbol}
                range={range}
                onPress={onBudgetPress}
              />
            ) : null}
            {showSavings ? (
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

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  greeting: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
  },
  statInner: {
    padding: 14,
    gap: 10,
  },
  spendCard: {
    marginBottom: 16,
  },
  spendInner: {
    padding: 20,
    gap: 18,
  },
  spendBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  donutLabel: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  categoryCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 13,
  },
  categoryBlock: {
    gap: 6,
  },
  categoryName: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  track: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  trackFill: {
    height: 6,
    borderRadius: 999,
  },
  heroCard: {
    marginBottom: 18,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 8,
        blurRadius: 28,
        color: 'rgba(120, 100, 60, 0.12)',
      },
      {
        offsetX: 0,
        offsetY: 1,
        blurRadius: 1,
        color: 'rgba(255, 255, 255, 0.6)',
        inset: true,
      },
    ],
  },
  heroInner: {
    padding: 22,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -110,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundImage: [
      {
        type: 'radial-gradient',
        shape: 'circle',
        size: 'farthest-side',
        position: {top: '50%', left: '50%'},
        colorStops: [
          {color: colors.orb, positions: ['0%']},
          {color: 'rgba(240, 200, 120, 0.45)', positions: ['40%']},
          {color: 'rgba(240, 200, 120, 0)', positions: ['72%']},
        ],
      },
    ],
  },
  heroAmount: {
    marginTop: 10,
    includeFontPadding: false,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 8,
    gap: 12,
  },
  metricWrap: {
    flex: 1,
    minWidth: 0,
  },
  metricPress: {
    flex: 1,
  },
  metricGlass: {
    flex: 1,
  },
  metricCard: {
    padding: 16,
    gap: 12,
  },
  metricTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    flex: 1,
  },
  rangeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvasSunk,
    borderRadius: 999,
    padding: RANGE_PAD,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  rangeThumb: {
    position: 'absolute',
    top: RANGE_PAD,
    left: RANGE_PAD,
    height: RANGE_SEG_H,
    borderRadius: 999,
    backgroundColor: colors.ink,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
  },
  rangeSeg: {
    flex: 1,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: RANGE_SEG_H,
  },
  avatarFace: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
