import React, {useMemo} from 'react';
import {View} from 'react-native';
import {CaretRight} from 'phosphor-react-native/src/icons/CaretRight';
import {Wallet} from 'phosphor-react-native/src/icons/Wallet';

import {AppText, Card, GhostButton, PressableScale, ProgressBar} from '../../components/ui';
import {CycleBill} from '../../lib/billMonths';
import {isCalendarCycle} from '../../lib/budgetCycle';
import {MonthState} from '../../lib/budgetEngine';
import {CategoryRow} from '../../lib/categoriesStore';
import {formatMoney} from '../../lib/formatMoney';
import {TransactionRow} from '../../lib/transactionsStore';
import {colors, makeStyles, radii, spacing} from '../../theme';
import {dayLabel} from '../onboarding/constants';
import {
  dayMonth,
  daysLeftLabel,
  partialLabel,
  planNotice,
  shownLimit,
} from './budgetCopy';
import {DetailsFrame, HeroCard, StatCard, StatRow, useDetailsStyles} from './DetailsParts';
import {relatedTransactions} from './homeInsights';
import {HomeRange, SpendSlice, rangeScopeLabel} from './homeReport';
import {RelatedTransactions} from './RelatedTransactions';

type BudgetDetailsScreenProps = {
  visible: boolean;
  onClose: () => void;
  currencySymbol: string;
  /** This cycle's rolling budget (src/lib/budgetEngine.ts); null when no budget is set. */
  budget: MonthState | null;
  /** This cycle's bills: due, paid, not paid yet, carried over. */
  bills?: CycleBill[];
  /** All spending in the range, bills included; the category split uses it. */
  spent: number;
  slices: SpendSlice[];
  range?: HomeRange;
  transactions?: TransactionRow[];
  categories?: CategoryRow[];
  /** Payday the budget month starts on; null keeps calendar months. */
  payday?: number | null;
  /** Opens what can be done with a bill (mark paid, not paid yet, ...). */
  onBillPress?: (bill: CycleBill) => void;
  /** Adds money to this month's budget (extra income). */
  onAddMoney?: () => void;
  onEditBudget?: () => void;
  /** Sheets opened from this screen, shown above it. */
  sheets?: React.ReactNode;
};

const EMPTY_ROWS: TransactionRow[] = [];
const EMPTY_CATEGORIES: CategoryRow[] = [];
const NO_BILLS: CycleBill[] = [];

/** How a bill stands this cycle, in a few words. */
export function billStatusLine(
  bill: CycleBill,
  money: (amount: number) => string,
): {text: string; tone: 'paid' | 'due' | 'warn' | 'muted'} {
  switch (bill.status) {
    case 'paid':
      return {
        text:
          bill.paid !== undefined && Math.abs(bill.paid - bill.planned) >= 0.01
            ? `Paid ${money(bill.paid)} (planned ${money(bill.planned)})`
            : 'Paid',
        tone: 'paid',
      };
    case 'paidOutside':
      return {text: 'Paid outside Paisa', tone: 'paid'};
    case 'skipped':
      return {text: 'Not owed this month', tone: 'muted'};
    case 'notPaid':
      return bill.carried
        ? {text: `Unpaid from ${dayMonth(bill.cycleStart)} · still set aside`, tone: 'warn'}
        : {text: 'Not paid yet · set aside', tone: 'warn'};
    default:
      return {
        text: bill.dueDate
          ? `Due ${dayMonth(bill.dueDate)} · added that day`
          : `Due on the ${dayLabel(bill.day).toLowerCase()}`,
        tone: 'due',
      };
  }
}

export function BudgetDetailsScreen({
  visible,
  onClose,
  currencySymbol,
  budget,
  bills = NO_BILLS,
  spent,
  slices,
  range = 'month',
  transactions = EMPTY_ROWS,
  categories = EMPTY_CATEGORIES,
  payday = null,
  onBillPress,
  onAddMoney,
  onEditBudget,
  sheets,
}: BudgetDetailsScreenProps) {
  const detailsStyles = useDetailsStyles();
  const planStyles = usePlanStyles();
  const money = (amount: number) => formatMoney(amount, currencySymbol, {decimals: 0});
  const related = useMemo(
    () => (visible ? relatedTransactions(transactions, range, 'expenses', 8) : EMPTY_ROWS),
    [range, transactions, visible],
  );
  const cycleNoun = isCalendarCycle(payday) ? 'month' : 'pay cycle';
  const dueBills = bills.filter(bill => bill.dueThisCycle);
  const billsTotal = budget ? budget.fixed : 0;
  const active = budget?.kind === 'active';
  const over = budget?.overspent ?? false;
  const progress =
    budget && budget.spendable > 0
      ? Math.max(0, Math.min(1, budget.spent / budget.spendable))
      : over
        ? 1
        : 0;
  const notice = budget ? planNotice(budget, money) : null;
  const partial = budget ? partialLabel(budget) : null;

  return (
    <DetailsFrame visible={visible} title="Budget" onClose={onClose}>
      {budget ? (
        <HeroCard
          label={
            budget.kind === 'waiting'
              ? 'Your budget starts soon'
              : over
                ? 'Overspent this month'
                : `Left to spend this ${cycleNoun}`
          }
          amount={
            budget.kind === 'waiting' && budget.startsOn
              ? dayMonth(budget.startsOn)
              : money(over ? budget.overspentBy : Math.max(0, budget.remaining))
          }
          amountColor={over ? colors.roseLight : colors.text}>
          <AppText variant="caption" color={colors.muted}>
            {`${money(Math.max(0, budget.spendable))} to spend this ${cycleNoun}, after bills and savings`}
          </AppText>
          {partial ? (
            <AppText variant="caption" color={colors.lavender}>
              {partial}
            </AppText>
          ) : null}
          {active ? (
            <View style={detailsStyles.meter}>
              <ProgressBar progress={progress} gradient={over ? 'rose' : 'primary'} height={10} />
              <View style={detailsStyles.meterFooter}>
                <AppText variant="caption" color={colors.muted}>
                  {`${money(budget.spent)} spent`}
                </AppText>
                <AppText variant="caption" color={over ? colors.roseLight : colors.muted}>
                  {over ? 'Over budget' : daysLeftLabel(budget.remainingDays)}
                </AppText>
              </View>
            </View>
          ) : null}
        </HeroCard>
      ) : (
        <HeroCard label="Monthly budget" amount="Not set">
          <AppText variant="caption" color={colors.muted}>
            Set a monthly budget and Paisa works out a daily limit from it.
          </AppText>
        </HeroCard>
      )}

      {notice || budget?.kind === 'waiting' ? (
        <Card style={detailsStyles.gap} testID="budget-notice">
          <AppText variant="body" color={budget?.kind === 'invalid' ? colors.roseLight : colors.muted}>
            {budget?.kind === 'waiting' && budget.startsOn
              ? `Your settings are saved. Tracking and daily limits begin on ${dayMonth(
                  budget.startsOn,
                )}; anything you log before then stays in your history.`
              : notice}
          </AppText>
          {budget?.kind === 'invalid' && onEditBudget ? (
            <GhostButton label="Fix budget" tone="ink" onPress={onEditBudget} />
          ) : null}
        </Card>
      ) : null}

      {budget && active ? (
        <>
          <StatRow>
            <StatCard label="Spent" value={money(budget.spent)} dotColor={colors.roseLight} />
            <StatCard
              label={over ? 'Overspent by' : 'Left this month'}
              value={money(over ? budget.overspentBy : budget.remaining)}
              dotColor={over ? colors.roseLight : colors.mint}
              valueColor={over ? colors.roseLight : colors.mint}
            />
          </StatRow>

          <Card style={detailsStyles.gap} testID="daily-plan">
            <AppText variant="heading" accessibilityRole="header">
              Today
            </AppText>

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
                {money(shownLimit(budget.dailyLimit))}
              </AppText>
              <View style={planStyles.row}>
                <AppText variant="label" color={colors.muted}>
                  {`Spent ${money(budget.spentToday)}`}
                </AppText>
                <AppText
                  variant="label"
                  color={budget.todayLeft < 0 ? colors.roseLight : colors.mint}>
                  {budget.todayLeft < 0
                    ? `${money(-budget.todayLeft)} over today's limit`
                    : `${money(budget.todayLeft)} left today`}
                </AppText>
              </View>
            </View>

            <View style={[planStyles.section, detailsStyles.divider]}>
              <View style={planStyles.row}>
                <AppText variant="bodyStrong">Spent this week</AppText>
                <AppText variant="bodyStrong" style={detailsStyles.tabular}>
                  {`${money(budget.week.spent)} of ${money(budget.week.total)}`}
                </AppText>
              </View>
              <View style={planStyles.bar}>
                <ProgressBar
                  progress={
                    budget.week.total > 0
                      ? Math.max(0, Math.min(1, budget.week.spent / budget.week.total))
                      : 0
                  }
                  gradient={budget.week.spent > budget.week.total ? 'rose' : 'primary'}
                  height={6}
                />
              </View>
            </View>

            <View style={[planStyles.section, planStyles.last, detailsStyles.divider]}>
              <AppText variant="caption" color={colors.muted}>
                Spend less today and tomorrow's limit goes up. Spend more and it goes down.
              </AppText>
            </View>
          </Card>
        </>
      ) : null}

      {dueBills.length > 0 ? (
        <Card style={detailsStyles.gap} testID="committed-bills">
          <View style={planStyles.row}>
            <AppText variant="heading" accessibilityRole="header">
              Monthly bills
            </AppText>
            <AppText variant="bodyStrong" style={detailsStyles.tabular}>
              {money(billsTotal)}
            </AppText>
          </View>
          <AppText variant="caption" color={colors.muted} style={planStyles.billsNote}>
            Kept aside before your daily limit. Tap a bill to mark it paid.
          </AppText>
          {dueBills.map((bill, index) => {
            const status = billStatusLine(bill, money);
            const tone =
              status.tone === 'paid'
                ? colors.mint
                : status.tone === 'warn'
                  ? colors.gold
                  : colors.muted;
            return (
              <PressableScale
                key={bill.key}
                onPress={onBillPress ? () => onBillPress(bill) : undefined}
                disabled={!onBillPress}
                scaleTo={0.98}
                accessibilityRole="button"
                accessibilityLabel={`${bill.label}, ${money(bill.paid ?? bill.planned)}, ${status.text}`}
                style={[planStyles.billRow, index > 0 && detailsStyles.divider]}>
                <View style={detailsStyles.listRowFlex}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {bill.label}
                  </AppText>
                  <AppText variant="caption" color={tone}>
                    {status.text}
                  </AppText>
                </View>
                <AppText variant="bodyStrong" style={detailsStyles.tabular}>
                  {money(bill.status === 'skipped' ? 0 : (bill.paid ?? bill.planned))}
                </AppText>
                {onBillPress ? <CaretRight size={16} color={colors.muted} /> : null}
              </PressableScale>
            );
          })}
        </Card>
      ) : null}

      {budget && budget.kind !== 'waiting' && onAddMoney ? (
        <Card style={detailsStyles.gap}>
          <AppText variant="bodyStrong">Got extra money this month?</AppText>
          <AppText variant="caption" color={colors.muted} style={planStyles.billsNote}>
            Add it here and your daily limit goes up.
          </AppText>
          <GhostButton label="Add money" tone="ink" onPress={onAddMoney} />
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
      {sheets}
    </DetailsFrame>
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
  billsNote: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.tile,
  },
  last: {
    paddingBottom: 0,
  },
}));
