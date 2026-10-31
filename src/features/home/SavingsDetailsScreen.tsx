import React, {useMemo} from 'react';
import {View} from 'react-native';
import {Target} from 'phosphor-react-native/src/icons/Target';

import {AppText, Card, GhostButton} from '../../components/ui';
import {MonthState} from '../../lib/budgetEngine';
import {BudgetHistory, BudgetMonth} from '../../lib/budgetMonths';
import {CategoryRow} from '../../lib/categoriesStore';
import {formatMoney} from '../../lib/formatMoney';
import {TransactionRow} from '../../lib/transactionsStore';
import {colors, makeStyles, spacing} from '../../theme';
import {dayMonth, partialLabel} from './budgetCopy';
import {DetailsFrame, HeroCard, StatCard, StatRow, useDetailsStyles} from './DetailsParts';
import {relatedTransactions} from './homeInsights';
import {HomeRange, rangeScopeLabel, yearlyFromMonthly} from './homeReport';
import {RelatedTransactions} from './RelatedTransactions';

type SavingsDetailsScreenProps = {
  visible: boolean;
  onClose: () => void;
  currencySymbol: string;
  /** This cycle's rolling budget; null when no budget is set. */
  budget: MonthState | null;
  monthlySavingsGoal: number;
  /** Finished months and money moved between budget and savings. */
  history: BudgetHistory;
  /** Extra savings kept from finished months (budgetInputs.keptExtraSavings). */
  keptExtra: number;
  range: HomeRange;
  transactions?: TransactionRow[];
  categories?: CategoryRow[];
  /** Moves some kept extra savings into this month's budget. */
  onMoveToBudget?: () => void;
  /** Moves some of this month's unspent money to savings. */
  onMoveToSavings?: () => void;
  /** Sheets opened from this screen, shown above it. */
  sheets?: React.ReactNode;
};

const EMPTY_ROWS: TransactionRow[] = [];
const EMPTY_CATEGORIES: CategoryRow[] = [];

export type SavingsHistoryItem = {key: string; title: string; detail: string; amount: number};

/** "October", or "25 Sep – 24 Oct" for a payday cycle. */
function cycleName(month: Pick<BudgetMonth, 'cycleStart' | 'cycleEnd'>): string {
  const [year, m, day] = month.cycleStart.split('-').map(Number);
  if (day === 1) {
    return new Date(year, m - 1, 1).toLocaleDateString('en-IN', {month: 'long'});
  }
  return `${dayMonth(month.cycleStart)} – ${dayMonth(month.cycleEnd)}`;
}

/**
 * Extra savings over the months, newest first: each finished month's extra
 * and what became of it ("Rollover from October"), and money moved by hand.
 */
export function savingsHistory(
  history: BudgetHistory,
  money: (amount: number) => string,
): SavingsHistoryItem[] {
  const items: (SavingsHistoryItem & {at: string})[] = [];
  for (const month of history.months) {
    const name = cycleName(month);
    const partial = month.partialFrom ? ` (partial month, tracked from ${dayMonth(month.partialFrom)})` : '';
    if (month.overspentBy > 0) {
      items.push({
        key: `month:${month.cycleStart}`,
        at: month.cycleEnd,
        title: `${name}: overspent`,
        detail: `${money(month.overspentBy)} over budget${partial}. Nothing was taken from savings.`,
        amount: 0,
      });
      continue;
    }
    if (month.extraSavings <= 0) {
      continue;
    }
    items.push({
      key: `month:${month.cycleStart}`,
      at: month.cycleEnd,
      title: `${name}: extra savings`,
      detail: `Left unspent${partial}`,
      amount: month.extraSavings,
    });
    if (month.toBudget > 0) {
      items.push({
        key: `rollover:${month.cycleStart}`,
        at: month.handledAt ?? month.cycleEnd,
        title: `Rollover from ${name}`,
        detail: 'Added to the next budget',
        amount: -month.toBudget,
      });
    }
  }
  for (const adjustment of history.adjustments) {
    if (adjustment.kind === 'top_up') {
      continue;
    }
    items.push({
      key: `move:${adjustment.id}`,
      at: adjustment.createdAt,
      title: adjustment.kind === 'move_to_budget' ? 'Moved to budget' : 'Moved to savings',
      detail: adjustment.label ?? `For ${dayMonth(adjustment.cycleStart)} onwards`,
      amount: adjustment.kind === 'move_to_budget' ? -adjustment.amount : adjustment.amount,
    });
  }
  return items
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .map(({at: _at, ...item}) => item);
}

export function SavingsDetailsScreen({
  visible,
  onClose,
  currencySymbol,
  budget,
  monthlySavingsGoal,
  history,
  keptExtra,
  range,
  transactions = EMPTY_ROWS,
  categories = EMPTY_CATEGORIES,
  onMoveToBudget,
  onMoveToSavings,
  sheets,
}: SavingsDetailsScreenProps) {
  const detailsStyles = useDetailsStyles();
  const styles = useStyles();
  const money = (amount: number) => formatMoney(amount, currencySymbol, {decimals: 0});
  const goal = budget?.savingsGoal ?? monthlySavingsGoal;
  const projected = budget && budget.kind === 'active' ? budget.projectedExtra : 0;
  const overspent = budget?.overspent ?? false;
  const goalsSoFar = history.months.reduce((sum, month) => sum + month.savingsGoal, 0);
  const items = useMemo(
    () => savingsHistory(history, amount => formatMoney(amount, currencySymbol, {decimals: 0})),
    [currencySymbol, history],
  );
  const related = useMemo(
    () => (visible ? relatedTransactions(transactions, range, 'all', 8) : EMPTY_ROWS),
    [range, transactions, visible],
  );
  const partial = budget ? partialLabel(budget) : null;

  return (
    <DetailsFrame visible={visible} title="Savings" onClose={onClose}>
      <HeroCard label="Saved this month" amount={money(goal + projected)}>
        <AppText variant="caption" color={colors.muted}>
          Your money stays in your bank. Paisa just keeps count.
        </AppText>
        {partial ? (
          <AppText variant="caption" color={colors.lavender}>
            {partial}
          </AppText>
        ) : null}
      </HeroCard>

      <Card style={detailsStyles.gap} testID="savings-lines">
        <View style={styles.line}>
          <View style={detailsStyles.listRowFlex}>
            <AppText variant="bodyStrong">Savings goal</AppText>
            <AppText variant="caption" color={colors.muted}>
              {goal > 0
                ? 'Saved first, before you spend.'
                : 'No goal set. Add one in your profile.'}
            </AppText>
          </View>
          <AppText variant="bodyStrong" style={detailsStyles.tabular}>
            {money(goal)}
          </AppText>
        </View>
        <View style={[styles.line, detailsStyles.divider]}>
          <View style={detailsStyles.listRowFlex}>
            <AppText variant="bodyStrong">Extra savings</AppText>
            <AppText variant="caption" color={overspent ? colors.roseLight : colors.muted}>
              {overspent
                ? 'None this month. You went over budget.'
                : budget?.kind === 'active'
                  ? 'Money you have not spent yet. Final at month end.'
                  : 'Money left unspent at month end.'}
            </AppText>
          </View>
          <AppText
            variant="bodyStrong"
            color={overspent ? colors.roseLight : colors.mint}
            style={detailsStyles.tabular}>
            {money(projected)}
          </AppText>
        </View>
      </Card>

      <StatRow>
        <StatCard label="Extra saved before" value={money(keptExtra)} dotColor={colors.mint} />
        <StatCard label="Goals saved before" value={money(goalsSoFar)} dotColor={colors.sky} />
      </StatRow>

      {onMoveToBudget || onMoveToSavings ? (
        <Card style={detailsStyles.gap}>
          <AppText variant="bodyStrong">Move money</AppText>
          <AppText variant="caption" color={colors.muted} style={styles.note}>
            Spend some of your saved extra this month, or save some of this month's money.
          </AppText>
          <View style={styles.actions}>
            {onMoveToBudget ? (
              <GhostButton
                label="Move to budget"
                tone="ink"
                disabled={keptExtra <= 0}
                onPress={onMoveToBudget}
                style={styles.action}
              />
            ) : null}
            {onMoveToSavings ? (
              <GhostButton
                label="Move to savings"
                tone="ink"
                disabled={!budget || budget.kind !== 'active' || budget.remaining <= 0}
                onPress={onMoveToSavings}
                style={styles.action}
              />
            ) : null}
          </View>
        </Card>
      ) : null}

      {items.length > 0 ? (
        <Card style={detailsStyles.gap} testID="savings-history">
          <AppText variant="heading" accessibilityRole="header" style={detailsStyles.cardTitle}>
            Extra savings history
          </AppText>
          {items.map((item, index) => (
            <View key={item.key} style={[styles.line, index > 0 && detailsStyles.divider]}>
              <View style={detailsStyles.listRowFlex}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {item.title}
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {item.detail}
                </AppText>
              </View>
              <AppText
                variant="bodyStrong"
                color={item.amount < 0 ? colors.muted : colors.mint}
                style={detailsStyles.tabular}>
                {item.amount === 0 ? '—' : `${item.amount < 0 ? '−' : '+'}${money(Math.abs(item.amount))}`}
              </AppText>
            </View>
          ))}
        </Card>
      ) : goal <= 0 ? (
        <Card style={[detailsStyles.gap, detailsStyles.emptyCard]}>
          <Target size={32} weight="fill" color={colors.sky} />
          <AppText variant="heading" align="center">
            No savings goal yet
          </AppText>
          <AppText variant="body" color={colors.muted} align="center">
            {`Set a monthly savings goal in your profile. It is set aside before your daily limit, about ${money(
              yearlyFromMonthly(1000),
            )} a year for every ${money(1000)} a month.`}
          </AppText>
        </Card>
      ) : null}

      <View style={detailsStyles.gap}>
        <RelatedTransactions
          title={`Income and spending ${rangeScopeLabel(range)}`}
          rows={related}
          categories={categories}
          currencySymbol={currencySymbol}
          emptyText="No transactions yet. Income and expenses will show up here."
        />
      </View>
      {sheets}
    </DetailsFrame>
  );
}

const useStyles = makeStyles(() => ({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  note: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
}));
