import React, {useEffect, useMemo, useState} from 'react';
import {
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  BackspaceGlyph,
  MicGlyph,
  ReceiptGlyph,
} from '../../components/icons/Glyphs';
import {
  AppText,
  BackButton,
  PressableScale,
  PrimaryButton,
  SecondaryButton,
  TogglePill,
} from '../../components/ui';
import {formatAmountInput, parseAmountInput} from '../../lib/formatMoney';
import {colors, layout, radii, spacing} from '../../theme';
import {CATEGORIES, categoryById} from '../onboarding/constants';
import {AddKind} from './types';

type AddTransactionScreenProps = {
  visible: boolean;
  initialKind: AddKind;
  currencySymbol: string;
  categoryIds: string[];
  onClose: () => void;
};

const INCOME_CATEGORIES = [
  {id: 'salary', label: 'Salary'},
  {id: 'freelance', label: 'Freelance'},
  {id: 'refund', label: 'Refund'},
  {id: 'other', label: 'Other'},
];

const KEYS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'back'],
];

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
  });
  return sameDay ? `Today · ${stamp}` : stamp;
}

export function AddTransactionScreen({
  visible,
  initialKind,
  currencySymbol,
  categoryIds,
  onClose,
}: AddTransactionScreenProps) {
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const compact = height < 740;

  const [kind, setKind] = useState<AddKind>(initialKind);
  const [amount, setAmount] = useState('0');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setKind(initialKind);
    setAmount('0');
    setCategoryId(null);
  }, [initialKind, visible]);

  const expenseCategories = useMemo(() => {
    const picked = categoryIds
      .map(id => categoryById(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return picked.length > 0 ? picked : CATEGORIES;
  }, [categoryIds]);

  const categories =
    kind === 'income' ? INCOME_CATEGORIES : expenseCategories;

  const selectedCategory =
    categoryId && categories.some(item => item.id === categoryId)
      ? categoryId
      : categories[0]?.id ?? null;

  const numericAmount = parseAmountInput(amount);
  const canSubmit = numericAmount > 0;
  const submitLabel = canSubmit
    ? kind === 'income'
      ? 'Add income'
      : 'Add expense'
    : 'Enter an amount';

  const amountSize =
    amount.replace('.', '').length > 6 ? 40 : compact ? 48 : 56;

  const onKindChange = (next: AddKind) => {
    setKind(next);
    setCategoryId(null);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <View style={[styles.root, {paddingTop: insets.top}]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.topBar}>
          <BackButton onPress={onClose} />
        </View>
        <View style={styles.kinds}>
          <TogglePill
            label="Expense"
            selected={kind === 'expense'}
            onPress={() => onKindChange('expense')}
          />
          <TogglePill
            label="Income"
            selected={kind === 'income'}
            onPress={() => onKindChange('income')}
          />
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
            <AppText
              variant="numericHero"
              align="center"
              style={[styles.amount, {fontSize: amountSize, lineHeight: amountSize + 6}]}>
              {formatAmountInput(amount, currencySymbol)}
            </AppText>
            {compact ? null : (
              <AppText
                variant="caption"
                color={colors.inkMuted}
                align="center"
                style={styles.hint}>
                Tap the keypad, scan a receipt, or dictate
              </AppText>
            )}
          </View>

          <View style={styles.quickRow}>
            <View style={styles.quickBtn}>
              <SecondaryButton
                label="Scan receipt"
                onPress={() => {}}
                leading={<ReceiptGlyph color={colors.ink} size={16} />}
                style={styles.quickFill}
                accessibilityHint="Coming soon"
              />
            </View>
            <View style={styles.quickBtn}>
              <SecondaryButton
                label="Voice"
                onPress={() => {}}
                leading={<MicGlyph color={colors.ink} size={16} />}
                style={styles.quickFill}
                accessibilityHint="Coming soon"
              />
            </View>
          </View>

          <AppText variant="caption" color={colors.inkMuted} style={styles.sectionLabel}>
            Category
          </AppText>
          <View style={styles.chips}>
            {categories.map(item => (
              <TogglePill
                key={item.id}
                label={item.label}
                selected={selectedCategory === item.id}
                onPress={() => setCategoryId(item.id)}
              />
            ))}
          </View>

          <View style={styles.details}>
            <DetailRow label="Account" value="Everyday ...4021" />
            <DetailRow label="Date" value={formatDateLabel(new Date())} />
            <DetailRow label="Note" value="Add a note" muted />
          </View>
        </ScrollView>

        <View
          style={[
            styles.dock,
            {paddingBottom: Math.max(insets.bottom, spacing.md)},
          ]}>
          <View style={[styles.keypad, compact && styles.keypadCompact]}>
            {KEYS.map(row => (
              <View key={row.join('-')} style={styles.keyRow}>
                {row.map(key => (
                  <PressableScale
                    key={key}
                    onPress={() => setAmount(current => applyKey(current, key))}
                    scaleTo={0.96}
                    accessibilityRole="button"
                    accessibilityLabel={key === 'back' ? 'Delete' : key}
                    containerStyle={styles.keyHit}
                    style={[styles.key, compact && styles.keyCompact]}>
                    {key === 'back' ? (
                      <BackspaceGlyph color={colors.ink} size={20} />
                    ) : (
                      <AppText variant="heading">{key}</AppText>
                    )}
                  </PressableScale>
                ))}
              </View>
            ))}
          </View>

          <PrimaryButton
            label={submitLabel}
            onPress={onClose}
            disabled={!canSubmit}
            accessibilityHint={
              canSubmit
                ? `Saves this ${kind}`
                : 'Enter an amount to continue'
            }
          />
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="body" color={colors.inkSecondary}>
        {label}
      </AppText>
      <AppText
        variant="bodyStrong"
        color={muted ? colors.inkMuted : colors.ink}
        numberOfLines={1}
        style={styles.detailValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  kinds: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  scrollCompact: {
    paddingTop: spacing.md,
  },
  amountBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  amount: {
    fontVariant: ['tabular-nums'],
  },
  hint: {
    marginTop: spacing.sm,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickBtn: {
    flex: 1,
  },
  quickFill: {
    width: '100%',
  },
  sectionLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  details: {
    marginTop: spacing.xl,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: layout.hairlineWidth,
    borderBottomColor: colors.hairline,
    gap: spacing.lg,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  dock: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  keypad: {
    gap: spacing.sm,
  },
  keypadCompact: {
    gap: spacing.xs,
  },
  keyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  keyHit: {
    flex: 1,
  },
  key: {
    height: 52,
    borderRadius: radii.input,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyCompact: {
    height: 44,
  },
});
