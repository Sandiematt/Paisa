import React, {useMemo} from 'react';
import {View} from 'react-native';
import {Target, Warning} from 'phosphor-react-native';

import {AppText, Card, ProgressBar} from '../../components/ui';
import {CategoryRow} from '../../lib/categoriesStore';
import {formatMoney} from '../../lib/formatMoney';
import {TransactionRow} from '../../lib/transactionsStore';
import {colors} from '../../theme';
import {DetailsFrame, HeroCard, StatCard, StatRow, detailsStyles} from './DetailsParts';
import {relatedTransactions} from './homeInsights';
import {
  HomeRange,
  SavingsState,
  rangeNoun,
  rangeScopeLabel,
  scaleMonthly,
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
  savingsState: SavingsState;
  range: HomeRange;
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
  savingsState,
  range,
  transactions = EMPTY_ROWS,
  categories = EMPTY_CATEGORIES,
}: SavingsDetailsScreenProps) {
  const target = periodSavingsTarget > 0 ? periodSavingsTarget : monthlySavingsGoal;
  const progress = target > 0 ? Math.max(0, Math.min(1, actualSavings / target)) : 0;
  const onTrack = savingsVsTarget >= 0;
  const remaining = target - actualSavings;
  const weeklyPace = scaleMonthly(monthlySavingsGoal, 'week', new Date());
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
            You spent {overspend} more than you earned this {rangeNoun(range)}
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

      {monthlySavingsGoal > 0 ? (
        <Card style={detailsStyles.gap}>
          <AppText variant="heading" accessibilityRole="header" style={detailsStyles.cardTitle}>
            From this monthly target
          </AppText>
          <View style={detailsStyles.derivedRow}>
            <AppText variant="body">Weekly pace</AppText>
            <AppText variant="bodyStrong" style={detailsStyles.tabular}>
              {money(weeklyPace)}
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
