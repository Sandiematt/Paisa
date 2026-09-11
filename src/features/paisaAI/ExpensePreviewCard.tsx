import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText, PressableScale } from '../../components/ui';
import { colors, radii, spacing, typography, layout } from '../../theme';
import { ParsedExpense } from './types';
import { formatMoney } from '../../lib/formatMoney';

export type ExpensePreviewCardProps = {
  expense: ParsedExpense;
  currencySymbol: string;
  onAdd: () => void;
  onEdit: () => void;
};

const CATEGORY_EMOJI: Record<string, string> = {
  Food: '🍕',
  Shopping: '🛍️',
  Travel: '✈️',
  Bills: '📄',
  Entertainment: '🎬',
  Health: '💊',
  Other: '📦'
};

function getDisplayDate(dateStr: string) {
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';
  return dateStr;
}

export function ExpensePreviewCard({ expense, currencySymbol, onAdd, onEdit }: ExpensePreviewCardProps) {
  const emoji = CATEGORY_EMOJI[expense.category] || CATEGORY_EMOJI['Other'];
  const formattedAmount = formatMoney(expense.amount, currencySymbol, {
    decimals: expense.amount % 1 === 0 ? 0 : 2,
  });
  const displayDate = getDisplayDate(expense.date);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <AppText variant="heading" style={styles.amountText}>{formattedAmount}</AppText>
        {expense.merchant ? (
          <AppText variant="bodyStrong" style={styles.merchant} numberOfLines={1}>
            {expense.merchant}
          </AppText>
        ) : null}
      </View>
      
      <AppText variant="caption" style={styles.categoryInfo}>
        {emoji} {expense.category} → {expense.subcategory}
      </AppText>
      
      <AppText variant="caption" style={styles.dateInfo}>
        {displayDate}
      </AppText>

      {expense.paymentMethod && (
        <View style={styles.paymentMethod}>
          <AppText variant="caption" style={styles.paymentMethodText}>{expense.paymentMethod}</AppText>
        </View>
      )}

      <View style={styles.actions}>
        <PressableScale style={styles.addButton} onPress={onAdd}>
          <AppText variant="label" style={styles.addButtonText} numberOfLines={1}>
            Add Expense
          </AppText>
        </PressableScale>
        
        <PressableScale style={styles.editButton} onPress={onEdit}>
          <AppText variant="label" style={styles.editButtonText} numberOfLines={1}>
            Edit
          </AppText>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.canvasSunk,
    borderRadius: radii.input,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  amountText: {
    marginRight: spacing.md,
  },
  merchant: {
    color: colors.inkSecondary,
    flexShrink: 1,
  },
  categoryInfo: {
    color: colors.inkMuted,
    marginBottom: spacing.xs,
  },
  dateInfo: {
    color: colors.inkMuted,
    marginBottom: spacing.sm,
  },
  paymentMethod: {
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  paymentMethodText: {
    color: colors.inkSecondary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  addButton: {
    flex: 1,
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.onInk,
    fontWeight: '600',
  },
  editButton: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairlineStrong,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButtonText: {
    color: colors.ink,
    fontWeight: '600',
  },
});
