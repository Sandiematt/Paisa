import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Image, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View} from 'react-native';

import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  BoltIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from '../../components/icons/FeatherIcons';
import {GlassPanel, PressableScale, Screen, Text} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {formatMoney} from '../../lib/formatMoney';
import {colors, fonts, layout, radii, shadows} from '../../theme';
import {useFloatingNavClearance, useFloatingNavScroll} from '../NavBar/FloatingNavScroll';
import {InsightsAmbient} from './InsightsAmbient';
import {ChangeKind, InsightsData, InsightsPeriod, insightsData, previousPeriodLabel} from './insightsPlaceholder';
import {buildInsightsDataFromResponse} from './mapInsights';
import {useInsights} from './useInsights';

export type InsightsScreenProps = {
  currencySymbol: string;
  name?: string;
  avatarUrl?: string;
  onProfilePress?: () => void;
};

const PERIODS: {id: InsightsPeriod; label: string}[] = [
  {id: 'week', label: 'Week'},
  {id: 'month', label: 'Month'},
  {id: 'year', label: 'Year'},
];

const TAB_PAD = 5;
const TAB_SEG_H = 34;
const AVATAR_SIZE = 44;

const tabular = {fontVariant: ['tabular-nums'] as const};

/**
 * Deterministic font size for the hero amount, based on rendered length.
 *
 * We intentionally don't use `adjustsFontSizeToFit`: RN re-measures that
 * natively on every text change, and briefly paints at a shrunk scale
 * before settling — visible as a "small, then normal" flash whenever the
 * amount changes (e.g. switching Week/Month/Year, or data finishing load).
 * Sizing from the string length up front avoids that remeasure entirely.
 */
function amountFontSize(amountText: string): {fontSize: number; lineHeight: number} {
  if (amountText.length > 11) return {fontSize: 28, lineHeight: 32};
  if (amountText.length > 8) return {fontSize: 34, lineHeight: 38};
  return {fontSize: 42, lineHeight: 44};
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
  if (parts.length === 0) return 'S';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function barTone(tone: 'sand' | 'accent' | 'positive'): string {
  if (tone === 'accent') return colors.accent;
  if (tone === 'positive') return colors.positive;
  return colors.orbSand;
}

/** Sliding segmented control — same construction as Home's RangeSwitch. */
function PeriodTabs({period, onChange}: {period: InsightsPeriod; onChange: (period: InsightsPeriod) => void}) {
  const reducedMotion = useReducedMotion();
  const [trackW, setTrackW] = useState(0);
  const selectedIndex = Math.max(0, PERIODS.findIndex(item => item.id === period));
  const innerW = Math.max(0, trackW - TAB_PAD * 2);
  const segmentW = innerW > 0 ? innerW / PERIODS.length : 0;
  const slideX = selectedIndex * segmentW;

  const slide = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  const onTrackLayout = (event: LayoutChangeEvent) => setTrackW(event.nativeEvent.layout.width);

  React.useEffect(() => {
    if (segmentW <= 0) return;
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
    <View accessibilityRole="tablist" style={styles.tabsTrack} onLayout={onTrackLayout}>
      {segmentW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.tabsThumb, {width: segmentW, transform: [{translateX: slide}]}]}
        />
      ) : null}
      {PERIODS.map(item => {
        const selected = period === item.id;
        return (
          <Pressable
            key={item.id}
            style={styles.tabsSeg}
            onPress={() => onChange(item.id)}
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

function ComparisonCard({data, currencySymbol}: {data: InsightsData; currencySymbol: string}) {
  const isDecrease = data.changeKind === 'decrease';
  const isNew = data.changeKind === 'new';
  const isNoChange = data.changeKind === 'no-change';

  const chipTone = isNoChange ? colors.inkMuted : isDecrease ? colors.positive : colors.coral;
  const chipTint = isNoChange ? 'rgba(0, 0, 0, 0.05)' : isDecrease ? colors.alertPositive : colors.alertDanger;
  const chipBorder = isNoChange ? colors.hairlineStrong : isDecrease ? '#3F7A4E40' : '#C0523A40';
  const chipLabel = isNoChange ? 'No change' : isNew ? 'New' : `${Math.abs(data.changePct ?? 0)}%`;

  const deltaText = isNoChange
    ? 'No change'
    : isNew
    ? `+${formatMoney(data.deltaAmount, currencySymbol, {decimals: 0})} new spending`
    : `${isDecrease ? '↓' : '↑'} ${formatMoney(data.deltaAmount, currencySymbol, {decimals: 0})} ${
        isDecrease ? 'less' : 'more'
      }`;

  const amountText = formatMoney(data.currentTotal, currencySymbol, {decimals: 0});
  const amountSize = amountFontSize(amountText);

  return (
    <GlassPanel style={[styles.comparisonWrap, shadows.card]} radius={radii.cardHero} contentStyle={styles.comparisonInner}>
      <View pointerEvents="none" style={styles.comparisonGlow} />
      <View style={styles.rowBetween}>
        <Text fontFamily={fonts.interMedium} fontSize={13} lineHeight={18} fontWeight="500" color={colors.inkSecondary}>
          {`Spent ${data.periodNoun}`}
        </Text>
        <View style={[styles.chip, {backgroundColor: chipTint, borderColor: chipBorder}]}>
          {!isNoChange ? (
            isDecrease ? (
              <ArrowDownRightIcon color={chipTone} size={13} />
            ) : (
              <ArrowUpRightIcon color={chipTone} size={13} />
            )
          ) : null}
          <Text fontFamily={fonts.interSemi} fontSize={11} lineHeight={15} fontWeight="600" color={chipTone}>
            {chipLabel}
          </Text>
        </View>
      </View>

      <Text
        fontFamily={fonts.outfitBold}
        fontSize={amountSize.fontSize}
        lineHeight={amountSize.lineHeight}
        fontWeight="700"
        letterSpacing={-1.05}
        color={colors.ink}
        numberOfLines={1}
        style={[tabular, styles.comparisonAmount]}>
        {amountText}
      </Text>

      <View style={styles.comparisonDeltaRow}>
        <Text fontFamily={fonts.interSemi} fontSize={13} lineHeight={18} fontWeight="600" color={chipTone}>
          {deltaText}
        </Text>
        <Text fontFamily={fonts.interMedium} fontSize={13} lineHeight={18} fontWeight="500" color={colors.inkMuted}>
          {data.comparisonLabel}
        </Text>
      </View>

      <View style={styles.miniBarRow}>
        {data.weeklyBars.map(bar => (
          <View key={bar.label} style={styles.miniBarCol}>
            <View style={styles.miniBarTrack}>
              <View style={[styles.miniBarFill, {height: `${bar.percent}%`, backgroundColor: barTone(bar.tone)}]} />
            </View>
            <Text fontFamily={fonts.interMedium} fontSize={10} lineHeight={13} fontWeight="500" color={colors.inkMuted}>
              {bar.label}
            </Text>
          </View>
        ))}
      </View>
    </GlassPanel>
  );
}

function AiSummaryCard({data}: {data: InsightsData}) {
  return (
    <View style={[styles.aiCard, shadows.card]}>
      <View pointerEvents="none" style={styles.aiGlow} />
      <View style={styles.aiHeaderRow}>
        <View style={styles.aiIconWrap}>
          <BoltIcon color="#FFFFFF" size={16} />
        </View>
        <View style={styles.aiTitleBlock}>
          <Text fontFamily={fonts.outfitSemi} fontSize={15} lineHeight={20} fontWeight="600" color="#FFFFFF">
            AI Summary
          </Text>
          <Text fontFamily={fonts.interMedium} fontSize={11} lineHeight={15} fontWeight="500" color="#B8B2A4">
            Updated just now
          </Text>
        </View>
      </View>

      <Text fontFamily={fonts.interMedium} fontSize={13} lineHeight={20} fontWeight="500" color="#E6E1D7" style={styles.aiBody}>
        {data.aiSummary}
      </Text>

      <View style={styles.aiHighlights}>
        {data.aiHighlights.map(highlight => (
          <View key={highlight.id} style={styles.aiHighlightRow}>
            <View style={styles.aiHighlightIcon}>
              {highlight.tone === 'positive' ? (
                <TrendingDownIcon color="#8FC79A" size={15} />
              ) : (
                <TrendingUpIcon color="#E6A94A" size={15} />
              )}
            </View>
            <Text
              fontFamily={fonts.interMedium}
              fontSize={12}
              lineHeight={16}
              fontWeight="500"
              color="#E6E1D7"
              style={styles.aiHighlightText}>
              {highlight.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MovementRow({
  label,
  spent,
  deltaPct,
  changeKind,
  currencySymbol,
}: {
  label: string;
  spent: number;
  deltaPct: number | null;
  changeKind: ChangeKind;
  currencySymbol: string;
}) {
  const isDecrease = changeKind === 'decrease';
  const isNoChange = changeKind === 'no-change';
  const isNew = changeKind === 'new';

  const tone = isNoChange ? colors.inkMuted : isDecrease ? colors.positive : colors.coral;
  const tint = isNoChange ? 'rgba(0, 0, 0, 0.05)' : isDecrease ? colors.alertPositive : colors.alertDanger;
  const border = isNoChange ? colors.hairlineStrong : isDecrease ? '#3F7A4E33' : '#C0523A33';
  const valueLabel = isNoChange ? 'No change' : isNew ? 'New' : `${(deltaPct ?? 0) > 0 ? '+' : ''}${deltaPct}%`;

  return (
    <View style={styles.movementRow}>
      <View style={[styles.movementIconWrap, {backgroundColor: tint, borderColor: border}]}>
        {isNoChange ? null : isDecrease ? (
          <ArrowDownRightIcon color={tone} size={16} />
        ) : (
          <ArrowUpRightIcon color={tone} size={16} />
        )}
      </View>
      <View style={styles.movementText}>
        <Text fontFamily={fonts.interSemi} fontSize={14} lineHeight={19} fontWeight="600" color={colors.ink}>
          {label}
        </Text>
        <Text fontFamily={fonts.interMedium} fontSize={12} lineHeight={16} fontWeight="500" color={colors.inkMuted}>
          {`${formatMoney(spent, currencySymbol, {decimals: 0})} spent`}
        </Text>
      </View>
      <Text fontFamily={fonts.interSemi} fontSize={14} lineHeight={19} fontWeight="600" color={tone}>
        {valueLabel}
      </Text>
    </View>
  );
}

function CategoryMovementPanel({
  data,
  currencySymbol,
  period,
}: {
  data: InsightsData;
  currencySymbol: string;
  period: InsightsPeriod;
}) {
  return (
    <GlassPanel style={styles.movementWrap} radius={24} contentStyle={styles.movementInner}>
      <View style={styles.rowBetween}>
        <Text fontFamily={fonts.outfitSemi} fontSize={18} lineHeight={24} fontWeight="600" letterSpacing={-0.45} color={colors.ink}>
          What changed
        </Text>
        <Text fontFamily={fonts.interMedium} fontSize={12} lineHeight={16} fontWeight="500" color={colors.inkMuted}>
          {`vs ${previousPeriodLabel(period)}`}
        </Text>
      </View>
      <View style={styles.movementList}>
        {data.movements.map(item => (
          <MovementRow
            key={item.id}
            label={item.label}
            spent={item.spent}
            deltaPct={item.deltaPct}
            changeKind={item.changeKind}
            currencySymbol={currencySymbol}
          />
        ))}
      </View>
    </GlassPanel>
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

/** Shown while the first fetch for a period is in flight — no fabricated numbers. */
function InsightsSkeleton() {
  const reducedMotion = useReducedMotion();
  const opacity = useSkeletonPulse(reducedMotion);

  return (
    <View>
      <GlassPanel style={[styles.comparisonWrap, shadows.card]} radius={radii.cardHero} contentStyle={styles.comparisonInner}>
        <View style={styles.rowBetween}>
          <SkeletonBlock opacity={opacity} style={styles.skeletonLabel} />
          <SkeletonBlock opacity={opacity} style={styles.skeletonChip} />
        </View>
        <SkeletonBlock opacity={opacity} style={styles.skeletonAmount} />
        <SkeletonBlock opacity={opacity} style={styles.skeletonDelta} />
        <View style={styles.miniBarRow}>
          {[0, 1, 2, 3].map(index => (
            <View key={index} style={styles.miniBarCol}>
              <SkeletonBlock opacity={opacity} style={styles.skeletonBar} />
            </View>
          ))}
        </View>
      </GlassPanel>

      <View style={[styles.aiCard, shadows.card]}>
        <View style={styles.aiHeaderRow}>
          <SkeletonBlock opacity={opacity} style={styles.skeletonAiIcon} />
          <SkeletonBlock opacity={opacity} style={styles.skeletonAiTitle} />
        </View>
        <SkeletonBlock opacity={opacity} style={[styles.skeletonLine, {marginTop: 16}]} />
        <SkeletonBlock opacity={opacity} style={[styles.skeletonLine, {width: '82%', marginTop: 8}]} />
        <SkeletonBlock opacity={opacity} style={[styles.skeletonLine, {width: '58%', marginTop: 8}]} />
      </View>

      <GlassPanel style={styles.movementWrap} radius={24} contentStyle={styles.movementInner}>
        <SkeletonBlock opacity={opacity} style={styles.skeletonSectionTitle} />
        <View style={styles.movementList}>
          {[0, 1, 2, 3].map(index => (
            <View key={index} style={styles.movementRow}>
              <SkeletonBlock opacity={opacity} style={styles.skeletonMovementIcon} />
              <View style={styles.movementText}>
                <SkeletonBlock opacity={opacity} style={styles.skeletonMovementLabel} />
                <SkeletonBlock opacity={opacity} style={styles.skeletonMovementSub} />
              </View>
              <SkeletonBlock opacity={opacity} style={styles.skeletonMovementValue} />
            </View>
          ))}
        </View>
      </GlassPanel>
    </View>
  );
}

export function InsightsScreen({currencySymbol, name = 'there', avatarUrl, onProfilePress}: InsightsScreenProps) {
  const navClearance = useFloatingNavClearance();
  const navScroll = useFloatingNavScroll();
  const [period, setPeriod] = useState<InsightsPeriod>('month');
  const hasSecureAvatar = isSafeAvatarUrl(avatarUrl);
  const initials = initialsFrom(name);

  const insights = useInsights(period);
  const isLive = insights.status === 'ready' && insights.data !== null;
  const showSkeleton = insights.status === 'loading' && !isLive;
  const data = useMemo<InsightsData>(() => {
    if (isLive && insights.data) {
      return buildInsightsDataFromResponse(insights.data);
    }
    return insightsData(currencySymbol, period);
  }, [currencySymbol, isLive, insights.data, period]);

  return (
    <Screen edges={['top']} backdrop={<InsightsAmbient />}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, {paddingBottom: navClearance}]}
        onScroll={navScroll.onScroll}
        scrollEventThrottle={navScroll.scrollEventThrottle}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text fontFamily={fonts.interMedium} fontSize={13} lineHeight={18} fontWeight="500" color={colors.inkSoft}>
              Your money, explained
            </Text>
            <Text
              fontFamily={fonts.outfitSemi}
              fontSize={26}
              lineHeight={32}
              fontWeight="600"
              letterSpacing={-0.65}
              color={colors.ink}>
              Insights
            </Text>
          </View>
          <PressableScale
            scaleTo={0.94}
            onPress={onProfilePress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            style={shadows.avatar}>
            <GlassPanel intensity="md" overlayColor="#FFFFFFCC" radius={AVATAR_SIZE / 2} contentStyle={styles.avatarFace}>
              {hasSecureAvatar ? (
                <Image source={{uri: avatarUrl}} style={{width: AVATAR_SIZE, height: AVATAR_SIZE}} resizeMode="cover" />
              ) : (
                <Text fontFamily={fonts.outfitSemi} fontSize={15} lineHeight={18} fontWeight="600" color={colors.gold}>
                  {initials}
                </Text>
              )}
            </GlassPanel>
          </PressableScale>
        </View>

        <PeriodTabs period={period} onChange={setPeriod} />

        {insights.status === 'error' ? (
          <Text fontFamily={fonts.interMedium} fontSize={12} lineHeight={16} fontWeight="500" color={colors.inkMuted} style={styles.liveErrorNote}>
            Couldn't refresh this {period}'s insights — showing example data.
          </Text>
        ) : null}

        {showSkeleton ? (
          <InsightsSkeleton />
        ) : (
          <>
            <ComparisonCard data={data} currencySymbol={currencySymbol} />
            <AiSummaryCard data={data} />
            <CategoryMovementPanel data={data} currencySymbol={currencySymbol} period={period} />
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
    paddingTop: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  avatarFace: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Period tabs
  tabsTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    borderRadius: 999,
    padding: TAB_PAD,
    marginBottom: 16,
    overflow: 'hidden',
  },
  tabsThumb: {
    position: 'absolute',
    top: TAB_PAD,
    left: TAB_PAD,
    height: TAB_SEG_H,
    borderRadius: 999,
    backgroundColor: colors.ink,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
  },
  tabsSeg: {
    flex: 1,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: TAB_SEG_H,
  },
  liveErrorNote: {
    marginTop: -6,
    marginBottom: 16,
  },

  // Comparison hero card
  comparisonWrap: {
    marginBottom: 16,
  },
  comparisonInner: {
    padding: 22,
    overflow: 'hidden',
  },
  comparisonGlow: {
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
          {color: '#8FC79A', positions: ['0%']},
          {color: 'rgba(143, 199, 154, 0.45)', positions: ['40%']},
          {color: 'rgba(143, 199, 154, 0)', positions: ['72%']},
        ],
      },
    ],
  },
  comparisonAmount: {
    marginTop: 10,
    includeFontPadding: false,
  },
  comparisonDeltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  miniBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 64,
    marginTop: 18,
    gap: 8,
  },
  miniBarCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  miniBarTrack: {
    width: '100%',
    height: 46,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: 7,
    overflow: 'hidden',
  },
  miniBarFill: {
    width: '100%',
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },

  // AI summary card
  aiCard: {
    backgroundColor: colors.ink,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  aiGlow: {
    // Simulated CSS blur(80px) over a 150px solid circle: the box grows by
    // 2× the blur radius and the color fades in soft, uneven steps instead
    // of a hard-edged disc, so the light reads as a diffuse bloom rather
    // than a bright dot with a visible boundary (matches HomeAmbient/
    // InsightsAmbient's glow() construction).
    position: 'absolute',
    top: -130,
    right: -120,
    width: 310,
    height: 310,
    borderRadius: 155,
    backgroundImage: [
      {
        type: 'radial-gradient',
        shape: 'circle',
        size: 'farthest-side',
        position: {top: '50%', left: '50%'},
        colorStops: [
          {color: colors.accent, positions: ['0%']},
          {color: 'rgba(217, 138, 43, 0.55)', positions: ['34%']},
          {color: 'rgba(217, 138, 43, 0.18)', positions: ['58%']},
          {color: 'rgba(217, 138, 43, 0)', positions: ['78%']},
        ],
      },
    ],
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  aiIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundImage: [
      {
        type: 'linear-gradient',
        direction: '135deg',
        colorStops: [
          {color: 'rgb(240, 166, 60)', positions: ['0%']},
          {color: 'rgb(217, 122, 31)', positions: ['100%']},
        ],
      },
    ],
    shadowColor: 'rgb(217, 138, 43)',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
  },
  aiTitleBlock: {
    gap: 2,
  },
  aiBody: {
    marginTop: 14,
  },
  aiHighlights: {
    marginTop: 14,
    gap: 8,
  },
  aiHighlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  aiHighlightIcon: {
    width: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiHighlightText: {
    flex: 1,
  },

  // What changed panel
  movementWrap: {
    marginBottom: 8,
  },
  movementInner: {
    padding: 20,
  },
  movementList: {
    marginTop: 18,
    gap: 14,
  },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  movementIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  movementText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },

  // Loading skeleton
  skeletonBlock: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  skeletonLabel: {
    width: 96,
    height: 14,
    borderRadius: 7,
  },
  skeletonChip: {
    width: 56,
    height: 21,
    borderRadius: 999,
  },
  skeletonAmount: {
    width: 170,
    height: 40,
    borderRadius: 10,
    marginTop: 12,
  },
  skeletonDelta: {
    width: 190,
    height: 14,
    borderRadius: 7,
    marginTop: 12,
  },
  skeletonBar: {
    width: '100%',
    height: 46,
    borderRadius: 7,
  },
  skeletonAiIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  skeletonAiTitle: {
    width: 110,
    height: 16,
    borderRadius: 8,
  },
  skeletonLine: {
    width: '100%',
    height: 13,
    borderRadius: 6,
  },
  skeletonSectionTitle: {
    width: 120,
    height: 18,
    borderRadius: 9,
  },
  skeletonMovementIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  skeletonMovementLabel: {
    width: '55%',
    height: 14,
    borderRadius: 7,
  },
  skeletonMovementSub: {
    width: '35%',
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  skeletonMovementValue: {
    width: 42,
    height: 14,
    borderRadius: 7,
  },
});
