import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CalendarBlank, CaretDown} from 'phosphor-react-native';

import {
  AppText,
  BackButton,
  GradientView,
  PressableScale,
  PrimaryButton,
  SegmentedControl,
  TextField,
  ToggleSwitch,
} from '../../components/ui';
import {formatAmountInput, parseAmountInput} from '../../lib/formatMoney';
import {buildTransactionPayload} from './transactionPayload';
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
import {ColorToken, colors, layout, linearGradient, makeStyles, radii, spacing, typography, useTheme, withAlpha, palettes} from '../../theme';
import {CATEGORIES, CURRENCIES, categoryById} from '../onboarding/constants';
import {CategoryIconSquare} from './categoryIcons';
import {
  EXPENSE_GRID,
  INCOME_CATEGORIES,
  OTHER_CATEGORY,
} from './categoryOptions';
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

const NOTE_LIMIT = 100;

const KIND_OPTIONS = [
  {value: 'expense', label: 'Expense'},
  {value: 'income', label: 'Income'},
] as const;

/** `accent` is a palette role, resolved at render so it follows the scheme. */
const KIND_META: Record<
  AddKind,
  {title: string; subtitle: string; verb: string; accent: ColorToken}
> = {
  expense: {
    title: 'Add expense',
    subtitle: 'Keep track, build better habits',
    verb: 'Add expense',
    accent: 'roseLight',
  },
  income: {
    title: 'Add income',
    subtitle: 'Track money coming in',
    verb: 'Add income',
    accent: 'mint',
  },
};

const GLOW_HEIGHT = 300;

function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
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
  const styles = useStyles();
  const {scheme} = useTheme();
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const compact = height < 740;

  const [kind, setKind] = useState<AddKind>(initialKind);
  const [amount, setAmount] = useState('0');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState('');
  const [note, setNote] = useState('');
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [occurredOn, setOccurredOn] = useState(() => new Date());
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [dbCategories, setDbCategories] = useState<CategoryRow[]>([]);
  const amountInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setKind(existing?.type ?? initialKind);
    setAmount(existing ? amountDraft(existing.amount) : '0');
    setCategoryId(null);
    setCustomCategory('');
    setNote(existing?.notes ?? '');
    setRepeatMonthly(existing?.isRecurring ?? false);
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
      const built = buildTransactionPayload({
        amount,
        type: kind,
        categoryId: categoryRow?.id ?? null,
        categoryName: categoryRow?.name ?? categoryName,
        transactionDate: localDateISO(occurredOn),
        note,
        isRecurring: repeatMonthly,
        existing,
        oldCategoryName:
          dbCategories.find(row => row.id === existing?.categoryId)?.name ??
          null,
      });
      if (!built.ok) {
        Alert.alert('Check the amount', built.error);
        return;
      }
      const saved =
        built.mode === 'update' && existing
          ? await updateTransaction(existing.id, built.patch)
          : built.mode === 'create'
            ? await createTransaction(built.payload)
            : null;
      if (!saved) {
        return;
      }
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

  const heroSize = compact ? 40 : 48;
  const heroLine = compact ? 46 : 54;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <View style={styles.root}>
        <StatusBar
          barStyle={scheme === 'light' ? 'dark-content' : 'light-content'}
        />
        <View pointerEvents="none" style={styles.glow} />
        <KeyboardAvoidingView
          style={[styles.screen, {paddingTop: insets.top}]}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'android' ? 0 : insets.top}>
          <View style={styles.topBar}>
            <BackButton onPress={onClose} />
            <View style={styles.headerCopy}>
              <AppText variant="title" color={colors.text}>
                {heading}
              </AppText>
              <AppText variant="caption" color={colors.muted}>
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
              <CalendarBlank size={16} color={colors.lavender} weight="bold" />
              <AppText
                variant="label"
                color={colors.text}
                numberOfLines={1}
                style={styles.dateChipLabel}>
                {formatDateLabel(occurredOn)}
              </AppText>
              <CaretDown size={12} color={colors.muted} weight="bold" />
            </PressableScale>
          </View>

          <SegmentedControl
            options={KIND_OPTIONS}
            value={kind}
            onChange={onKindChange}
            accessibilityLabel="Transaction type"
            style={styles.kindControl}
          />

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
              <AppText variant="label" color={colors.muted}>
                Amount
              </AppText>
              <View style={styles.amountRow}>
                <AppText
                  variant="numericHero"
                  color={colors[tone.accent]}
                  style={{fontSize: heroSize, lineHeight: heroLine}}>
                  {currencySymbol}
                </AppText>
                <TextInput
                  ref={amountInputRef}
                  value={amount === '0' ? '' : amount}
                  onChangeText={text => setAmount(sanitizeAmount(text))}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  selectionColor={colors.lavender}
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
                    {fontSize: heroSize, lineHeight: heroLine},
                  ]}
                />
                <View style={styles.currencyChip}>
                  <AppText variant="label" color={colors.text}>
                    {currencyCode}
                  </AppText>
                </View>
              </View>
              <AppText variant="caption" color={colors.muted}>
                {kind === 'income'
                  ? 'Enter the amount you received'
                  : 'Enter the amount you spent'}
              </AppText>
            </View>

            <View style={styles.sectionHead}>
              <AppText variant="sectionTitle" color={colors.text}>
                Select a category
              </AppText>
              {moreCategories ? (
                <PressableScale
                  onPress={() => setShowAllCategories(current => !current)}
                  scaleTo={0.97}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showAllCategories
                      ? 'Show fewer categories'
                      : 'See all categories'
                  }
                  style={styles.seeAll}>
                  <AppText variant="label" color={colors.lavender}>
                    {showAllCategories ? 'Show less' : 'See all'}
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
                    accessibilityLabel={item.label}
                    accessibilityState={{selected}}
                    containerStyle={styles.categoryCell}
                    style={[
                      styles.categoryTile,
                      selected && styles.categoryTileOn,
                    ]}>
                    <CategoryIconSquare id={item.id} size={40} glow={selected} />
                    <AppText
                      variant="caption"
                      color={selected ? colors.text : colors.muted}
                      numberOfLines={1}
                      align="center">
                      {item.label}
                    </AppText>
                  </PressableScale>
                );
              })}
            </View>

            {otherSelected ? (
              <TextField
                label="Category name"
                placeholder="Type a category"
                value={customCategory}
                onChangeText={setCustomCategory}
                autoCapitalize="words"
                returnKeyType="done"
                blurOnSubmit
                underlineColorAndroid="transparent"
                style={styles.field}
              />
            ) : null}

            <TextField
              label="Note (optional)"
              placeholder="What was this for?"
              value={note}
              onChangeText={setNote}
              helper={`${note.length}/${NOTE_LIMIT}`}
              autoCapitalize="sentences"
              returnKeyType="done"
              blurOnSubmit
              maxLength={NOTE_LIMIT}
              underlineColorAndroid="transparent"
              style={styles.field}
            />

            <View style={styles.repeatRow}>
              <View style={styles.repeatCopy}>
                <AppText variant="bodyStrong">Repeat every month</AppText>
                <AppText variant="caption" color={colors.inkSecondary}>
                  Adds this {kind} again on the same day each month.
                </AppText>
              </View>
              <ToggleSwitch
                value={repeatMonthly}
                onValueChange={setRepeatMonthly}
                accessibilityLabel="Repeat every month"
              />
            </View>
          </ScrollView>

          <View
            style={[
              styles.dock,
              {paddingBottom: Math.max(insets.bottom, spacing.md)},
            ]}>
            <GradientView
              pointerEvents="none"
              gradient={[withAlpha(colors.ground, 0), colors.ground]}
              angle={180}
              style={styles.dockFade}
            />
            <PrimaryButton
              label={submitLabel}
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={saving}
              accessibilityHint={
                numericAmount > 0
                  ? `Saves this ${kind}`
                  : 'Enter an amount to continue'
              }
            />
          </View>

          <DatePickerSheet
            visible={dateOpen}
            value={occurredOn}
            onClose={() => setDateOpen(false)}
            onChange={setOccurredOn}
          />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(palette => ({
  root: {
    flex: 1,
    backgroundColor: colors.ground,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: GLOW_HEIGHT,
    backgroundImage: linearGradient([colors.glow, colors.ground], 180),
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
  },
  dateChip: {
    minHeight: 40,
    maxWidth: 168,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateChipLabel: {
    flexShrink: 1,
  },
  kindControl: {
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
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
  amountDigits: {
    flex: 1,
    padding: 0,
    margin: 0,
    minHeight: 54,
    ...typography.numericHero,
    color: colors.text,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  currencyChip: {
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginHorizontal: -spacing.xs,
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
    paddingHorizontal: spacing.xs,
    borderRadius: radii.tile,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  categoryTileOn: {
    borderColor: colors.lavender,
    // White on white in light; the designs fill the pick with the wash.
    backgroundColor: palette === palettes.light ? colors.wash : colors.surfaceRaised,
  },
  field: {
    marginTop: spacing.md,
  },
  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  repeatCopy: {
    flex: 1,
    gap: 2,
  },
  dock: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.ground,
  },
  dockFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -24,
    height: 24,
  },
}));
