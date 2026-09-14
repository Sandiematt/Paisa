import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useReducedMotion} from '../../hooks/useReducedMotion';

import {
  CalendarGlyph,
  MinusGlyph,
  PlusGlyph,
  ReceiptGlyph,
} from '../../components/icons/Glyphs';
import {AppText, DividerLabel, PressableScale} from '../../components/ui';
import {formatAmountInput, parseAmountInput} from '../../lib/formatMoney';
import {
  categoryByName,
  categoryForSlug,
  findOrCreateUserCategory,
  loadCategories,
  CategoryRow,
} from '../../lib/categoriesStore';
import {
  TransactionRow,
  createTransaction,
  dateFromCalendarISO,
  localDateISO,
  updateTransaction,
} from '../../lib/transactionsStore';
import {colors, layout, radii, spacing, typography} from '../../theme';
import {CATEGORIES, CURRENCIES, categoryById} from '../onboarding/constants';
import {CategoryIcon} from './categoryIcons';
import {DatePickerSheet} from './DatePickerSheet';
import {AddKind} from './types';

type AddTransactionScreenProps = {
  visible: boolean;
  initialKind: AddKind;
  currencySymbol: string;
  categoryIds: string[];
  existing?: TransactionRow | null;
  onClose: () => void;
  onSaved?: (row: TransactionRow) => void;
};

const OTHER_CATEGORY = {id: 'other', label: 'Other', color: colors.slate};

const EXPENSE_GRID = [
  {id: 'housing', label: 'Housing', color: colors.coral},
  {id: 'dining', label: 'Dining', color: colors.accent},
  {id: 'groceries', label: 'Groceries', color: colors.positive},
  {id: 'transport', label: 'Transport', color: '#3D7CC9'},
  {id: 'health', label: 'Health', color: colors.coral},
  {id: 'shopping', label: 'Shopping', color: colors.violet},
  {id: 'entertainment', label: 'Entertainment', color: colors.violet},
  {id: 'bills', label: 'Bills', color: colors.slate},
  {id: 'personal', label: 'Personal', color: colors.positive},
  {id: 'education', label: 'Education', color: colors.violet},
  {id: 'travel', label: 'Travel', color: colors.teal},
  OTHER_CATEGORY,
];

const INCOME_CATEGORIES = [
  {id: 'salary', label: 'Salary', color: colors.positive},
  {id: 'freelance', label: 'Freelance', color: colors.teal},
  {id: 'refund', label: 'Refund', color: colors.accent},
  OTHER_CATEGORY,
];

const NOTE_LIMIT = 100;

const KIND_META = {
  expense: {
    title: 'Add expense',
    subtitle: 'Keep track, build better habits',
    verb: 'Add expense',
    accent: colors.coral,
    accentSoft: colors.alertDanger,
  },
  income: {
    title: 'Add income',
    subtitle: 'Track money coming in',
    verb: 'Add income',
    accent: colors.positive,
    accentSoft: colors.alertPositive,
  },
} as const;

const KIND_PAD = 4;
const KIND_SEG_H = 50;
const KIND_MOTION = 180;
const SUBMIT_H = 56;
const CANVAS_EXPENSE = '#FFF8F4';
const CANVAS_INCOME = '#D8F0DC';
const WASH_EXPENSE = '#FFD9D0';
const WASH_INCOME = '#A8DCB4';
const THUMB_EXPENSE = KIND_META.expense.accent;
const THUMB_INCOME = KIND_META.income.accent;

function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') {
    return cleaned === '.' ? '0.' : '0';
  }
  const firstDot = cleaned.indexOf('.');
  const head =
    firstDot === -1
      ? cleaned
      : `${cleaned.slice(0, firstDot)}.${cleaned.slice(firstDot + 1).replace(/\./g, '')}`;
  const [wholeRaw, fraction] = head.split('.');
  const whole = (wholeRaw.replace(/^0+(?=\d)/, '') || '0').slice(0, 9);
  if (fraction !== undefined) {
    return `${whole}.${fraction.slice(0, 2)}`;
  }
  return whole;
}

function formatDateLabel(date: Date): string {
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const stamp = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
  return sameDay ? `Today, ${stamp}` : stamp;
}

function currencyCodeFromSymbol(symbol: string): string {
  return CURRENCIES.find(item => item.symbol === symbol)?.code ?? symbol;
}

function useKindMotion(kind: AddKind, resetToken: boolean) {
  const reducedMotion = useReducedMotion();
  const [trackW, setTrackW] = useState(0);
  const selectedIndex = kind === 'income' ? 1 : 0;
  const innerW = Math.max(0, trackW - KIND_PAD * 2);
  const segmentW = innerW > 0 ? innerW / 2 : 0;
  const slideX = selectedIndex * segmentW;

  const slide = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(selectedIndex)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (resetToken) {
      placed.current = false;
    }
  }, [resetToken]);

  useEffect(() => {
    if (segmentW <= 0) {
      return;
    }
    if (!placed.current) {
      slide.setValue(slideX);
      progress.setValue(selectedIndex);
      placed.current = true;
      return;
    }
    const duration = reducedMotion ? 0 : KIND_MOTION;
    Animated.parallel([
      Animated.timing(slide, {
        toValue: slideX,
        duration,
        useNativeDriver: false,
      }),
      Animated.timing(progress, {
        toValue: selectedIndex,
        duration,
        useNativeDriver: false,
      }),
    ]).start();
  }, [
    progress,
    reducedMotion,
    resetToken,
    segmentW,
    selectedIndex,
    slide,
    slideX,
  ]);

  const canvasColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CANVAS_EXPENSE, CANVAS_INCOME],
  });
  const thumbColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [THUMB_EXPENSE, THUMB_INCOME],
  });
  const incomeWashOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
  });
  const expenseWashOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0],
  });

  const onTrackLayout = (event: LayoutChangeEvent) => {
    setTrackW(event.nativeEvent.layout.width);
  };

  return {
    slide,
    canvasColor,
    thumbColor,
    incomeWashOpacity,
    expenseWashOpacity,
    segmentW,
    onTrackLayout,
  };
}

function amountDraft(value: number): string {
  const rounded = Number(value.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function AddTransactionScreen({
  visible,
  initialKind,
  currencySymbol,
  categoryIds,
  existing,
  onClose,
  onSaved,
}: AddTransactionScreenProps) {
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const compact = height < 740;

  const [kind, setKind] = useState<AddKind>(initialKind);
  const [amount, setAmount] = useState('0');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState('');
  const [note, setNote] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => new Date());
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [dbCategories, setDbCategories] = useState<CategoryRow[]>([]);
  const amountInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setKind(existing?.type ?? initialKind);
    setAmount(existing ? amountDraft(existing.amount) : '0');
    setCategoryId(null);
    setCustomCategory('');
    setNote(existing?.notes ?? '');
    setOccurredOn(
      existing ? dateFromCalendarISO(existing.transactionDate) : new Date(),
    );
    setDateOpen(false);
    setSaving(false);
    setShowAllCategories(Boolean(existing));
    let cancelled = false;
    loadCategories()
      .then(rows => {
        if (!cancelled) {
          setDbCategories(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDbCategories([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [existing, initialKind, visible]);

  useEffect(() => {
    if (!visible || !existing) {
      return;
    }
    const match = dbCategories.find(row => row.id === existing.categoryId);
    if (match?.slug) {
      setCategoryId(match.slug);
    }
  }, [dbCategories, existing, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const timer = setTimeout(() => {
      amountInputRef.current?.focus();
    }, 350);
    return () => clearTimeout(timer);
  }, [visible]);

  const {
    slide,
    canvasColor,
    thumbColor,
    incomeWashOpacity,
    expenseWashOpacity,
    segmentW,
    onTrackLayout,
  } = useKindMotion(kind, visible);

  const extraExpenseCategories = useMemo(() => {
    const shown = new Set(EXPENSE_GRID.map(item => item.id));
    const fromProfile = categoryIds
      .map(id => categoryById(id))
      .filter(
        (item): item is NonNullable<typeof item> =>
          item != null && !shown.has(item.id),
      );
    const leftovers = CATEGORIES.filter(item => !shown.has(item.id));
    const merged = [...leftovers, ...fromProfile];
    return merged.filter(
      (item, index) => merged.findIndex(entry => entry.id === item.id) === index,
    );
  }, [categoryIds]);

  const categories = useMemo(() => {
    if (kind === 'income') {
      return INCOME_CATEGORIES;
    }
    return showAllCategories
      ? [...EXPENSE_GRID, ...extraExpenseCategories]
      : EXPENSE_GRID;
  }, [extraExpenseCategories, kind, showAllCategories]);

  const typedCategory = customCategory.trim();
  const selectedCategory =
    categoryId && categories.some(item => item.id === categoryId)
      ? categoryId
      : categories.find(item => item.id !== OTHER_CATEGORY.id)?.id ??
        categories[0]?.id ??
        null;
  const otherSelected = selectedCategory === OTHER_CATEGORY.id;

  const numericAmount = parseAmountInput(amount);
  const canSubmit = numericAmount > 0 && !saving;
  const tone = KIND_META[kind];
  const editing = Boolean(existing);
  const submitLabel = saving
    ? 'Saving…'
    : editing
      ? 'Save changes'
      : tone.verb;
  const heading = editing
    ? kind === 'income'
      ? 'Edit income'
      : 'Edit expense'
    : tone.title;
  const subtitle = editing
    ? 'Update the amount, category, or date'
    : tone.subtitle;
  const currencyCode = currencyCodeFromSymbol(currencySymbol);
  const moreCategories = kind === 'expense' && extraExpenseCategories.length > 0;

  const onKindChange = (next: AddKind) => {
    if (next === kind) {
      return;
    }
    setKind(next);
    setCategoryId(null);
    setCustomCategory('');
    setShowAllCategories(false);
  };

  const handleSubmit = async () => {
    if (numericAmount <= 0 || saving) {
      return;
    }
    const chip = categories.find(item => item.id === selectedCategory);
    const categoryName =
      (otherSelected && typedCategory) || chip?.label || null;
    const match =
      otherSelected && typedCategory
        ? categoryByName(dbCategories, typedCategory, kind)
        : selectedCategory
        ? categoryForSlug(dbCategories, selectedCategory, kind) ??
          categoryByName(dbCategories, chip?.label ?? '', kind)
        : undefined;
    setSaving(true);
    try {
      let categoryRow = match;
      if (!categoryRow && otherSelected && typedCategory) {
        categoryRow = await findOrCreateUserCategory(typedCategory, kind);
      } else if (!categoryRow && otherSelected) {
        categoryRow = await findOrCreateUserCategory('Other', kind);
      } else if (!categoryRow && chip?.label) {
        categoryRow = await findOrCreateUserCategory(chip.label, kind);
      }
      const payload = {
        type: kind,
        amount: numericAmount,
        categoryId: categoryRow?.id ?? null,
        description: categoryRow?.name ?? categoryName,
        merchant:
          existing?.merchant?.trim() ||
          categoryRow?.name ||
          categoryName,
        transactionDate: localDateISO(occurredOn),
        notes: note.trim() || null,
      };
      const saved = existing
        ? await updateTransaction(existing.id, {
            ...payload,
            paymentMethod: existing.paymentMethod,
            isRecurring: existing.isRecurring,
          })
        : await createTransaction(payload);
      onSaved?.(saved);
      onClose();
    } catch (caught) {
      Alert.alert(
        'Could not save',
        caught instanceof Error ? caught.message : 'Try again in a moment.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <Animated.View
        style={[styles.root, {backgroundColor: canvasColor}]}>
        <KeyboardAvoidingView
          style={[styles.screen, {paddingTop: insets.top}]}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'android' ? 0 : insets.top}>
        <StatusBar barStyle="dark-content" />
        <Animated.View
          pointerEvents="none"
          style={[styles.wash, styles.washExpense, {opacity: expenseWashOpacity}]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.wash, styles.washIncome, {opacity: incomeWashOpacity}]}
        />

        <View style={styles.topBar}>
          <PressableScale
            onPress={onClose}
            scaleTo={0.92}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            containerStyle={styles.backHit}
            style={styles.backFace}>
            <View style={styles.backChevron}>
              <View style={[styles.backArm, styles.backArmTop]} />
              <View style={[styles.backArm, styles.backArmBottom]} />
            </View>
          </PressableScale>
          <View style={styles.headerCopy}>
            <AppText variant="heading" color={colors.ink}>
              {heading}
            </AppText>
            <AppText variant="caption" color={colors.inkMuted}>
              {subtitle}
            </AppText>
          </View>
          <PressableScale
            onPress={() => {
              Keyboard.dismiss();
              setDateOpen(true);
            }}
            scaleTo={0.96}
            accessibilityRole="button"
            accessibilityLabel={`Date, ${formatDateLabel(occurredOn)}`}
            accessibilityHint="Opens the date picker"
            style={styles.dateChip}>
            <CalendarGlyph color={colors.inkSecondary} size={14} />
            <AppText
              variant="label"
              color={colors.ink}
              numberOfLines={1}
              style={styles.dateChipLabel}>
              {formatDateLabel(occurredOn)}
            </AppText>
            <AppText variant="caption" color={colors.inkMuted}>
              {'∨'}
            </AppText>
          </PressableScale>
        </View>

        <View
          accessibilityRole="tablist"
          style={styles.kindTrack}
          onLayout={onTrackLayout}>
          {segmentW > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.kindThumb,
                {
                  width: segmentW,
                  backgroundColor: thumbColor,
                  transform: [{translateX: slide}],
                },
              ]}
            />
          ) : null}
          {(['expense', 'income'] as const).map(item => {
            const selected = kind === item;
            const itemTone = KIND_META[item];
            const thumbReady = segmentW > 0;
            return (
              <Pressable
                key={item}
                onPress={() => onKindChange(item)}
                accessibilityRole="tab"
                accessibilityState={{selected}}
                android_ripple={{color: 'transparent'}}
                style={[
                  styles.kindOption,
                  selected && !thumbReady && {backgroundColor: itemTone.accent},
                ]}>
                <View
                  style={[
                    styles.kindMark,
                    {
                      backgroundColor: selected
                        ? colors.surface
                        : itemTone.accent,
                    },
                  ]}>
                  {item === 'income' ? (
                    <PlusGlyph
                      color={selected ? itemTone.accent : colors.onInk}
                      size={10}
                    />
                  ) : (
                    <MinusGlyph
                      color={selected ? itemTone.accent : colors.onInk}
                      size={10}
                    />
                  )}
                </View>
                <AppText
                  variant="bodyStrong"
                  color={selected ? '#FFFFFF' : colors.ink}>
                  {item === 'expense' ? 'Expense' : 'Income'}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            compact && styles.scrollCompact,
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.amountBlock}>
            <PressableScale
              onPress={() => {}}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel="Scan receipt"
              accessibilityHint="Coming soon"
              style={styles.scanBtn}>
              <ReceiptGlyph color={colors.ink} size={22} />
              <AppText variant="bodyStrong" color={colors.ink}>
                Scan receipt
              </AppText>
            </PressableScale>

            <DividerLabel label="or" style={styles.orRule} />

            <AppText variant="caption" color={colors.inkMuted}>
              Enter manually
            </AppText>
            <View style={styles.amountRow}>
              <AppText
                variant="numericHero"
                color={colors.ink}
                style={[
                  styles.amountSymbol,
                  {
                    fontSize: compact ? 40 : 48,
                    lineHeight: compact ? 46 : 54,
                  },
                ]}>
                {currencySymbol}
              </AppText>
              <TextInput
                ref={amountInputRef}
                value={amount === '0' ? '' : amount}
                onChangeText={text => setAmount(sanitizeAmount(text))}
                placeholder="0"
                placeholderTextColor={colors.inkMuted}
                keyboardType="decimal-pad"
                inputMode="decimal"
                returnKeyType="done"
                blurOnSubmit
                selectTextOnFocus
                autoCorrect={false}
                caretHidden={false}
                underlineColorAndroid="transparent"
                accessibilityLabel={`Amount, ${formatAmountInput(amount, currencySymbol)}`}
                style={[
                  styles.amountDigits,
                  {
                    fontSize: compact ? 40 : 48,
                    lineHeight: compact ? 46 : 54,
                  },
                ]}
              />
              <View style={styles.currencyChip}>
                <AppText variant="label" color={colors.ink}>
                  {currencyCode}
                </AppText>
              </View>
            </View>
            <AppText variant="caption" color={colors.inkMuted}>
              {kind === 'income'
                ? 'Enter the amount you received'
                : 'Enter the amount you spent'}
            </AppText>
          </View>

          <View style={styles.sectionHead}>
            <AppText variant="bodyStrong" color={colors.ink}>
              Select a category
            </AppText>
            {moreCategories ? (
              <PressableScale
                onPress={() => setShowAllCategories(current => !current)}
                scaleTo={0.97}
                accessibilityRole="button"
                accessibilityLabel={
                  showAllCategories ? 'Show fewer categories' : 'See all categories'
                }
                style={styles.seeAll}>
                <AppText variant="label" color={colors.inkMuted}>
                  {showAllCategories ? 'Show less' : 'See all'}
                </AppText>
                <AppText variant="label" color={colors.inkMuted}>
                  {showAllCategories ? '‹' : '›'}
                </AppText>
              </PressableScale>
            ) : null}
          </View>

          <View style={styles.categoryGrid}>
            {categories.map(item => {
              const selected = selectedCategory === item.id;
              return (
                <PressableScale
                  key={item.id}
                  onPress={() => {
                    setCategoryId(item.id);
                    if (item.id !== OTHER_CATEGORY.id) {
                      setCustomCategory('');
                    }
                  }}
                  scaleTo={0.96}
                  accessibilityRole="radio"
                  accessibilityState={{selected}}
                  containerStyle={styles.categoryCell}
                  style={[
                    styles.categoryTile,
                    selected && {
                      backgroundColor: tone.accentSoft,
                      borderColor: tone.accent,
                    },
                  ]}>
                  <CategoryIcon id={item.id} size={18} />
                  <AppText
                    variant="caption"
                    color={selected ? colors.ink : colors.inkSecondary}
                    numberOfLines={1}
                    align="center">
                    {item.label}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>

          {otherSelected ? (
            <TextInput
              value={customCategory}
              onChangeText={setCustomCategory}
              placeholder="Type a category"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="words"
              returnKeyType="done"
              blurOnSubmit
              underlineColorAndroid="transparent"
              style={styles.otherField}
            />
          ) : null}

          <View style={styles.noteField}>
            <ReceiptGlyph color={colors.inkMuted} size={16} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="sentences"
              returnKeyType="done"
              blurOnSubmit
              maxLength={NOTE_LIMIT}
              underlineColorAndroid="transparent"
              style={styles.noteInput}
            />
            <AppText variant="caption" color={colors.inkMuted}>
              {note.length}/{NOTE_LIMIT}
            </AppText>
          </View>
        </ScrollView>

        <Animated.View
          style={[
            styles.dock,
            {
              backgroundColor: canvasColor,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}>
          <PressableScale
            onPress={handleSubmit}
            disabled={!canSubmit}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityState={{disabled: !canSubmit}}
            accessibilityHint={
              numericAmount > 0
                ? `Saves this ${kind}`
                : 'Enter an amount to continue'
            }
            style={[
              styles.submit,
              {backgroundColor: canSubmit ? tone.accent : colors.canvasSunk},
            ]}>
            <AppText
              variant="bodyStrong"
              color={canSubmit ? colors.onInk : colors.inkMuted}>
              {submitLabel}
            </AppText>
            <AppText
              variant="bodyStrong"
              color={canSubmit ? colors.onInk : colors.inkMuted}>
              {' →'}
            </AppText>
          </PressableScale>
        </Animated.View>

        <DatePickerSheet
          visible={dateOpen}
          value={occurredOn}
          onClose={() => setDateOpen(false)}
          onChange={setOccurredOn}
        />
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  wash: {
    position: 'absolute',
    top: -80,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  washExpense: {
    backgroundColor: WASH_EXPENSE,
  },
  washIncome: {
    backgroundColor: WASH_INCOME,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  backHit: {
    width: 36,
    height: 36,
  },
  backFace: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    width: 14,
    height: 14,
    marginLeft: 2,
  },
  backArm: {
    position: 'absolute',
    left: 1,
    width: 11,
    height: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
  },
  backArmTop: {
    top: 3,
    transform: [{rotate: '-42deg'}],
  },
  backArmBottom: {
    bottom: 3,
    transform: [{rotate: '42deg'}],
  },
  headerCopy: {
    flex: 1,
  },
  dateChip: {
    minHeight: 36,
    maxWidth: 168,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateChipLabel: {
    flexShrink: 1,
  },
  kindTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.xl,
    padding: KIND_PAD,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  kindThumb: {
    position: 'absolute',
    top: KIND_PAD,
    left: KIND_PAD,
    height: KIND_SEG_H,
    borderRadius: radii.pill,
  },
  kindOption: {
    flex: 1,
    zIndex: 1,
    elevation: 0,
    height: KIND_SEG_H,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'transparent',
  },
  kindMark: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  scrollCompact: {
    paddingTop: spacing.md,
  },
  amountBlock: {
    gap: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amountSymbol: {
    fontVariant: ['tabular-nums'],
  },
  amountDigits: {
    flex: 1,
    padding: 0,
    margin: 0,
    minHeight: 54,
    ...typography.numericHero,
    fontVariant: ['tabular-nums'],
    color: colors.ink,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  currencyChip: {
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orRule: {
    marginVertical: spacing.sm,
  },
  scanBtn: {
    height: layout.controlHeight,
    width: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  sectionHead: {
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryCell: {
    width: '25%',
    padding: spacing.xs,
  },
  categoryTile: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  otherField: {
    marginTop: spacing.md,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    ...typography.body,
    color: colors.ink,
  },
  noteField: {
    marginTop: spacing.xl,
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  noteInput: {
    flex: 1,
    height: 52,
    padding: 0,
    ...typography.body,
    color: colors.ink,
  },
  dock: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  submit: {
    height: SUBMIT_H,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
