import React, {useEffect, useMemo, useState} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  LayoutChangeEvent,
  RefreshControl,
  ScrollView,
} from 'react-native';
import {Text, View, styled} from '@tamagui/core';
import {XStack, YStack} from '@tamagui/stacks';

import {RefreshGlyph, TrendUpGlyph} from '../../components/icons/Glyphs';
import {ProgressBar, Screen} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {formatMoney} from '../../lib/formatMoney';
import {colors, layout, radii} from '../../theme';
import {useFloatingNavClearance, useFloatingNavScroll} from '../NavBar/FloatingNavScroll';
import {BalanceBackdrop} from './BalanceBackdrop';
import {DonutChart} from './charts';
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
const DONUT_SIZE = 132;
const MAX_VISIBLE_SLICES = 4;
const RANGE_PAD = 4;
const RANGE_SEG_H = 40;

const TINTS = {
  income: '#E8F5EE',
  expense: '#FDECEA',
  saved: '#FBF0DA',
  budget: '#E8F0FE',
  savings: '#FFE8E8',
} as const;

const tabular = {fontVariant: ['tabular-nums'] as const};

function pressMotion(reduced: boolean) {
  return {
    transition: reduced ? ('0ms' as const) : ('100ms' as const),
    pressStyle: {scale: reduced ? 1 : 0.97},
  };
}

const Circle = styled(View, {
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
});

const Card = styled(YStack, {
  backgroundColor: colors.surface,
  borderRadius: radii.card,
  borderWidth: 1,
  borderColor: colors.hairline,
  shadowColor: '#0F1A2E',
  shadowOpacity: 0.06,
  shadowRadius: 14,
  shadowOffset: {width: 0, height: 5},
  elevation: 2,
});

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
    return error ? `${error} · Tap to retry` : 'Could not sync · Tap to retry';
  }
  if (empty) {
    return 'No activity yet · Tap to sync';
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
  const tint = kind === 'income' ? TINTS.income : kind === 'expense' ? TINTS.expense : TINTS.saved;
  return (
    <Circle width={28} height={28} backgroundColor={tint}>
      {kind === 'saved' ? (
        <Text fontSize={13} lineHeight={16} color={colors.ink}>
          🌿
        </Text>
      ) : (
        <YStack transform={kind === 'expense' ? [{scaleY: -1}] : undefined}>
          <TrendUpGlyph color={kind === 'income' ? colors.positive : colors.danger} size={13} />
        </YStack>
      )}
    </Circle>
  );
});

function StatTile({
  kind,
  label,
  amount,
  currencySymbol,
  barColor,
  barPercent,
}: {
  kind: SummaryKind;
  label: string;
  amount: number;
  currencySymbol: string;
  barColor: string;
  barPercent: number;
}) {
  return (
    <Card flex={1} minWidth={0} paddingVertical={14} paddingHorizontal={10} gap={8}>
      <SummaryIcon kind={kind} />
      <YStack gap={2} minWidth={0}>
        <Text fontSize={11} lineHeight={15} fontWeight="600" color={colors.inkMuted} numberOfLines={1}>
          {label}
        </Text>
        <Text
          fontSize={15}
          lineHeight={20}
          fontWeight="700"
          letterSpacing={-0.3}
          color={colors.ink}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={tabular}>
          {formatMoney(amount, currencySymbol, {decimals: 0})}
        </Text>
      </YStack>
      <YStack height={3} width="100%" backgroundColor={colors.hairline} borderRadius={999} overflow="hidden">
        <YStack
          height={3}
          borderRadius={999}
          backgroundColor={barColor}
          width={`${Math.min(100, Math.max(0, barPercent))}%`}
        />
      </YStack>
    </Card>
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
  const spentPct = income > 0 ? (spent / income) * 100 : 0;
  const savedPct = income > 0 ? (Math.max(0, saved) / income) * 100 : 0;

  return (
    <XStack alignItems="stretch" gap={8} marginBottom={16}>
      <StatTile
        kind="income"
        label="Income"
        amount={income}
        currencySymbol={currencySymbol}
        barColor={colors.positive}
        barPercent={100}
      />
      <StatTile
        kind="expense"
        label="Expenses"
        amount={spent}
        currencySymbol={currencySymbol}
        barColor={colors.danger}
        barPercent={spentPct}
      />
      <StatTile
        kind="saved"
        label="Saved"
        amount={Math.max(0, saved)}
        currencySymbol={currencySymbol}
        barColor={colors.accent}
        barPercent={savedPct}
      />
    </XStack>
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
    <Card padding={20} marginBottom={16} gap={18}>
      <XStack alignItems="center" justifyContent="space-between">
        <YStack gap={2}>
          <Text fontSize={18} lineHeight={24} fontWeight="600" letterSpacing={-0.3} color={colors.ink}>
            Spending
          </Text>
          <Text fontSize={12} lineHeight={17} fontWeight="500" color={colors.inkMuted}>
            By category
          </Text>
        </YStack>
        {hasSlices ? (
          <XStack
            alignItems="center"
            gap={6}
            paddingHorizontal={10}
            paddingVertical={5}
            borderRadius={999}
            backgroundColor={overBudget ? TINTS.expense : TINTS.income}
            accessibilityRole="text"
            accessibilityLabel={`Spending ${overBudget ? 'off track' : 'on track'}`}>
            <Circle width={6} height={6} backgroundColor={tone} />
            <Text fontSize={12} lineHeight={16} fontWeight="600" color={tone}>
              {overBudget ? 'Off track' : 'On track'}
            </Text>
          </XStack>
        ) : null}
      </XStack>

      <XStack alignItems="center" gap={18}>
        <DonutChart
          slices={hasSlices ? safeSlices : [{id: 'empty', label: 'None', color: colors.hairline, percent: 100}]}
          size={DONUT_SIZE}>
          <YStack alignItems="center" justifyContent="center">
            <Text fontSize={11} lineHeight={15} fontWeight="600" color={colors.inkMuted} marginBottom={2}>
              Spent
            </Text>
            <Text fontSize={14} lineHeight={18} fontWeight="700" color={colors.ink} numberOfLines={1} style={tabular}>
              {formatMoney(spent, currencySymbol, {decimals: 0})}
            </Text>
          </YStack>
        </DonutChart>

        {hasSlices ? (
          <YStack flex={1} minWidth={0} justifyContent="center" gap={12}>
            {visibleSlices.map(slice => (
              <YStack key={slice.id} gap={5}>
                <XStack alignItems="center" gap={8}>
                  <Circle width={8} height={8} backgroundColor={slice.color} />
                  <Text
                    flex={1}
                    fontSize={12}
                    lineHeight={16}
                    fontWeight="500"
                    color={colors.inkSecondary}
                    numberOfLines={1}>
                    {slice.label}
                  </Text>
                  <Text
                    minWidth={36}
                    textAlign="right"
                    fontSize={12}
                    lineHeight={16}
                    fontWeight="700"
                    color={colors.ink}
                    style={tabular}>
                    {slice.percent}%
                  </Text>
                </XStack>
                <YStack height={3} backgroundColor={colors.canvasSunk} borderRadius={999} overflow="hidden">
                  <YStack
                    height={3}
                    borderRadius={999}
                    backgroundColor={slice.color}
                    width={`${Math.min(100, Math.max(0, slice.percent))}%`}
                  />
                </YStack>
              </YStack>
            ))}
            {remainder > 0 ? (
              <Text fontSize={12} lineHeight={17} fontWeight="500" color={colors.inkMuted}>
                +{remainder} more
              </Text>
            ) : null}
          </YStack>
        ) : (
          <YStack flex={1} minWidth={0} justifyContent="center">
            <Text fontSize={13} lineHeight={19} fontWeight="500" color={colors.inkMuted}>
              Nothing logged yet — spending will show up here once you add it.
            </Text>
          </YStack>
        )}
      </XStack>
    </Card>
  );
});

type MetricCardProps = {
  iconTint: string;
  emoji: string;
  title: string;
  amount: number;
  amountColor: string;
  currencySymbol: string;
  subtitle: string;
  progress: number;
  progressColor: string;
  footerLeft: string;
  footerRight: React.ReactNode;
  accessibilityLabel: string;
  onPress?: () => void;
};

function MetricCard({
  iconTint,
  emoji,
  title,
  amount,
  amountColor,
  currencySymbol,
  subtitle,
  progress,
  progressColor,
  footerLeft,
  footerRight,
  accessibilityLabel,
  onPress,
}: MetricCardProps) {
  const reducedMotion = useReducedMotion();
  const press = pressMotion(reducedMotion);

  return (
    <Card
      flex={1}
      minWidth={0}
      padding={16}
      gap={4}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      transition={press.transition}
      pressStyle={press.pressStyle}>
      <XStack alignItems="center" marginBottom={8}>
        <YStack
          width={28}
          height={28}
          borderRadius={10}
          alignItems="center"
          justifyContent="center"
          backgroundColor={iconTint}
          marginRight={8}>
          <Text fontSize={13} lineHeight={16}>
            {emoji}
          </Text>
        </YStack>
        <Text flex={1} fontSize={13} lineHeight={18} fontWeight="600" color={colors.ink} numberOfLines={1}>
          {title}
        </Text>
        <Text fontSize={16} lineHeight={18} fontWeight="500" color={colors.inkMuted}>
          ›
        </Text>
      </XStack>
      <Text
        fontSize={24}
        lineHeight={28}
        fontWeight="700"
        letterSpacing={-0.6}
        color={amountColor}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={tabular}>
        {formatMoney(amount, currencySymbol, {decimals: 0})}
      </Text>
      <Text fontSize={12} lineHeight={17} fontWeight="500" color={colors.inkMuted} numberOfLines={2}>
        {subtitle}
      </Text>
      <YStack marginTop="auto" paddingTop={14} gap={8}>
        <ProgressBar progress={progress} color={progressColor} />
        <XStack alignItems="center" justifyContent="space-between" gap={8}>
          <Text fontSize={12} lineHeight={17} fontWeight="500" color={colors.inkMuted}>
            {footerLeft}
          </Text>
          {footerRight}
        </XStack>
      </YStack>
    </Card>
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
      iconTint={TINTS.budget}
      emoji="💰"
      title="Budget"
      amount={Math.abs(remainingBudget)}
      amountColor={overBudget ? colors.danger : colors.ink}
      currencySymbol={currencySymbol}
      subtitle={overBudget ? `over ${scope}` : `left ${scope}`}
      progress={progress}
      progressColor={overBudget ? colors.danger : colors.accent}
      footerLeft={overBudget ? 'Over budget' : `${usedPct}% used`}
      footerRight={
        <Text fontSize={12} lineHeight={17} fontWeight="600" color={colors.inkMuted} numberOfLines={1} style={tabular}>
          {formatMoney(usedAmount, currencySymbol, {decimals: 0})}
        </Text>
      }
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
    periodSavingsTarget > 0 ? Math.max(0, Math.min(1, saved / periodSavingsTarget)) : saved > 0 ? 1 : 0;
  const savedPct = Math.round(progress * 100);
  const planSuffix = savingsUsesPlannedIncome ? ' · vs plan' : '';
  const subtitle =
    periodSavingsTarget > 0
      ? `of ${formatMoney(periodSavingsTarget, currencySymbol, {decimals: 0})} ${scope}${planSuffix}`
      : `saved ${scope}${planSuffix}`;

  return (
    <MetricCard
      iconTint={TINTS.savings}
      emoji="🎯"
      title="Savings"
      amount={saved}
      amountColor={colors.ink}
      currencySymbol={currencySymbol}
      subtitle={subtitle}
      progress={progress}
      progressColor={onTrack ? colors.positive : colors.danger}
      footerLeft={`${savedPct}% of goal`}
      footerRight={
        <XStack alignItems="center" gap={4}>
          <Circle width={6} height={6} backgroundColor={onTrack ? colors.positive : colors.danger} />
          <Text fontSize={12} lineHeight={17} fontWeight="600" color={onTrack ? colors.positive : colors.danger}>
            {onTrack ? 'On track' : 'Off track'}
          </Text>
        </XStack>
      }
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

  return (
    <XStack
      accessibilityRole="tablist"
      alignItems="center"
      backgroundColor={colors.canvasSunk}
      borderRadius={999}
      padding={RANGE_PAD}
      marginBottom={16}
      overflow="hidden"
      onLayout={onTrackLayout}>
      <YStack
        position="absolute"
        top={RANGE_PAD}
        left={RANGE_PAD}
        height={RANGE_SEG_H}
        width={segmentW}
        borderRadius={999}
        backgroundColor={colors.ink}
        x={slideX}
        transition={reducedMotion ? '0ms' : 'quick'}
      />
      {RANGES.map(item => {
        const selected = range === item.id;
        return (
          <XStack
            key={item.id}
            flex={1}
            zIndex={1}
            alignItems="center"
            justifyContent="center"
            height={RANGE_SEG_H}
            borderRadius={999}
            onPress={() => setRange(item.id)}
            accessibilityRole="tab"
            accessibilityState={{selected}}
            transition={reducedMotion ? '0ms' : '100ms'}
            pressStyle={{scale: reducedMotion ? 1 : 0.97}}>
            <Text
              fontSize={14}
              lineHeight={20}
              fontWeight="600"
              letterSpacing={-0.1}
              color={selected ? colors.onInk : colors.inkSecondary}>
              {item.label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
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
  const navScroll = useFloatingNavScroll();
  const reducedMotion = useReducedMotion();
  const press = pressMotion(reducedMotion);

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
  const showChangeBadge = !data.empty && data.changePct != null;
  const syncLabel = syncCaption(status, refreshing, error, updatedAt, data.empty);
  const savedAmount = data.actualSavings;
  const rangeWord = range === 'week' ? 'week' : range === 'year' ? 'year' : 'month';
  const showBudget = data.monthlyBudget > 0;
  const showSavings = data.monthlySavingsGoal > 0;
  const syncTone =
    status === 'error' ? colors.danger : data.empty && status === 'ready' ? colors.inkMuted : colors.positive;

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={{flex: 1}}
        contentContainerStyle={{
          paddingHorizontal: layout.screenPadding,
          paddingTop: 12,
          paddingBottom: navClearance,
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
        <XStack alignItems="center" gap={12} marginBottom={16}>
          <YStack flex={1} minWidth={0} gap={2}>
            <Text fontSize={13} lineHeight={18} fontWeight="500" color={colors.inkMuted} numberOfLines={1}>
              {timeGreeting()}
            </Text>
            <Text
              fontSize={32}
              lineHeight={36}
              fontWeight="700"
              letterSpacing={-1}
              color={colors.ink}
              numberOfLines={1}>
              {firstName}
            </Text>
          </YStack>
          <Circle
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            backgroundColor={colors.accentSoft}
            borderWidth={2}
            borderColor={colors.surface}
            overflow="hidden"
            onPress={onProfilePress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            transition={press.transition}
            pressStyle={{scale: reducedMotion ? 1 : 0.94}}>
            {hasSecureAvatar ? (
              <Image
                source={{uri: avatarUrl}}
                style={{width: AVATAR_SIZE, height: AVATAR_SIZE}}
                resizeMode="cover"
              />
            ) : (
              <Text fontSize={14} lineHeight={18} fontWeight="700" color={colors.ink}>
                {initials}
              </Text>
            )}
          </Circle>
        </XStack>

        <Card
          overflow="hidden"
          paddingVertical={16}
          paddingLeft={20}
          paddingRight={8}
          marginBottom={14}
          backgroundColor={colors.surface}>
          <XStack alignItems="center" gap={4}>
            <YStack flex={1} minWidth={0} gap={4}>
              <Text fontSize={12} lineHeight={16} fontWeight="600" color={colors.inkMuted}>
                Available balance
              </Text>
              <Text
                fontSize={40}
                lineHeight={46}
                fontWeight="700"
                letterSpacing={-1.6}
                color={data.balance < 0 ? colors.danger : colors.ink}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={tabular}>
                {formatMoney(data.balance, currencySymbol, {decimals: 0})}
              </Text>
              {showChangeBadge ? (
                <XStack
                  alignItems="center"
                  alignSelf="flex-start"
                  paddingHorizontal={9}
                  paddingVertical={5}
                  borderRadius={999}
                  gap={4}
                  marginTop={4}
                  backgroundColor={changePositive ? TINTS.income : TINTS.expense}
                  transition={reducedMotion ? '0ms' : '150ms'}
                  enterStyle={reducedMotion ? undefined : {opacity: 0, scale: 0.96}}>
                  <YStack transform={changePositive ? undefined : [{scaleY: -1}]}>
                    <TrendUpGlyph color={changePositive ? colors.positive : colors.danger} size={10} />
                  </YStack>
                  <Text
                    fontSize={12}
                    lineHeight={16}
                    fontWeight="600"
                    color={changePositive ? colors.positive : colors.danger}>
                    {`${changePositive ? '+' : ''}${data.changePct}% vs last ${rangeWord}`}
                  </Text>
                </XStack>
              ) : (
                <Text fontSize={12} lineHeight={16} fontWeight="500" color={colors.inkMuted} marginTop={4}>
                  {data.empty ? 'Add a transaction to start tracking' : `This ${rangeWord}`}
                </Text>
              )}
            </YStack>
            <YStack flexShrink={0} marginRight={-28} marginVertical={-16}>
              <BalanceBackdrop />
            </YStack>
          </XStack>
        </Card>

        <XStack
          alignItems="center"
          minHeight={36}
          gap={8}
          marginBottom={16}
          paddingHorizontal={12}
          paddingVertical={8}
          borderRadius={999}
          backgroundColor={colors.canvasSunk}
          alignSelf="stretch"
          onPress={reload}
          accessibilityRole="button"
          accessibilityLabel={`Sync now. ${syncLabel}`}
          transition={press.transition}
          pressStyle={press.pressStyle}>
          {refreshing || status === 'loading' ? (
            <ActivityIndicator size="small" color={colors.inkMuted} />
          ) : (
            <RefreshGlyph color={colors.inkMuted} size={12} />
          )}
          <Circle width={6} height={6} backgroundColor={syncTone} />
          <Text
            flex={1}
            fontSize={12}
            lineHeight={17}
            fontWeight="500"
            color={status === 'error' ? colors.danger : colors.inkMuted}
            numberOfLines={1}>
            {syncLabel}
          </Text>
        </XStack>

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
          <XStack alignItems="stretch" marginBottom={16} gap={10}>
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
          </XStack>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
