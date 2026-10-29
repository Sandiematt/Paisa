import React, {useMemo} from 'react';
import {View} from 'react-native';
import {Target, Warning} from 'phosphor-react-native';

import {AppText, Card, ProgressBar} from '../../components/ui';
import {CategoryRow} from '../../lib/categoriesStore';
import {formatMoney} from '../../lib/formatMoney';
import {TransactionRow} from '../../lib/transactionsStore';
import {colors} from '../../theme';
import {budgetAllocation} from '../autotrack/dailyAllowance';
import {DetailsFrame, HeroCard, StatCard, StatRow, useDetailsStyles} from './DetailsParts';
import {AreaChart} from './charts';
import {relatedTransactions, savingsSeries} from './homeInsights';
import {
  HomeRange,
  MonthSavings,
  SavingsState,
  lastMonthLine,
  rangeNoun,
  rangeScopeLabel,
  yearlyFromMonthly,
} from './homeReport';
import {RelatedTransactions} from './RelatedTransactions';

type SavingsDetailsScreenProps = {
  visible: boolean;
  onClose: () => void;
  currencySymbol: string;
  monthlySavingsGoal: number;
  periodSavingsTarget: number;
  actualSavings: number;
  savingsVsTarget: number;
  /** What the goal asks for through today; on track means saved at least this. */
  savingsTargetToDate?: number;
  savingsState: SavingsState;
  /** Savings come from what the daily plan left, not income less spending. */
  fromPlan?: boolean;
  range: HomeRange;
  /** How the last finished budget month ended; null hides the card. */
  lastMonth?: MonthSavings | null;
  transactions?: TransactionRow[];
  categories?: CategoryRow[];
};

const EMPTY_ROWS: TransactionRow[] = [];
const EMPTY_CATEGORIES: CategoryRow[] = [];

export function SavingsDetailsScreen({
  visible,
  onClose,
  currencySymbol,
  monthlySavingsGoal,
  periodSavingsTarget,
  actualSavings,
  savingsVsTarget,
  savingsTargetToDate = 0,
  savingsState,
  fromPlan = false,
  range,
  lastMonth = null,
  transactions = EMPTY_ROWS,
  categories = EMPTY_CATEGORIES,
}: SavingsDetailsScreenProps) {
  const detailsStyles = useDetailsStyles();
  const target = periodSavingsTarget > 0 ? periodSavingsTarget : monthlySavingsGoal;
  const progress = target > 0 ? Math.max(0, Math.min(1, actualSavings / target)) : 0;
  const onTrack = savingsVsTarget >= 0;
  const remaining = target - actualSavings;
  // Same split as the budget: the month's goal over its weeks, a week over 7 days.
  const allocation = budgetAllocation(monthlySavingsGoal, new Date());
  const yearlyPotential = yearlyFromMonthly(monthlySavingsGoal);
  const periodLabel = rangeScopeLabel(range);
  const noIncome = savingsState.kind === 'no-income';
  const hasGoal = target > 0;
  const money = (amount: number) => formatMoney(amount, currencySymbol, {decimals: 0});
  const overspend = savingsState.kind === 'negative' ? money(savingsState.overspend) : null;
  const related = useMemo(
    () => (visible ? relatedTransactions(transactions, range, 'all', 8) : EMPTY_ROWS),
    [range, transactions, visible],
  );

  const series = useMemo(
    () => (visible ? savingsSeries(transactions, range) : [0]),
    [range, transactions, visible],
  );
  const hasActivity = series.some(value => value !== 0);

  const savedColor =
    savingsState.kind === 'negative'
      ? colors.roseLight
      : noIncome
        ? colors.muted
        : colors.text;

  return (
    <DetailsFrame visible={visible} title="Savings Goal" onClose={onClose}>
      {overspend ? (
        <View style={detailsStyles.warning} accessibilityRole="alert">
          <Warning size={20} weight="fill" color={colors.roseLight} />
          <AppText variant="bodyStrong" color={colors.roseLight} style={detailsStyles.warningText}>
            {fromPlan
              ? `Spending is ${overspend} over what the budget and savings goal allow this ${rangeNoun(range)}`
              : `You spent ${overspend} more than you earned this ${rangeNoun(range)}`}
          </AppText>
        </View>
      ) : null}

      {hasGoal ? (
        <HeroCard
          label={range === 'month' ? 'Monthly savings goal' : `Target ${periodLabel}`}
          amount={money(target)}>
          <View style={detailsStyles.meter}>
            <ProgressBar
              progress={progress}
              gradient={onTrack ? 'savings' : 'rose'}
              height={10}
            />
            <View style={detailsStyles.meterFooter}>
              <AppText variant="caption" color={colors.muted}>
                {Math.round(progress * 100)}% of {periodLabel}'s goal
              </AppText>
              {noIncome ? null : (
                <AppText variant="caption" color={onTrack ? colors.mint : colors.roseLight}>
                  {onTrack ? 'On track' : 'Off track'}
                </AppText>
              )}
            </View>
          </View>
          {!noIncome && savingsTargetToDate > 0 ? (
            <AppText variant="caption" color={colors.muted} style={detailsStyles.note}>
              {fromPlan
                ? `${money(savingsTargetToDate)} of the goal is due for the days so far, at ${money(
                    allocation.dailyBudget,
                  )} a day. Each day you spend under your daily budget adds the difference the next day. ${
                    onTrack ? "You're ahead of it." : "You're behind it."
                  }`
                : `${money(savingsTargetToDate)} is due by today at ${money(
                    allocation.dailyBudget,
                  )} a day. ${onTrack ? "You're ahead of it." : "You're behind it."}`}
            </AppText>
          ) : null}
          {range !== 'month' && periodSavingsTarget > 0 ? (
            <AppText variant="caption" color={colors.muted} style={detailsStyles.note}>
              Target {periodLabel} is {money(periodSavingsTarget)} from the monthly goal.
            </AppText>
          ) : null}
        </HeroCard>
      ) : null}

      <StatRow>
        <StatCard
          label="Saved"
          value={noIncome ? 'No income recorded' : money(actualSavings)}
          dotColor={colors.lavender}
          valueColor={savedColor}
        />
        {hasGoal && !noIncome ? (
          <StatCard
            label={remaining > 0 ? 'To go' : 'Ahead'}
            value={money(Math.abs(remaining))}
            dotColor={remaining > 0 ? colors.muted : colors.mint}
            valueColor={remaining > 0 ? colors.text : colors.mint}
          />
        ) : null}
      </StatRow>

      {lastMonth ? (
        <Card style={detailsStyles.gap} testID="last-month-savings">
          <AppText variant="heading" accessibilityRole="header" style={detailsStyles.cardTitle}>
            {`Last month · ${lastMonth.label}`}
          </AppText>
          <AppText
            variant="bodyStrong"
            color={
              lastMonth.saved < 0
                ? colors.roseLight
                : lastMonth.goal > 0 && lastMonth.saved < lastMonth.goal
                  ? colors.text
                  : colors.mint
            }>
            {lastMonthLine(lastMonth, money)}
          </AppText>
          <AppText variant="caption" color={colors.muted} style={detailsStyles.note}>
            Income that came in less everything spent, bills included.
          </AppText>
        </Card>
      ) : null}

      <Card style={detailsStyles.gap}>
        <AppText variant="heading" accessibilityRole="header" style={detailsStyles.cardTitle}>
          {`Savings ${periodLabel}`}
        </AppText>
        {hasActivity ? (
          <>
            <AreaChart
              values={series}
              height={120}
              accessibilityLabel={`Savings trend ${periodLabel}, ${money(
                series[series.length - 1] ?? 0,
              )} so far`}
            />
            <AppText variant="caption" color={colors.muted}>
              Running income minus spending, day by day.
            </AppText>
          </>
        ) : (
          <AppText variant="body" color={colors.muted}>
            Add income and expenses and your savings trend will draw here.
          </AppText>
        )}
      </Card>

      {monthlySavingsGoal > 0 ? (
        <Card style={detailsStyles.gap}>
          <AppText variant="heading" accessibilityRole="header" style={detailsStyles.cardTitle}>
            From this monthly target
          </AppText>
          <View style={detailsStyles.derivedRow}>
            <AppText variant="body">
              {`Weekly (${Number(allocation.weeksInMonth.toFixed(2))} weeks this month)`}
            </AppText>
            <AppText variant="bodyStrong" style={detailsStyles.tabular}>
              {money(allocation.weeklyBudget)}
            </AppText>
          </View>
          <View style={[detailsStyles.derivedRow, detailsStyles.divider]}>
            <AppText variant="body">Daily</AppText>
            <AppText variant="bodyStrong" style={detailsStyles.tabular}>
              {money(allocation.dailyBudget)}
            </AppText>
          </View>
          <View style={[detailsStyles.derivedRow, detailsStyles.divider]}>
            <AppText variant="body">Yearly potential</AppText>
            <AppText variant="bodyStrong" style={detailsStyles.tabular}>
              {money(yearlyPotential)}
            </AppText>
          </View>
        </Card>
      ) : (
        <Card style={[detailsStyles.gap, detailsStyles.emptyCard]}>
          <Target size={32} weight="fill" color={colors.sky} />
          <AppText variant="heading" align="center">
            No savings goal yet
          </AppText>
          <AppText variant="body" color={colors.muted} align="center">
            Set a monthly savings goal in your profile. Weekly and yearly figures follow from that
            one number.
          </AppText>
        </Card>
      )}

      <View style={detailsStyles.gap}>
        <RelatedTransactions
          title={`Income and spending ${periodLabel}`}
          rows={related}
          categories={categories}
          currencySymbol={currencySymbol}
          emptyText="No transactions yet. Income and expenses will show up here."
        />
      </View>
    </DetailsFrame>
  );
}

