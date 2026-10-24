import React from 'react';
import {StyleSheet, View} from 'react-native';

import {AppText, Card, PressableScale} from '../../components/ui';
import {CategoryRow} from '../../lib/categoriesStore';
import {formatMoney} from '../../lib/formatMoney';
import {TransactionRow} from '../../lib/transactionsStore';
import {colors, fonts} from '../../theme';
import {shortDateLabel} from './homeInsights';

type RelatedTransactionsProps = {
  title: string;
  rows: TransactionRow[];
  categories: CategoryRow[];
  currencySymbol: string;
  emptyText: string;
  /** Adds a "See all" link in the header. */
  onSeeAll?: () => void;
};

/** Short list of the transactions behind a Budget or Savings figure. */
export function RelatedTransactions({
  title,
  rows,
  categories,
  currencySymbol,
  emptyText,
  onSeeAll,
}: RelatedTransactionsProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <AppText variant="heading" accessibilityRole="header" style={styles.title}>
          {title}
        </AppText>
        {onSeeAll ? (
          <PressableScale
            onPress={onSeeAll}
            scaleTo={0.94}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="See all transactions">
            <AppText variant="label" color={colors.lavender}>
              See all
            </AppText>
          </PressableScale>
        ) : null}
      </View>
      {rows.length === 0 ? (
        <AppText variant="label" color={colors.muted} style={styles.empty}>
          {emptyText}
        </AppText>
      ) : (
        <View style={styles.list}>
          {rows.map((row, index) => {
            const category = categories.find(item => item.id === row.categoryId);
            const label =
              row.merchant?.trim() ||
              row.description?.trim() ||
              category?.name ||
              'Transaction';
            const income = row.type === 'income';
            const meta = [
              category?.name ?? (income ? 'Income' : 'Uncategorized'),
              shortDateLabel(row.transactionDate),
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <View
                key={row.id}
                style={[styles.row, index > 0 && styles.rowDivider]}>
                <View
                  style={[
                    styles.dot,
                    {backgroundColor: category?.color ?? colors.muted},
                  ]}
                />
                <View style={styles.rowText}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {label}
                  </AppText>
                  <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                    {meta}
                  </AppText>
                </View>
                <AppText
                  style={[
                    styles.amount,
                    {color: income ? colors.mint : colors.text},
                  ]}
                  numberOfLines={1}>
                  {`${income ? '+' : '-'}${formatMoney(row.amount, currencySymbol, {
                    decimals: 0,
                  })}`}
                </AppText>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flexShrink: 1,
  },
  empty: {
    marginTop: 8,
  },
  list: {
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  amount: {
    fontFamily: fonts.jakartaBold,
    fontSize: 15,
    lineHeight: 21,
    fontVariant: ['tabular-nums'],
  },
});
