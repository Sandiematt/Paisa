import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {ArrowDownLongIcon, ArrowUpRightIcon, GearIcon} from '../../components/icons/FeatherIcons';
import {MicGlyph, SparkleGlyph} from '../../components/icons/Glyphs';
import {GlassPanel, PressableScale, ProgressBar, Screen, Text} from '../../components/ui';
import {formatMoney} from '../../lib/formatMoney';
import {CategoryRow} from '../../lib/categoriesStore';
import {TransactionRow} from '../../lib/transactionsStore';
import {colors, fonts, layout, radii, shadows, spacing} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {OnboardingDraft} from '../onboarding/types';
import {CategoryMark} from '../add/categoryIcons';
import {HomeAmbient} from '../home/HomeAmbient';
import {HomeRange} from '../home/homeReport';
import {
  useFloatingNavDockHeight,
  useFloatingNavScroll,
} from '../NavBar/FloatingNavScroll';
import {ChatBubble} from './ChatBubble';
import {CompanionSettingsScreen} from './CompanionSettingsScreen';
import {generateCompanionReply} from './paisaAIMock';
import {buildPaisaMonthSummary, periodHeaderLabel} from './paisaMonth';
import {buildRecentSpending} from './recentSpending';
import {ChatMessage} from './types';

export type PaisaAIScreenProps = {
  currencySymbol: string;
  monthlyBudget: number;
  transactions: TransactionRow[];
  categories: CategoryRow[];
  remainingBudget: number;
  monthlySpent: number;
  draft: OnboardingDraft;
  onSave: (updated: OnboardingDraft) => void;
  onDetailsPress?: () => void;
  onActivityPress?: () => void;
};

const RANGES: HomeRange[] = ['week', 'month', 'year'];

const QUICK_ASKS = ['How much can I spend today?', 'Food vs last week'];

const tabular = {fontVariant: ['tabular-nums'] as const};

function PulseDot({color}: {color: string}) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1, duration: 900, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 0, duration: 900, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  const opacity = pulse.interpolate({inputRange: [0, 1], outputRange: [1, 0.35]});
  const scale = pulse.interpolate({inputRange: [0, 1], outputRange: [1, 1.35]});

  return (
    <View style={styles.pulseWrap}>
      <Animated.View
        style={[styles.pulseRing, {backgroundColor: color, opacity, transform: [{scale}]}]}
      />
      <View style={[styles.pulseCore, {backgroundColor: color}]} />
    </View>
  );
}

export function PaisaAIScreen({
  currencySymbol,
  monthlyBudget,
  transactions,
  categories,
  remainingBudget: _remainingBudget,
  monthlySpent: _monthlySpent,
  draft,
  onSave,
  onDetailsPress,
  onActivityPress,
}: PaisaAIScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [range, setRange] = useState<HomeRange>('month');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const navScroll = useFloatingNavScroll();
  const dockHeight = useFloatingNavDockHeight();

  const budgetForRange =
    range === 'week' ? monthlyBudget / 4 : range === 'year' ? monthlyBudget * 12 : monthlyBudget;

  const summary = useMemo(
    () => buildPaisaMonthSummary(transactions, categories, budgetForRange, range),
    [budgetForRange, categories, range, transactions],
  );

  const recent = useMemo(
    () => buildRecentSpending(transactions, categories, 4),
    [categories, transactions],
  );

  const chatting = messages.length > 0;
  const composerLift = dockHeight + spacing.sm;

  const handleSend = useCallback(
    (text: string) => {
      if (!text.trim()) {
        return;
      }

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        text: text.trim(),
      };

      setMessages(prev => [userMessage, ...prev]);
      setInputText('');

      setTimeout(() => {
        const reply = generateCompanionReply(userMessage.text, {
          currencySymbol,
          spent: summary.spent,
          remainingBudget: summary.remaining,
          budget: summary.budget,
          periodLabel: range === 'week' ? 'this week' : range === 'year' ? 'this year' : 'this month',
        });

        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          text: reply.text,
          parsedExpense: reply.parsedExpense,
          status: reply.parsedExpense ? 'pending' : undefined,
        };

        setMessages(prev => [aiMessage, ...prev]);
      }, 400);
    },
    [currencySymbol, range, summary.budget, summary.remaining, summary.spent],
  );

  const handleAddExpense = useCallback((messageId: string) => {
    setMessages(prev =>
      prev.map(msg => (msg.id === messageId ? {...msg, status: 'confirmed'} : msg)),
    );
  }, []);

  const handleEditExpense = useCallback((_messageId: string) => {
    Alert.alert('Edit Expense', 'Mock edit action triggered.');
  }, []);

  const cyclePeriod = useCallback(() => {
    setRange(current => {
      const index = RANGES.indexOf(current);
      return RANGES[(index + 1) % RANGES.length];
    });
  }, []);

  const pace = summary.pace;
  const ratioPct = Math.round(summary.ratio * 100);
  const availableColor = summary.remaining >= 0 ? colors.positive : colors.coral;
  const availableLabel = summary.remaining >= 0 ? 'Available' : 'Over budget';
  const topCategory = summary.topCategory;

  return (
    <Screen edges={['top']} backdrop={<HomeAmbient />}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text fontFamily={fonts.outfitBold} fontSize={26} fontWeight="700" letterSpacing={-0.4} color={colors.ink}>
            Paisa
          </Text>
          <SparkleGlyph color={colors.accent} size={16} />
        </View>
        <View style={styles.headerActions}>
          <View style={styles.aiBadge}>
            <PulseDot color={colors.positive} />
          </View>
          <PressableScale
            accessibilityLabel="Settings"
            onPress={() => setSettingsOpen(true)}
            style={styles.gearButton}
            scaleTo={0.94}>
            <GearIcon color="#70665A" size={20} />
          </PressableScale>
        </View>
      </View>

      {chatting ? (
        <FlatList
          ref={flatListRef}
          data={messages}
          inverted
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <ChatBubble
              message={item}
              currencySymbol={currencySymbol}
              onAddExpense={handleAddExpense}
              onEditExpense={handleEditExpense}
            />
          )}
          contentContainerStyle={styles.listContent}
          onScroll={navScroll.onScroll}
          scrollEventThrottle={navScroll.scrollEventThrottle}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.dashboard}
          onScroll={navScroll.onScroll}
          scrollEventThrottle={navScroll.scrollEventThrottle}
          showsVerticalScrollIndicator={false}>
          {/* Primary financial metric card */}
          <GlassPanel style={styles.heroCard} radius={26} contentStyle={styles.heroCardInner}>
            <PressableScale onPress={cyclePeriod} style={styles.cardTopRow} scaleTo={0.99}>
              <View style={styles.periodLabelRow}>
                <Text fontFamily={fonts.interSemi} fontSize={11} fontWeight="600" letterSpacing={0.4} color="#8A8072" textTransform="uppercase">
                  {periodHeaderLabel(range)} SPENDING
                </Text>
                <Text fontSize={11} color="#B5A996">
                  {' • '}
                </Text>
                <Text fontFamily={fonts.interMedium} fontSize={11} fontWeight="500" color="#8A8072">
                  {summary.daysLeft} days left
                </Text>
              </View>
              {pace ? (
                <View
                  style={[
                    styles.paceBadge,
                    {backgroundColor: pace.under ? colors.alertPositive : colors.alertDanger},
                  ]}>
                  {pace.under ? (
                    <ArrowDownLongIcon color={colors.positive} size={11} />
                  ) : (
                    <ArrowUpRightIcon color={colors.coral} size={11} />
                  )}
                  <Text
                    fontFamily={fonts.interSemi}
                    fontSize={11}
                    fontWeight="600"
                    color={pace.under ? colors.positive : colors.coral}>
                    {`${pace.pct}% ${pace.under ? 'under' : 'over'}`}
                  </Text>
                </View>
              ) : null}
            </PressableScale>

            <View style={styles.heroRow}>
              <View style={styles.heroLeft}>
                <Text
                  fontFamily={fonts.outfitBold}
                  fontSize={36}
                  lineHeight={40}
                  fontWeight="700"
                  letterSpacing={-1}
                  color={colors.ink}
                  style={tabular}>
                  {formatMoney(summary.spent, currencySymbol, {decimals: 0})}
                </Text>
                <Text fontFamily={fonts.interMedium} fontSize={12} fontWeight="500" color="#8A8072" style={styles.heroCaption}>
                  {`Spent out of ${formatMoney(summary.budget, currencySymbol, {decimals: 0})} budget`}
                </Text>
              </View>
              <View style={styles.heroRight}>
                <Text
                  fontFamily={fonts.outfitBold}
                  fontSize={20}
                  fontWeight="700"
                  letterSpacing={-0.3}
                  color={availableColor}
                  style={tabular}>
                  {formatMoney(Math.abs(summary.remaining), currencySymbol, {decimals: 0})}
                </Text>
                <Text fontFamily={fonts.interMedium} fontSize={11} fontWeight="500" color="#8A8072" style={styles.heroCaption}>
                  {availableLabel}
                </Text>
              </View>
            </View>

            <View style={styles.progressWrap}>
              <ProgressBar progress={summary.ratio} color={colors.accent} />
            </View>
            <View style={styles.progressFootRow}>
              <Text fontFamily={fonts.interMedium} fontSize={11} fontWeight="500" color="#8A8072">
                {`${ratioPct}% used`}
              </Text>
              <Text fontFamily={fonts.interSemi} fontSize={11} fontWeight="600" color={colors.ink} style={tabular}>
                {`${formatMoney(summary.dailySafe, currencySymbol, {decimals: 0})} safe daily spend`}
              </Text>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.tileGrid}>
              <View style={styles.miniTile}>
                <Text fontFamily={fonts.interMedium} fontSize={11} fontWeight="500" color="#8A8072">
                  Daily Safe
                </Text>
                <Text fontFamily={fonts.outfitBold} fontSize={15} fontWeight="700" color={colors.ink} style={[styles.miniTileValue, tabular]}>
                  {formatMoney(summary.dailySafe, currencySymbol, {decimals: 0})}
                </Text>
                <Text fontFamily={fonts.interMedium} fontSize={10} fontWeight="500" color="#9A9080">
                  {`for ${summary.daysLeft} days`}
                </Text>
              </View>
              <View style={styles.miniTile}>
                <Text fontFamily={fonts.interMedium} fontSize={11} fontWeight="500" color="#8A8072">
                  Remaining
                </Text>
                <Text fontFamily={fonts.outfitBold} fontSize={15} fontWeight="700" color={colors.ink} style={[styles.miniTileValue, tabular]}>
                  {formatMoney(Math.max(summary.remaining, 0), currencySymbol, {decimals: 0})}
                </Text>
                <Text
                  fontFamily={fonts.interMedium}
                  fontSize={10}
                  fontWeight="500"
                  color={summary.remaining >= 0 ? colors.positive : colors.coral}>
                  {summary.remaining >= 0 ? 'On track' : 'Over budget'}
                </Text>
              </View>
              <View style={styles.miniTile}>
                <Text fontFamily={fonts.interMedium} fontSize={11} fontWeight="500" color="#8A8072">
                  Top Category
                </Text>
                <Text
                  fontFamily={fonts.outfitBold}
                  fontSize={15}
                  fontWeight="700"
                  color={colors.ink}
                  numberOfLines={1}
                  style={styles.miniTileValue}>
                  {topCategory?.label ?? 'None yet'}
                </Text>
                <Text fontFamily={fonts.interMedium} fontSize={10} fontWeight="500" color="#9A9080" style={tabular}>
                  {topCategory
                    ? `${formatMoney(topCategory.amount, currencySymbol, {decimals: 0})} (${summary.topCategoryPct}%)`
                    : 'No spend yet'}
                </Text>
              </View>
            </View>
          </GlassPanel>

          {/* Recent spending */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <Text fontFamily={fonts.outfitBold} fontSize={16} fontWeight="700" letterSpacing={-0.2} color={colors.ink}>
                Recent Spending
              </Text>
              <PressableScale onPress={onActivityPress ?? onDetailsPress} scaleTo={0.97}>
                <Text fontFamily={fonts.interSemi} fontSize={12} fontWeight="600" color={colors.accentPress}>
                  View all
                </Text>
              </PressableScale>
            </View>

            {recent.length > 0 ? (
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                style={styles.chipsScroll}>
                {recent.map(chip => (
                  <View key={chip.id} style={styles.chip}>
                    <View style={[styles.chipIcon, {backgroundColor: chip.bg}]}>
                      <CategoryMark id={chip.slug} color={chip.fg} size={16} />
                    </View>
                    <View>
                      <View style={styles.chipTitleRow}>
                        <Text fontFamily={fonts.outfitBold} fontSize={13} fontWeight="700" color={colors.ink} style={tabular}>
                          {formatMoney(chip.amount, currencySymbol, {decimals: 0})}
                        </Text>
                        <Text fontFamily={fonts.interMedium} fontSize={11} fontWeight="500" color="#8A8072" numberOfLines={1}>
                          {chip.title}
                        </Text>
                      </View>
                      <Text fontFamily={fonts.interMedium} fontSize={11} fontWeight="500" color="#8F8172" numberOfLines={1}>
                        {chip.subtitle}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyChip}>
                <Text fontFamily={fonts.interMedium} fontSize={13} fontWeight="500" color="#847768">
                  Log a spend to see it here.
                </Text>
              </View>
            )}
          </View>

          {/* Category breakdown */}
          <GlassPanel style={styles.card} radius={24} contentStyle={styles.categoryCardInner}>
            <View style={styles.cardHeader}>
              <Text fontFamily={fonts.outfitBold} fontSize={15} fontWeight="700" color={colors.ink}>
                Category Breakdown
              </Text>
              <Text fontFamily={fonts.interMedium} fontSize={11} fontWeight="500" color="#8A8072">
                {`${summary.categoryCount} ${summary.categoryCount === 1 ? 'Category' : 'Categories'}`}
              </Text>
            </View>
            <View style={styles.categoryGrid}>
              {summary.tiles.map(tile => (
                <View key={tile.id} style={styles.categoryCell}>
                  <View style={[styles.categoryIconChip, {backgroundColor: tile.bg}]}>
                    <CategoryMark id={tile.slug} color={tile.fg} size={13} />
                  </View>
                  <Text fontFamily={fonts.outfitBold} fontSize={13} fontWeight="700" color={colors.ink} style={tabular}>
                    {formatMoney(tile.amount, currencySymbol, {decimals: 0})}
                  </Text>
                  <Text fontFamily={fonts.interMedium} fontSize={10.5} fontWeight="500" color="#8F8172" numberOfLines={1}>
                    {tile.label}
                  </Text>
                </View>
              ))}
            </View>
          </GlassPanel>
        </ScrollView>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <View style={[styles.composerDock, {paddingBottom: composerLift}]}>
          <View style={styles.composerCard}>
            <View style={styles.composerInputRow}>
              <PressableScale
                accessibilityLabel="Voice input"
                onPress={() => Alert.alert('Voice', 'Voice input is coming soon.')}
                style={styles.micButton}
                scaleTo={0.94}>
                <MicGlyph color="#6C6356" size={18} />
              </PressableScale>
              <TextInput
                style={styles.input}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Ask Paisa or log spend (e.g. Spent 300)..."
                placeholderTextColor="#9E978C"
                returnKeyType="send"
                onSubmitEditing={() => handleSend(inputText)}
              />
              <PressableScale
                accessibilityLabel="Send"
                style={[styles.sendButton, !inputText.trim() && styles.sendDisabled]}
                onPress={() => handleSend(inputText)}
                disabled={!inputText.trim()}
                scaleTo={0.94}>
                <SparkleGlyph color="#FFFFFF" size={15} />
              </PressableScale>
            </View>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickAskRow}>
              {QUICK_ASKS.map(tag => (
                <PressableScale
                  key={tag}
                  scaleTo={0.97}
                  style={styles.quickAskTag}
                  onPress={() => handleSend(tag)}>
                  <Text fontFamily={fonts.interMedium} fontSize={11} fontWeight="500" color="#5F5648">
                    {`"${tag}"`}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
      <CompanionSettingsScreen
        visible={settingsOpen}
        draft={draft}
        onSave={onSave}
        onClose={() => setSettingsOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E9DFD0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseWrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pulseCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.avatar,
  },
  scroll: {
    flex: 1,
  },
  dashboard: {
    paddingHorizontal: layout.screenPadding,
    gap: 16,
    paddingTop: spacing.sm,
  },
  heroCard: {
    ...shadows.card,
  },
  heroCardInner: {
    padding: 18,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  periodLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  paceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  heroLeft: {
    flexShrink: 1,
  },
  heroRight: {
    alignItems: 'flex-end',
  },
  heroCaption: {
    marginTop: 4,
  },
  progressWrap: {
    marginTop: 16,
  },
  progressFootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginTop: 14,
    marginBottom: 12,
  },
  tileGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  miniTile: {
    flex: 1,
    backgroundColor: 'rgba(255,253,249,0.8)',
    borderRadius: 16,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(236,228,214,0.7)',
    gap: 2,
  },
  miniTileValue: {
    marginTop: 1,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  chipsScroll: {
    marginHorizontal: -4,
    flexGrow: 0,
  },
  chips: {
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.glass,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.82)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    ...shadows.cardSoft,
  },
  chipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyChip: {
    backgroundColor: colors.glass,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.82)',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  card: {
    ...shadows.card,
  },
  categoryCardInner: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryCell: {
    flex: 1,
    borderRadius: 16,
    padding: 10,
    minHeight: 84,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(236,229,216,0.8)',
    gap: 6,
  },
  categoryIconChip: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  composerDock: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  composerCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(232,223,207,0.65)',
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 8,
    ...shadows.card,
  },
  composerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  micButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontFamily: fonts.interMedium,
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.45,
  },
  quickAskRow: {
    gap: 6,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  quickAskTag: {
    backgroundColor: '#F7F2E8',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
