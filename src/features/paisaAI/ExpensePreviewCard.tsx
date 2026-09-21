import React from 'react';
import {StyleSheet, View} from 'react-native';

import {PressableScale, Text} from '../../components/ui';
import {formatMoney} from '../../lib/formatMoney';
import {colors, fonts, radii, spacing} from '../../theme';
import {ParsedExpense} from './types';

export type ExpensePreviewCardProps = {
  expense: ParsedExpense;
  currencySymbol: string;
  onAdd: () => void;
  onEdit: () => void;
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

export function ExpensePreviewCard({expense, currencySymbol, onAdd, onEdit}: ExpensePreviewCardProps) {
  const formattedAmount = formatMoney(expense.amount, currencySymbol, {
    decimals: expense.amount % 1 === 0 ? 0 : 2,
  });
  const displayDate = getDisplayDate(expense.date);
  const categoryLine = expense.subcategory && expense.subcategory !== expense.category
    ? `${expense.category} · ${expense.subcategory}`
    : expense.category;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text
          fontFamily={fonts.outfitSemi}
          fontSize={22}
          lineHeight={28}
          fontWeight="600"
          letterSpacing={-0.4}
          color={colors.ink}
          style={styles.amountText}>
          {formattedAmount}
        </Text>
        {expense.merchant ? (
          <Text
            fontFamily={fonts.interSemi}
            fontSize={15}
            lineHeight={22}
            fontWeight="600"
            color={colors.inkSecondary}
            numberOfLines={1}
            style={styles.merchant}>
            {expense.merchant}
          </Text>
        ) : null}
      </View>

      <Text fontFamily={fonts.interMedium} fontSize={13} lineHeight={18} color={colors.inkMuted}>
        {categoryLine}
      </Text>
      <Text fontFamily={fonts.interMedium} fontSize={12} lineHeight={17} color={colors.inkMuted} style={styles.dateInfo}>
        {displayDate}
      </Text>

      {expense.paymentMethod ? (
        <View style={styles.paymentMethod}>
          <Text fontFamily={fonts.interMedium} fontSize={12} lineHeight={17} color={colors.inkSecondary}>
            {expense.paymentMethod}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <PressableScale style={styles.addButton} onPress={onAdd} scaleTo={0.98}>
          <Text fontFamily={fonts.interSemi} fontSize={14} lineHeight={18} fontWeight="600" color={colors.onInk} numberOfLines={1}>
            Add expense
          </Text>
        </PressableScale>
        <PressableScale style={styles.editButton} onPress={onEdit} scaleTo={0.98}>
          <Text fontFamily={fonts.interSemi} fontSize={14} lineHeight={18} fontWeight="600" color={colors.ink} numberOfLines={1}>
            Edit
          </Text>
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
    flexShrink: 1,
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
});
