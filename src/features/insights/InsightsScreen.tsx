import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, RefreshControl, ScrollView, Share, StyleSheet, Text, View} from 'react-native';
import {
  ArrowsClockwise,
  Airplane,
  BookOpen,
  Bag,
  ChartBar,
  Car,
  Equals,
  ForkKnife,
  Heartbeat,
  House,
  Lightning,
  ShareFat,
  ShoppingCart,
  Sparkle,
  Tag,
  TrendDown,
  TrendUp,
  WifiSlash,
} from 'phosphor-react-native';
import type {Icon} from 'phosphor-react-native';

import {
  BannerPill,
  Card,
  GradientIconSquare,
  GradientView,
  PressableScale,
  ProgressBar,
  Screen,
  SectionTitle,
  SegmentedControl,
} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {formatMoney} from '../../lib/formatMoney';
import {colors, fonts, layout, linearGradient, typography, withAlpha} from '../../theme';
import {useFloatingNavClearance, useFloatingNavScroll} from '../NavBar/FloatingNavScroll';
import {CategoryIconKey, CategoryTone, TONE_GRADIENT, categoryVisual} from './categoryVisual';
import {
  PeriodLabels,
  buildCategoryRows,
  buildShareText,
  buildSpendingBars,
  compareFractions,
  describeDelta,
  isOfflineError,
  periodLabels,
  previousPeriodLabel,
  updatedLabel,
} from './insightsMath';
import {InsightsData, InsightsPeriod, insightsData} from './insightsPlaceholder';
import type {ChangeKind} from './insightsTypes';
import {buildInsightsDataFromResponse} from './mapInsights';
import {SpendingBars} from './SpendingBars';
import {useInsights} from './useInsights';

export type InsightsScreenProps = {
  currencySymbol: string;
  /** Profile budget, used for the pace line only when the backend reports none. */
  monthlyBudget?: number | null;
  /** Kept so MainTabs wiring is unchanged. The DX header no longer shows an avatar. */
  name?: string;
  avatarUrl?: string;
  onProfilePress?: () => void;
};

const PERIOD_OPTIONS = [
  {value: 'week', label: 'Week'},
  {value: 'month', label: 'Month'},
  {value: 'year', label: 'Year'},
] as const;

const COLLAPSED_CATEGORIES = 6;
const GOLD_GRADIENT = [colors.gold, '#B8862F'] as const;

const CATEGORY_ICONS: Record<CategoryIconKey, Icon> = {
  house: House,
  dining: ForkKnife,
  cart: ShoppingCart,
  bag: Bag,
  car: Car,
  bolt: Lightning,
  health: Heartbeat,
  plane: Airplane,
  repeat: ArrowsClockwise,
  book: BookOpen,
  tag: Tag,
};

const TONE_BAR_COLOR: Record<CategoryTone, string> = {
  primary: colors.lavender,
  rose: colors.roseLight,
  savings: colors.sky,
  strip: colors.violet,
  gold: colors.gold,
};

/**
 * Deterministic hero font size from the rendered length. `adjustsFontSizeToFit`
 * re-measures natively on every change and flashes a small size first, so size
 * from the string up front instead.
 */
function amountFontSize(amountText: string): {fontSize: number; lineHeight: number} {
  if (amountText.length > 11) return {fontSize: 28, lineHeight: 32};
  if (amountText.length > 8) return {fontSize: 34, lineHeight: 38};
  return {fontSize: 40, lineHeight: 44};
}

function toneColor(tone: 'good' | 'bad' | 'neutral'): string {
  if (tone === 'good') return colors.mint;
  if (tone === 'bad') return colors.roseLight;
  return colors.muted;
}

function changeColor(kind: ChangeKind): string {
  if (kind === 'decrease') return colors.mint;
  if (kind === 'no-change') return colors.muted;
  return colors.roseLight;
}

function CategoryIconSquare({tone, icon, size = 40}: {tone: CategoryTone; icon: CategoryIconKey; size?: number}) {
  const IconComponent = CATEGORY_ICONS[icon];
  const gradient = TONE_GRADIENT[tone];
  const onGold = tone === 'gold';
  return (
    <GradientIconSquare
      size={size}
      gradient={gradient ?? 'primary'}
      style={gradient ? undefined : {backgroundImage: linearGradient(GOLD_GRADIENT, 140)}}>
      <IconComponent size={19} color={onGold ? colors.ground : colors.text} weight="fill" />
    </GradientIconSquare>
  );
}

function Header({canShare, onShare}: {canShare: boolean; onShare: () => void}) {
  // Insights is a root tab, so there is nothing to go back to: no back button.
  return (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">
        Insights
      </Text>
      <PressableScale
        onPress={onShare}
        disabled={!canShare}
        scaleTo={0.95}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Share this summary"
        accessibilityState={{disabled: !canShare}}
        style={[styles.shareButton, !canShare ? styles.shareDisabled : null]}>
        <ShareFat size={18} color={colors.text} weight="regular" />
        <Text style={styles.shareText}>Share</Text>
      </PressableScale>
    </View>
  );
}

function SummaryCard({data, labels, currencySymbol}: {data: InsightsData; labels: PeriodLabels; currencySymbol: string}) {
  const money = (value: number) => formatMoney(value, currencySymbol, {decimals: 0});
  const delta = describeDelta(data, labels.deltaTarget, money);
  const deltaColor = toneColor(delta.tone);
  const amountText = money(data.currentTotal);
  const size = amountFontSize(amountText);
  const fractions = compareFractions(data.currentTotal, data.previousTotal);
  const count = data.transactionCount;

  return (
    <GradientView gradient={[colors.surfaceRaised, colors.surface]} angle={160} style={styles.summaryCard}>
      <View style={styles.summaryHead}>
        <Text style={styles.summaryLabel}>{labels.summaryTitle}</Text>
        <Text
          style={[typography.display, size, styles.summaryAmount]}
          numberOfLines={1}
          accessibilityLabel={`${labels.summaryTitle}: ${amountText}`}>
          {amountText}
        </Text>
        <View style={styles.deltaRow}>
          {delta.direction === 'down' ? (
            <TrendDown size={16} color={deltaColor} weight="bold" />
          ) : delta.direction === 'up' ? (
            <TrendUp size={16} color={deltaColor} weight="bold" />
          ) : (
            <Equals size={16} color={deltaColor} weight="bold" />
          )}
          <Text style={[styles.deltaText, {color: deltaColor}]}>{delta.text}</Text>
        </View>
      </View>

      <View style={styles.compare}>
        <View style={styles.compareRow}>
          <View style={styles.compareHead}>
            <Text style={styles.compareLabelStrong}>{labels.currentLabel}</Text>
            <Text style={styles.compareValueStrong}>{money(data.currentTotal)}</Text>
          </View>
          <ProgressBar progress={fractions.current} gradient={[colors.violet, colors.lavender]} height={10} />
        </View>
        <View style={styles.compareRow}>
          <View style={styles.compareHead}>
            <Text style={styles.compareLabel}>
              {labels.previousLabel}
              {labels.previousQualifier ? <Text style={styles.compareQualifier}>{`  ${labels.previousQualifier}`}</Text> : null}
            </Text>
            <Text style={styles.compareValue}>{money(data.previousTotal)}</Text>
          </View>
          <ProgressBar progress={fractions.previous} color={colors.muted} height={10} />
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{money(data.dailyAverage)}</Text>
          <Text style={styles.statLabel}>a day</Text>
        </View>
        <View style={[styles.stat, styles.statDivider]}>
          <Text style={styles.statValue}>{count === null ? '-' : String(count)}</Text>
          <Text style={styles.statLabel}>{count === 1 ? 'transaction' : 'transactions'}</Text>
        </View>
        <View style={[styles.stat, styles.statDivider]}>
          <Text style={styles.statValue}>{data.topWeekday ?? '-'}</Text>
          <Text style={styles.statLabel}>biggest day</Text>
        </View>
      </View>
    </GradientView>
  );
}

function PaceLegend({label}: {label: string}) {
  return (
    <View style={styles.legend}>
      <View style={styles.legendDash} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function BarsCard({data, labels, currencySymbol}: {data: InsightsData; labels: PeriodLabels; currencySymbol: string}) {
  const model = useMemo(() => buildSpendingBars(data), [data]);
  const money = (value: number) => formatMoney(value, currencySymbol, {decimals: 0});
  const paceLabel =
    model.pace === null ? null : `${money(model.pace)} ${model.paceKind === 'budget' ? 'pace' : 'avg'}`;

  return (
    <Card radius={24} padding={18} style={styles.barsCard}>
      <View style={styles.barsHead}>
        <Text style={styles.cardTitle}>{labels.barsTitle}</Text>
        {paceLabel ? <PaceLegend label={paceLabel} /> : null}
      </View>
      <SpendingBars bars={model.bars} pace={model.pace} currencySymbol={currencySymbol} bucketNoun={labels.bucketNoun} />
    </Card>
  );
}

function CategoriesCard({data, currencySymbol}: {data: InsightsData; currencySymbol: string}) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => buildCategoryRows(data.categories), [data.categories]);
  if (rows.length === 0) return null;

  const visible = expanded ? rows : rows.slice(0, COLLAPSED_CATEGORIES);
  const hidden = rows.length - COLLAPSED_CATEGORIES;

  return (
    <>
      <SectionTitle title="Where it went" style={styles.sectionGap} />
      <Card radius={24} padding={0} style={styles.categoryCard}>
        {visible.map((row, index) => {
          const visual = categoryVisual(row.slug, row.label);
          const isLast = index === visible.length - 1 && hidden <= 0;
          const amount = formatMoney(row.amount, currencySymbol, {decimals: 0});
          return (
            <View
              key={row.id}
              style={[styles.categoryRow, !isLast ? styles.categoryRowDivider : null]}
              accessible
              accessibilityLabel={`${row.label}, ${amount}, ${row.sharePct}% of spending`}>
              <CategoryIconSquare tone={visual.tone} icon={visual.icon} />
              <View style={styles.categoryText}>
                <View style={styles.categoryHead}>
                  <Text style={styles.categoryName} numberOfLines={1}>
                    {row.label}
                  </Text>
                  <Text style={styles.categoryAmount}>{amount}</Text>
                </View>
                <ProgressBar progress={row.fraction} color={TONE_BAR_COLOR[visual.tone]} height={4} />
              </View>
            </View>
          );
        })}
        {hidden > 0 ? (
          <PressableScale
            onPress={() => setExpanded(value => !value)}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Show fewer categories' : `Show ${hidden} more categories`}
            style={styles.moreRow}>
            <Text style={styles.moreText}>{expanded ? 'Show fewer' : `Show ${hidden} more`}</Text>
          </PressableScale>
        ) : null}
      </Card>
    </>
  );
}

function AiSummaryCard({data}: {data: InsightsData}) {
  return (
    <GradientView gradient={[colors.surfaceRaised, colors.surface]} angle={160} style={[styles.aiCard, styles.sectionGap]}>
      <View style={styles.aiHeader}>
        <GradientIconSquare size={36} glow>
          <Sparkle size={18} color={colors.text} weight="fill" />
        </GradientIconSquare>
        <View style={styles.aiTitleBlock}>
          <Text style={styles.cardTitle}>AI summary</Text>
          <Text style={styles.caption}>{updatedLabel(data.generatedAt, new Date())}</Text>
        </View>
      </View>

      <Text style={styles.aiBody}>{data.aiSummary}</Text>

      <View style={styles.aiHighlights}>
        {data.aiHighlights.map(highlight => (
          <View key={highlight.id} style={styles.aiHighlightRow}>
            {highlight.tone === 'positive' ? (
              <TrendDown size={16} color={colors.mint} weight="bold" />
            ) : (
              <TrendUp size={16} color={colors.roseLight} weight="bold" />
            )}
            <Text style={styles.aiHighlightText}>{highlight.text}</Text>
          </View>
        ))}
      </View>
    </GradientView>
  );
}

function MovementPanel({data, currencySymbol, caption}: {data: InsightsData; currencySymbol: string; caption: string}) {
  if (data.movements.length === 0) return null;
  return (
    <>
      <SectionTitle title="What changed" style={styles.sectionGap} />
      <Card radius={24} padding={0} style={styles.categoryCard}>
        <Text style={styles.movementCaption}>{`vs ${caption}`}</Text>
        {data.movements.map((item, index) => {
          const tone = changeColor(item.changeKind);
          const isNoChange = item.changeKind === 'no-change';
          const isDecrease = item.changeKind === 'decrease';
          const value = isNoChange
            ? 'No change'
            : item.changeKind === 'new'
            ? 'New'
            : `${(item.deltaPct ?? 0) > 0 ? '+' : ''}${item.deltaPct}%`;
          const spent = `${formatMoney(item.spent, currencySymbol, {decimals: 0})} spent`;
          return (
            <View
              key={item.id}
              style={[styles.movementRow, index < data.movements.length - 1 ? styles.categoryRowDivider : null]}
              accessible
              accessibilityLabel={`${item.label}, ${spent}, ${value}`}>
              <View style={[styles.movementIcon, {backgroundColor: withAlpha(tone, 0.14), borderColor: withAlpha(tone, 0.3)}]}>
                {isNoChange ? (
                  <Equals size={16} color={tone} weight="bold" />
                ) : isDecrease ? (
                  <TrendDown size={16} color={tone} weight="bold" />
                ) : (
                  <TrendUp size={16} color={tone} weight="bold" />
                )}
              </View>
              <View style={styles.movementText}>
                <Text style={styles.categoryName} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={styles.caption}>{spent}</Text>
              </View>
              <Text style={[styles.movementValue, {color: tone}]}>{value}</Text>
            </View>
          );
        })}
      </Card>
    </>
  );
}

function EmptyCard({labels}: {labels: PeriodLabels}) {
  return (
    <Card radius={24} padding={24} style={[styles.emptyCard, styles.sectionGapSmall]}>
      <GradientIconSquare size={48} glow>
        <ChartBar size={24} color={colors.text} weight="fill" />
      </GradientIconSquare>
      <Text style={styles.emptyTitle}>{`No spending ${labels.phrase}`}</Text>
      <Text style={styles.emptyBody}>Add an expense and your charts and categories will show up here.</Text>
    </Card>
  );
}

function StatusBanner({offline, message, onRetry}: {offline: boolean; message: string | null; onRetry: () => void}) {
  return (
    <BannerPill
      style={styles.statusBanner}
      iconGradient={offline ? 'savings' : 'rose'}
      icon={
        offline ? (
          <WifiSlash size={20} color={colors.text} weight="bold" />
        ) : (
          <ArrowsClockwise size={20} color={colors.text} weight="bold" />
        )
      }
      title={offline ? "You're offline" : "Couldn't refresh insights"}
      subtitle={offline ? 'Showing example numbers until you reconnect.' : (message ?? 'Showing example numbers for now.')}
      trailing={<Text style={styles.retryText}>Retry</Text>}
      onPress={onRetry}
      accessibilityLabel="Retry loading insights"
    />
  );
}

/** Pulsing opacity used to animate skeleton blocks while insights are loading. */
function useSkeletonPulse(reducedMotion: boolean): Animated.Value {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {toValue: 1, duration: 650, useNativeDriver: true}),
        Animated.timing(opacity, {toValue: 0.5, duration: 650, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);

  return opacity;
}

function SkeletonBlock({opacity, style}: {opacity: Animated.Value; style?: object}) {
  return <Animated.View style={[styles.skeletonBlock, style, {opacity}]} />;
}

/** Shown while the first fetch for a period is in flight; no fabricated numbers. */
function InsightsSkeleton() {
  const reducedMotion = useReducedMotion();
  const opacity = useSkeletonPulse(reducedMotion);

  return (
    <View accessibilityLabel="Loading insights" accessibilityRole="progressbar">
      <Card radius={24} padding={20} style={styles.skeletonSummary}>
        <SkeletonBlock opacity={opacity} style={styles.skeletonLabel} />
        <SkeletonBlock opacity={opacity} style={styles.skeletonAmount} />
        <SkeletonBlock opacity={opacity} style={styles.skeletonDelta} />
        <SkeletonBlock opacity={opacity} style={styles.skeletonCompare} />
        <SkeletonBlock opacity={opacity} style={styles.skeletonCompare} />
      </Card>

      <Card radius={24} padding={18} style={[styles.barsCard, styles.skeletonBarsCard]}>
        <SkeletonBlock opacity={opacity} style={styles.skeletonLabel} />
        <View style={styles.skeletonBarsRow}>
          {[60, 96, 44, 72].map((height, index) => (
            <SkeletonBlock key={index} opacity={opacity} style={[styles.skeletonBar, {height}]} />
          ))}
        </View>
      </Card>

      <Card radius={24} padding={0} style={[styles.categoryCard, styles.sectionGap]}>
        {[0, 1, 2].map(index => (
          <View key={index} style={[styles.categoryRow, index < 2 ? styles.categoryRowDivider : null]}>
            <SkeletonBlock opacity={opacity} style={styles.skeletonIcon} />
            <View style={styles.categoryText}>
              <SkeletonBlock opacity={opacity} style={styles.skeletonRowLabel} />
              <SkeletonBlock opacity={opacity} style={styles.skeletonRowBar} />
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

export function InsightsScreen({currencySymbol, monthlyBudget = null}: InsightsScreenProps) {
  const navClearance = useFloatingNavClearance();
  const navScroll = useFloatingNavScroll();
  const [period, setPeriod] = useState<InsightsPeriod>('month');
  const [refreshing, setRefreshing] = useState(false);

  const insights = useInsights(period);
  const isLive = insights.status === 'ready' && insights.data !== null;
  const showSkeleton = insights.status === 'loading' && !isLive;
  const hasError = insights.status === 'error';

  const data = useMemo<InsightsData>(() => {
    if (isLive && insights.data) {
      return buildInsightsDataFromResponse(insights.data, monthlyBudget);
    }
    const example = insightsData(currencySymbol, period);
    return monthlyBudget && monthlyBudget > 0 ? {...example, monthlyBudget} : example;
  }, [currencySymbol, isLive, insights.data, monthlyBudget, period]);

  const labels = useMemo(() => periodLabels(data.period, data.referenceDate), [data.period, data.referenceDate]);
  const money = useCallback((value: number) => formatMoney(value, currencySymbol, {decimals: 0}), [currencySymbol]);

  const canShare = isLive && !showSkeleton;
  const onShare = useCallback(async () => {
    try {
      await Share.share({message: buildShareText(data, money)});
    } catch {
      // The user dismissed the sheet or no share target exists; nothing to recover.
    }
  }, [data, money]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await insights.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [insights]);

  const hasSpending = data.currentTotal > 0;

  return (
    <Screen edges={['top']} glow>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, {paddingBottom: navClearance}]}
        onScroll={navScroll.onScroll}
        scrollEventThrottle={navScroll.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.lavender}
            colors={[colors.violet]}
            progressBackgroundColor={colors.surfaceRaised}
          />
        }>
        <Header canShare={canShare} onShare={onShare} />

        <SegmentedControl
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
          style={styles.tabs}
          accessibilityLabel="Insights period"
        />

        {hasError ? (
          <StatusBanner offline={isOfflineError(insights.error)} message={insights.error} onRetry={insights.reload} />
        ) : null}

        {showSkeleton ? (
          <InsightsSkeleton />
        ) : (
          <>
            <SummaryCard data={data} labels={labels} currencySymbol={currencySymbol} />
            {hasSpending ? (
              <>
                <BarsCard data={data} labels={labels} currencySymbol={currencySymbol} />
                <CategoriesCard data={data} currencySymbol={currencySymbol} />
              </>
            ) : (
              <EmptyCard labels={labels} />
            )}
            <AiSummaryCard data={data} />
            <MovementPanel
              data={data}
              currencySymbol={currencySymbol}
              caption={previousPeriodLabel(data.period, data.referenceDate)}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: 6,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  title: {
    ...typography.title,
    color: colors.text,
    flex: 1,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shareDisabled: {
    opacity: 0.4,
  },
  shareText: {
    fontFamily: fonts.jakartaMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  tabs: {
    marginTop: 16,
  },
  statusBanner: {
    marginTop: 16,
  },
  retryText: {
    fontFamily: fonts.jakartaBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.lavender,
    paddingHorizontal: 6,
  },

  // Summary card
  summaryCard: {
    marginTop: 18,
    padding: 20,
    gap: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  summaryHead: {
    gap: 4,
  },
  summaryLabel: {
    fontFamily: fonts.jakartaMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  summaryAmount: {
    color: colors.text,
    includeFontPadding: false,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 2,
  },
  deltaText: {
    flex: 1,
    fontFamily: fonts.jakartaSemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  compare: {
    gap: 12,
  },
  compareRow: {
    gap: 6,
  },
  compareHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  compareLabelStrong: {
    fontFamily: fonts.jakartaSemiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  compareValueStrong: {
    fontFamily: fonts.jakartaSemiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  compareLabel: {
    flexShrink: 1,
    fontFamily: fonts.jakartaMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  compareQualifier: {
    fontFamily: fonts.jakartaRegular,
    fontSize: 12,
    color: colors.muted,
  },
  compareValue: {
    fontFamily: fonts.jakartaMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  stats: {
    flexDirection: 'row',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  stat: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  statDivider: {
    paddingLeft: 14,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  statValue: {
    fontFamily: fonts.jakartaBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: fonts.jakartaRegular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },

  // Bars card
  barsCard: {
    marginTop: 14,
    gap: 12,
  },
  barsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    ...typography.heading,
    color: colors.text,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDash: {
    width: 14,
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: withAlpha(colors.text, 0.5),
  },
  legendText: {
    fontFamily: fonts.jakartaRegular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },

  // Sections
  sectionGap: {
    marginTop: 26,
  },
  sectionGapSmall: {
    marginTop: 14,
  },
  categoryCard: {
    marginTop: 12,
    paddingHorizontal: 16,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  categoryRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  categoryText: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  categoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryName: {
    flexShrink: 1,
    fontFamily: fonts.jakartaSemiBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
  categoryAmount: {
    fontFamily: fonts.jakartaBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  moreRow: {
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  moreText: {
    fontFamily: fonts.jakartaBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.lavender,
  },

  // AI summary
  aiCard: {
    padding: 20,
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiTitleBlock: {
    gap: 1,
  },
  caption: {
    fontFamily: fonts.jakartaRegular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  aiBody: {
    fontFamily: fonts.jakartaMedium,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
  aiHighlights: {
    gap: 8,
  },
  aiHighlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  aiHighlightText: {
    flex: 1,
    fontFamily: fonts.jakartaMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },

  // What changed
  movementCaption: {
    fontFamily: fonts.jakartaRegular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    paddingTop: 14,
  },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  movementIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movementText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  movementValue: {
    fontFamily: fonts.jakartaBold,
    fontSize: 14,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },

  // Empty
  emptyCard: {
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.jakartaRegular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center',
  },

  // Loading skeleton
  skeletonBlock: {
    backgroundColor: colors.surfaceRaised,
  },
  skeletonSummary: {
    marginTop: 18,
    gap: 14,
  },
  skeletonLabel: {
    width: 120,
    height: 14,
    borderRadius: 7,
  },
  skeletonAmount: {
    width: 190,
    height: 40,
    borderRadius: 12,
  },
  skeletonDelta: {
    width: 220,
    height: 14,
    borderRadius: 7,
  },
  skeletonCompare: {
    width: '100%',
    height: 10,
    borderRadius: 5,
  },
  skeletonBarsCard: {
    marginTop: 14,
  },
  skeletonBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 100,
  },
  skeletonBar: {
    width: '21%',
    borderRadius: 14,
  },
  skeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  skeletonRowLabel: {
    width: '45%',
    height: 14,
    borderRadius: 7,
  },
  skeletonRowBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
  },
});
