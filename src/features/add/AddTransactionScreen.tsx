import React, {useEffect, useMemo, useState} from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  BackspaceGlyph,
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
import {createTransaction, localDateISO} from '../../lib/transactionsStore';
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
  onClose: () => void;
  onSaved?: () => void;
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

const KEYS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'back'],
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

function applyKey(current: string, key: string): string {
  if (key === 'back') {
    if (current.length <= 1) {
      return '0';
    }
    const next = current.slice(0, -1);
    return next === '' || next === '-' ? '0' : next;
  }
  if (key === '.') {
    return current.includes('.') ? current : `${current}.`;
  }
  if (current === '0') {
    return key;
  }
  const fraction = current.split('.')[1];
  if (fraction && fraction.length >= 2) {
    return current;
  }
  if (current.replace('.', '').length >= 9) {
    return current;
  }
  return current + key;
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

export function AddTransactionScreen({
  visible,
  initialKind,
  currencySymbol,
  categoryIds,
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
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [dbCategories, setDbCategories] = useState<CategoryRow[]>([]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setKind(initialKind);
    setAmount('0');
    setCategoryId(null);
    setCustomCategory('');
    setNote('');
    setOccurredOn(new Date());
    setDateOpen(false);
    setSaving(false);
    setShowAllCategories(false);
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
  }, [initialKind, visible]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardOpen(true);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardOpen(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const extraExpenseCategories = useMemo(() => {
    const shown = new Set(EXPENSE_GRID.map(item => item.id));
    const fromProfile = categoryIds
      .map(id => categoryById(id))
      .filter(
        (item): item is NonNullable<typeof item> =>
          Boolean(item) && !shown.has(item.id),
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
  const submitLabel = saving ? 'Saving…' : KIND_META[kind].verb;
  const tone = KIND_META[kind];
  const currencyCode = currencyCodeFromSymbol(currencySymbol);
  const moreCategories = kind === 'expense' && extraExpenseCategories.length > 0;

  const onKindChange = (next: AddKind) => {
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
      await createTransaction({
        type: kind,
        amount: numericAmount,
        categoryId: categoryRow?.id ?? null,
        description: categoryRow?.name ?? categoryName,
        merchant: categoryRow?.name ?? categoryName,
        transactionDate: localDateISO(occurredOn),
        notes: note.trim() || null,
      });
      onSaved?.();
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
      <View style={[styles.root, {paddingTop: insets.top}]}>
        <StatusBar barStyle="dark-content" />
        <View pointerEvents="none" style={styles.wash} />

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
              {tone.title}
            </AppText>
            <AppText variant="caption" color={colors.inkMuted}>
              {tone.subtitle}
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

        <View style={styles.kindTrack}>
          {(['expense', 'income'] as const).map(item => {
            const selected = kind === item;
            const itemTone = KIND_META[item];
            return (
              <PressableScale
                key={item}
                onPress={() => onKindChange(item)}
                scaleTo={0.98}
                accessibilityRole="radio"
                accessibilityState={{selected}}
                containerStyle={styles.kindOption}
                style={[
                  styles.kindFace,
                  selected && {backgroundColor: itemTone.accent},
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
                  color={selected ? colors.onInk : colors.ink}>
                  {item === 'expense' ? 'Expense' : 'Income'}
                </AppText>
              </PressableScale>
            );
          })}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            compact && styles.scrollCompact,
          ]}
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
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[
                  styles.amountDigits,
                  {
                    fontSize: compact ? 40 : 48,
                    lineHeight: compact ? 46 : 54,
                  },
                ]}>
                {formatAmountInput(amount, currencySymbol)}
              </AppText>
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
              maxLength={NOTE_LIMIT}
              style={styles.noteInput}
            />
            <AppText variant="caption" color={colors.inkMuted}>
              {note.length}/{NOTE_LIMIT}
            </AppText>
          </View>
        </ScrollView>

        <View
          style={[
            styles.dock,
            {paddingBottom: Math.max(insets.bottom, spacing.md)},
          ]}>
          {keyboardOpen ? null : (
            <View style={[styles.keypad, compact && styles.keypadCompact]}>
              {KEYS.map(row => (
                <View key={row.join('-')} style={styles.keyRow}>
                  {row.map(key => (
                    <PressableScale
                      key={key}
                      onPress={() =>
                        setAmount(current => applyKey(current, key))
                      }
                      scaleTo={0.96}
                      accessibilityRole="button"
                      accessibilityLabel={key === 'back' ? 'Delete' : key}
                      containerStyle={styles.keyHit}
                      style={[
                        styles.key,
                        compact && styles.keyCompact,
                        key === 'back' && styles.utilityKey,
                      ]}>
                      {key === 'back' ? (
                        <BackspaceGlyph color={colors.inkSecondary} size={18} />
                      ) : (
                        <AppText variant="heading" color={colors.ink}>
                          {key}
                        </AppText>
                      )}
                    </PressableScale>
                  ))}
                </View>
              ))}
            </View>
          )}

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
        </View>

        <DatePickerSheet
          visible={dateOpen}
          value={occurredOn}
          onClose={() => setDateOpen(false)}
          onChange={setOccurredOn}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFF8F4',
    overflow: 'hidden',
  },
  wash: {
    position: 'absolute',
    top: -80,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#FFD9D0',
    opacity: 0.55,
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
    marginHorizontal: layout.screenPadding,
    marginTop: spacing.xl,
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  kindOption: {
    flex: 1,
  },
  kindFace: {
    height: 50,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
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
  amountDigits: {
    flex: 1,
    fontVariant: ['tabular-nums'],
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
    paddingTop: spacing.sm,
    gap: spacing.md,
    backgroundColor: '#FFF8F4',
  },
  keypad: {
    gap: spacing.sm,
  },
  keypadCompact: {
    gap: spacing.xs,
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  keyHit: {
    flex: 1,
    alignItems: 'center',
  },
  key: {
    width: 68,
    height: 68,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  utilityKey: {
    backgroundColor: '#EFEAE4',
  },
  keyCompact: {
    width: 56,
    height: 56,
  },
  submit: {
    height: 56,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
