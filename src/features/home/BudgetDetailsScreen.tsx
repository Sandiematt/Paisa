import React, {useMemo} from 'react';
import {View} from 'react-native';
import {Wallet} from 'phosphor-react-native';

import {AppText, Card, ProgressBar} from '../../components/ui';
import {isCalendarCycle} from '../../lib/budgetCycle';
import {CategoryRow} from '../../lib/categoriesStore';
import {formatMoney} from '../../lib/formatMoney';
import {BillCommitment} from '../../lib/recurring';
import {TransactionRow} from '../../lib/transactionsStore';
import {colors, makeStyles, radii, spacing} from '../../theme';
import {daysLabel, weekProgress} from '../autotrack/autoTrackFormat';
import {
  budgetAllocation,
  buildBudgetSnapshot,
  dailyAllowance,
} from '../autotrack/dailyAllowance';
import {dayLabel} from '../onboarding/constants';
import {DetailsFrame, HeroCard, StatCard, StatRow, useDetailsStyles} from './DetailsParts';
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
  /** Payday the budget month starts on; null keeps calendar months. */
  payday?: number | null;
  /** This budget month's monthly bills, paid and still to come. */
  bills?: BillCommitment[];
  /** What the bills due this budget month add up to; set aside before the daily plan. */
  committed?: number;
  /** Spend not in `transactions` yet (UPI payments detected but not synced), by local date. */
  extraSpendByDate?: Record<string, number>;
  /** Overrides "now" for the daily plan; tests only. */
  today?: Date;
};

const EMPTY_ROWS: TransactionRow[] = [];
const EMPTY_CATEGORIES: CategoryRow[] = [];
const NO_BILLS: BillCommitment[] = [];
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
  payday = null,
  bills = NO_BILLS,
  committed = 0,
  extraSpendByDate = NO_EXTRA_SPEND,
  today,
}: BudgetDetailsScreenProps) {
  const detailsStyles = useDetailsStyles();
  const planStyles = usePlanStyles();
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
    const snapshot = buildBudgetSnapshot(
      transactions,
      {monthlyBudget, payday, committed},
      now,
    );
    const allowance = dailyAllowance(snapshot, now, extraSpendByDate);
    // The daily plan splits what the bills leave of the budget.
    return allowance
      ? {
          ...allowance,
          ...budgetAllocation(snapshot.monthlyBudget, now, payday),
          dayToDay: snapshot.monthlyBudget,
        }
      : null;
  }, [committed, extraSpendByDate, monthlyBudget, payday, today, transactions, visible]);
  const dueBills = bills.filter(bill => bill.dueThisCycle);
  const cycleNoun = isCalendarCycle(payday) ? 'month' : 'pay cycle';

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

      {dueBills.length > 0 ? (
        <Card style={detailsStyles.gap} testID="committed-bills">
          <View style={planStyles.row}>
            <AppText variant="heading" accessibilityRole="header">
              Monthly bills
            </AppText>
            <AppText variant="bodyStrong" style={detailsStyles.tabular}>
              {money(committed)}
            </AppText>
          </View>
          <AppText variant="caption" color={colors.muted} style={planStyles.billsNote}>
            {`Set aside from this ${cycleNoun}'s budget before the daily plan.`}
          </AppText>
          {dueBills.map((bill, index) => (
            <View
              key={bill.key}
              style={[planStyles.billRow, index > 0 && detailsStyles.divider]}>
              <View style={detailsStyles.listRowFlex}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {bill.label}
                </AppText>
                <AppText
                  variant="caption"
                  color={bill.paidThisCycle ? colors.mint : colors.muted}>
                  {bill.paidThisCycle
                    ? 'Paid this cycle'
                    : `Due on the ${dayLabel(bill.day).toLowerCase()}`}
                </AppText>
              </View>
              <AppText variant="bodyStrong" style={detailsStyles.tabular}>
                {money(bill.amount)}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}

      {plan ? (
        <Card style={detailsStyles.gap} testID="daily-plan">
          <AppText variant="heading" accessibilityRole="header">
            Daily plan
          </AppText>

          {/* Today */}
          <View style={planStyles.section}>
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
            <View style={planStyles.row}>
              <AppText variant="label" color={colors.muted}>
                {`Spent ${money(plan.spentToday)}`}
              </AppText>
              <AppText
                variant="label"
                color={plan.remainingToday < 0 ? colors.roseLight : colors.mint}>
                {plan.remainingToday < 0
                  ? `${money(-plan.remainingToday)} over today`
                  : `${money(plan.remainingToday)} left today`}
              </AppText>
            </View>
          </View>

          {/* This week */}
          <View style={[planStyles.section, detailsStyles.divider]}>
            <View style={planStyles.row}>
              <AppText variant="bodyStrong">This week</AppText>
              <AppText
                variant="bodyStrong"
                color={plan.remainingWeek < 0 ? colors.roseLight : colors.text}
                style={detailsStyles.tabular}>
                {`${money(Math.abs(plan.remainingWeek))} ${
                  plan.remainingWeek < 0 ? 'over' : 'left'
                }`}
              </AppText>
            </View>
            <View style={planStyles.bar}>
              <ProgressBar
                progress={weekProgress(plan)}
                gradient={plan.remainingWeek < 0 ? 'rose' : 'primary'}
                height={6}
              />
            </View>
            <AppText variant="caption" color={colors.muted}>
              {`${money(plan.weekBudget)} for this week · ${daysLabel(
                plan.daysLeftInWeek,
                'to go',
              )}`}
            </AppText>
          </View>

          {/* How the month splits */}
          <View style={[planStyles.section, planStyles.last, detailsStyles.divider]}>
            <View style={planStyles.split}>
              <SplitStat
                value={money(plan.dayToDay)}
                label={committed > 0 ? 'after bills' : `a ${cycleNoun === 'month' ? 'month' : 'cycle'}`}
              />
              <SplitStat value={money(plan.weeklyBudget)} label="a week" />
              <SplitStat value={money(plan.dailyBudget)} label="a day" />
            </View>
            <AppText variant="caption" color={colors.muted} style={planStyles.splitNote}>
              {`${
                committed > 0
                  ? `${money(monthlyBudget)} budget minus ${money(committed)} of bills, split`
                  : 'Split'
              } over the ${Number(plan.weeksInMonth.toFixed(2))} weeks of this ${cycleNoun}. Overspending lowers the coming days; unspent money isn't added to them.`}
            </AppText>
          </View>
        </Card>
      ) : null}

      {/* The report pads "no spending" with a placeholder slice; show the empty state instead. */}
      {slices.some(slice => slice.id !== 'empty') ? (
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

function SplitStat({value, label}: {value: string; label: string}) {
  const detailsStyles = useDetailsStyles();
  const planStyles = usePlanStyles();
  return (
    <View style={planStyles.splitItem}>
      <AppText variant="bodyStrong" numberOfLines={1} style={detailsStyles.tabular}>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.muted}>
        {label}
      </AppText>
    </View>
  );
}

const usePlanStyles = makeStyles(() => ({
  section: {
    paddingVertical: spacing.lg,
  },
  limit: {
    fontSize: 32,
    lineHeight: 38,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bar: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  split: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  splitItem: {
    flex: 1,
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.tile,
    backgroundColor: colors.ground,
  },
  splitNote: {
    marginTop: spacing.md,
  },
  billsNote: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  last: {
    paddingBottom: 0,
  },
}));
