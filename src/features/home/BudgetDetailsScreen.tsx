import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {Wallet} from 'phosphor-react-native';

import {AppText, Card, ProgressBar} from '../../components/ui';
import {CategoryRow} from '../../lib/categoriesStore';
import {formatMoney} from '../../lib/formatMoney';
import {TransactionRow} from '../../lib/transactionsStore';
import {colors} from '../../theme';
import {daysLabel, weekProgress} from '../autotrack/autoTrackFormat';
import {buildBudgetSnapshot, dailyAllowance} from '../autotrack/dailyAllowance';
import {DetailsFrame, HeroCard, StatCard, StatRow, detailsStyles} from './DetailsParts';
import {relatedTransactions} from './homeInsights';
import {HomeRange, SpendSlice, rangePlanTitle, rangeScopeLabel} from './homeReport';
import {RelatedTransactions} from './RelatedTransactions';

type BudgetDetailsScreenProps = {
  visible: boolean;
  onClose: () => void;
  currencySymbol: string;
  budget: number;
  spent: number;
  remainingBudget: number;
  spendRatio: number;
  overBudget: boolean;
  slices: SpendSlice[];
  range?: HomeRange;
  transactions?: TransactionRow[];
  categories?: CategoryRow[];
  /**
   * The full monthly budget. `budget` above is scaled to the selected range,
   * so the daily plan needs this. Zero or less hides the Daily plan card.
   */
  monthlyBudget?: number;
  /** Spend not in `transactions` yet (UPI payments detected but not synced), by local date. */
  extraSpendByDate?: Record<string, number>;
  /** Overrides "now" for the daily plan; tests only. */
  today?: Date;
};

const EMPTY_ROWS: TransactionRow[] = [];
const EMPTY_CATEGORIES: CategoryRow[] = [];
const NO_EXTRA_SPEND: Record<string, number> = {};

export function BudgetDetailsScreen({
  visible,
  onClose,
  currencySymbol,
  budget,
  spent,
  remainingBudget,
  spendRatio,
  overBudget,
  slices,
  range = 'month',
  transactions = EMPTY_ROWS,
  categories = EMPTY_CATEGORIES,
  monthlyBudget = 0,
  extraSpendByDate = NO_EXTRA_SPEND,
  today,
}: BudgetDetailsScreenProps) {
  const progress = budget > 0 ? Math.max(0, Math.min(1, spent / budget)) : 0;
  const money = (amount: number) => formatMoney(amount, currencySymbol, {decimals: 0});
  const related = useMemo(
    () => (visible ? relatedTransactions(transactions, range, 'expenses', 8) : EMPTY_ROWS),
    [range, transactions, visible],
  );

  // The same function the dashboard and the UPI spend guard use, so the
  // number matches everywhere. It needs the whole month's ledger, not the
  // range-filtered view.
  const plan = useMemo(() => {
    if (!visible || !(monthlyBudget > 0)) {
      return null;
    }
    const now = today ?? new Date();
    return dailyAllowance(
      buildBudgetSnapshot(transactions, monthlyBudget, now),
      now,
      extraSpendByDate,
    );
  }, [extraSpendByDate, monthlyBudget, today, transactions, visible]);

  return (
    <DetailsFrame visible={visible} title="Budget" onClose={onClose}>
      <HeroCard label={rangePlanTitle(range, 'budget')} amount={money(budget)}>
        <View style={detailsStyles.meter}>
          <ProgressBar
            progress={progress}
            gradient={overBudget ? 'rose' : 'primary'}
            height={10}
          />
          <View style={detailsStyles.meterFooter}>
            <AppText variant="caption" color={colors.muted}>
              {overBudget ? `${spendRatio}% used` : `${Math.min(100, spendRatio)}% used`}
            </AppText>
            <AppText variant="caption" color={overBudget ? colors.roseLight : colors.muted}>
              {overBudget ? 'Over budget' : 'Within budget'}
            </AppText>
          </View>
        </View>
      </HeroCard>

      <StatRow>
        <StatCard label="Spent" value={money(spent)} dotColor={colors.roseLight} />
        <StatCard
          label={overBudget ? 'Over by' : 'Remaining'}
          value={money(Math.abs(remainingBudget))}
          dotColor={overBudget ? colors.roseLight : colors.mint}
          valueColor={overBudget ? colors.roseLight : colors.mint}
        />
      </StatRow>

      {plan ? (
        <Card style={detailsStyles.gap} testID="daily-plan">
          <AppText variant="heading" accessibilityRole="header" style={detailsStyles.cardTitle}>
            Daily plan
          </AppText>
          <AppText variant="label" color={colors.muted}>
            Today you can spend
          </AppText>
          <AppText
            variant="numeric"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={planStyles.limit}>
            {money(plan.dailyLimit)}
          </AppText>
          <AppText variant="label" color={colors.muted} style={planStyles.line}>
            {`Spent today ${money(plan.spentToday)} · `}
            {plan.remainingToday < 0 ? (
              <AppText variant="label" color={colors.roseLight}>
                {`Over today's limit by ${money(-plan.remainingToday)}`}
              </AppText>
            ) : (
              `${money(plan.remainingToday)} left today`
            )}
          </AppText>
          <View style={planStyles.week}>
            <ProgressBar
              progress={weekProgress(plan)}
              gradient={plan.remainingWeek < 0 ? 'rose' : 'primary'}
              height={4}
            />
          </View>
          <AppText
            variant="label"
            color={plan.remainingWeek < 0 ? colors.roseLight : colors.muted}
            style={planStyles.line}>
            {`This week ${money(plan.weekBudget)} · ${money(
              Math.abs(plan.remainingWeek),
            )} ${plan.remainingWeek < 0 ? 'over' : 'left'} · ${daysLabel(
              plan.daysLeftInWeek,
              'to go',
            )}`}
          </AppText>
          <AppText variant="caption" color={colors.muted} style={detailsStyles.note}>
            Unspent money rolls into the rest of the week; overspending lowers the coming days.
          </AppText>
        </Card>
      ) : null}

      {slices.length > 0 ? (
        <Card style={detailsStyles.gap}>
          <AppText variant="heading" accessibilityRole="header" style={detailsStyles.cardTitle}>
            By category
          </AppText>
          {slices.map((slice, index) => {
            // Derive amount from the percentage share of total spent.
            const sliceAmount = (slice.percent / 100) * spent;
            return (
              <View
                key={slice.id}
                style={[detailsStyles.listRow, index > 0 && detailsStyles.divider]}>
                <View style={detailsStyles.meterFooter}>
                  <View style={detailsStyles.listRowLabel}>
                    <View style={[detailsStyles.dot, {backgroundColor: slice.color}]} />
                    <AppText
                      variant="bodyStrong"
                      numberOfLines={1}
                      style={detailsStyles.listRowFlex}>
                      {slice.label}
                    </AppText>
                  </View>
                  <AppText variant="bodyStrong" style={detailsStyles.tabular}>
                    {money(sliceAmount)}
                  </AppText>
                  <AppText variant="caption" color={colors.muted} style={detailsStyles.pct}>
                    {slice.percent}%
                  </AppText>
                </View>
                <View style={detailsStyles.sliceBar}>
                  <ProgressBar progress={slice.percent / 100} color={slice.color} height={4} />
                </View>
              </View>
            );
          })}
        </Card>
      ) : (
        <Card style={[detailsStyles.gap, detailsStyles.emptyCard]}>
          <Wallet size={32} weight="fill" color={colors.lavender} />
          <AppText variant="heading" align="center">
            No spending yet
          </AppText>
          <AppText variant="body" color={colors.muted} align="center">
            Add transactions and they'll appear here, broken down by category.
          </AppText>
        </Card>
      )}

      <View style={detailsStyles.gap}>
        <RelatedTransactions
          title={`Spending ${rangeScopeLabel(range)}`}
          rows={related}
          categories={categories}
          currencySymbol={currencySymbol}
          emptyText="Nothing spent yet. Your latest expenses will show up here."
        />
      </View>
    </DetailsFrame>
  );
}

const planStyles = StyleSheet.create({
  limit: {
    fontSize: 28,
    lineHeight: 34,
    marginTop: 2,
  },
  line: {
    marginTop: 6,
  },
  week: {
    marginTop: 12,
  },
});
