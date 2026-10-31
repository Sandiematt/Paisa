import React, {useMemo} from 'react';
import {View} from 'react-native';

import {AppText, Stagger, TextField, TogglePill} from '../../../components/ui';
import {
  cycleLength,
  cycleRangeFor,
  nextCycleStart,
  remainingDays,
  validatePlan,
} from '../../../lib/budgetEngine';
import {flowForToday, offersStartChoice} from '../../../lib/budgetFlow';
import {
  isAutomaticBudget,
  monthlyTotalOf,
  withMonthlyTotal,
  withSavingsGoal,
} from '../../../lib/budgetPlan';
import {billPaidAnswerOf, billsStartingNextCycle} from '../../../lib/scheduledSetup';
import {localDateISO} from '../../../lib/transactionsStore';
import {colors, makeStyles, radii, spacing} from '../../../theme';
import {dayMonth} from '../../home/budgetCopy';
import {STEP_TITLES, currencyByCode} from '../constants';
import {BillsPaidQuestion} from '../components/BillsPaidQuestion';
import {StepLayout} from '../components/StepLayout';
import {OnboardingDraft} from '../types';

/** A bill the account already has (in the ledger or waiting), when catching up or restarting. */
export type KnownBill = {key: string; label: string; amount: number};

type BudgetStepProps = {
  draft: OnboardingDraft;
  errors: Partial<Record<keyof OnboardingDraft, string>>;
  onChange: <K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => void;
  /** Today, `YYYY-MM-DD`; the date check runs from it. Tests set it. */
  today?: string;
  /** Bills already set up; their amounts come off the budget like the ones picked here. */
  knownBills?: KnownBill[];
  /**
   * Accounts moving over count this month's logged spending already, so
   * they are not asked what they spent before.
   */
  asksAlreadySpent?: boolean;
};

/** Without an income there is nothing to calculate from; these are starting points. */
const FLAT_SUGGESTIONS = [10000, 20000, 30000];
const SAVINGS_FRACTIONS = [0.1, 0.2, 0.3];

/** Every bill the plan sets aside: the ones picked in onboarding and any already set up. */
export function planBillsTotal(draft: OnboardingDraft, knownBills: KnownBill[] = []): number {
  return (
    (draft.bills ?? []).reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0) +
    knownBills.reduce((sum, bill) => sum + Math.max(0, bill.amount), 0)
  );
}

export function BudgetStep({
  draft,
  errors,
  onChange,
  today = localDateISO(),
  knownBills = [],
  asksAlreadySpent = true,
}: BudgetStepProps) {
  const styles = useStyles();
  const copy = STEP_TITLES.budget;
  const currency = currencyByCode(draft.currency);
  const income = Number(draft.monthlyIncome) || 0;
  const money = (amount: number) => `${currency.symbol}${Math.round(amount).toLocaleString('en-IN')}`;

  const savingsSuggestions = useMemo(() => {
    if (income > 500) {
      const calculated = SAVINGS_FRACTIONS.map(fraction =>
        Math.round((income * fraction) / 500) * 500,
      );
      return Array.from(new Set(calculated)).filter(amt => amt > 0);
    }
    return [2000, 5000, 10000];
  }, [income]);

  const goal = Number(draft.monthlySavingsGoal) || 0;
  const bills = planBillsTotal(draft, knownBills);
  const total = monthlyTotalOf(draft);
  const automatic = isAutomaticBudget(draft);
  const check = validatePlan(total, bills, goal);
  const fieldValue = total > 0 || draft.monthlyBudget !== '' ? String(total) : '';

  // The date check (handbook 5.5): the 1st runs the whole month, mid-month
  // starts from today, the last days wait for the next month.
  const cycle = cycleRangeFor(today, draft.payday);
  // In the last days of the month the user picks: start now, or on the 1st.
  const choosing = offersStartChoice(today, draft.payday);
  const firstOfNext = nextCycleStart(today, draft.payday);
  const flow = flowForToday(today, draft.payday, draft.startNow === true);
  const startsOn = flow === 'startNextMonth' ? nextCycleStart(today, draft.payday) : today;
  const days =
    flow === 'startNextMonth'
      ? cycleLength(cycleRangeFor(startsOn, draft.payday))
      : remainingDays(today, cycle);
  const asking = asksAlreadySpent && flow === 'midMonth';
  const alreadySpent = asking ? Number(draft.alreadySpent) || 0 : 0;
  const enteringSpent = draft.alreadySpent !== undefined && asking;
  const perDay = days > 0 ? Math.floor(Math.max(0, check.spendable - alreadySpent) / days) : 0;

  // Bills whose due day this month already went by: paid, or not yet?
  const startingLater = flow === 'midMonth' ? billsStartingNextCycle(draft, dateOf(today)) : [];

  const setTotal = (typed: string) => {
    const next = withMonthlyTotal(draft, typed);
    onChange('budgetCustom', next.budgetCustom);
    onChange('monthlyBudget', next.monthlyBudget);
  };
  const setGoal = (typed: string) => {
    const next = withSavingsGoal(draft, typed);
    onChange('monthlySavingsGoal', typed);
    onChange('monthlyBudget', next.monthlyBudget);
  };

  const helper = automatic
    ? 'Your income, as the month\'s total. Change it if you plan to use less.'
    : 'Everything you have for the month, bills and savings included.';

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <View style={styles.banner} testID="date-check">
          <AppText variant="label" color={colors.lavender}>
            {flow === 'normal'
              ? 'A fresh month'
              : choosing
                ? 'The month is nearly over'
                : flow === 'midMonth'
                  ? 'Starting mid-month'
                  : 'Starting next month'}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {flow === 'normal'
              ? 'Your budget covers the whole month, starting today.'
              : flow === 'midMonth'
                ? `Paisa tracks from today, ${dayMonth(today)}. Earlier days this month are not counted; your limit covers the ${days} days left.`
                : `There are only a few days left this month, so your budget starts on ${dayMonth(
                    startsOn,
                  )}. Your settings are saved now.`}
          </AppText>
          {choosing ? (
            <View style={styles.pills} accessibilityRole="radiogroup" testID="start-choice">
              <TogglePill
                label={`Start on ${dayMonth(firstOfNext)}`}
                selected={draft.startNow !== true}
                onPress={() => onChange('startNow', undefined)}
              />
              <TogglePill
                label={`Start now · ${remainingDays(today, cycle)} days left`}
                selected={draft.startNow === true}
                onPress={() => onChange('startNow', true)}
              />
            </View>
          ) : null}
        </View>
      </Stagger>

      <Stagger index={2} style={styles.spaced}>
        <TextField
          label="Monthly budget"
          placeholder="0"
          prefix={currency.symbol}
          value={fieldValue}
          onChangeText={value => setTotal(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          returnKeyType="done"
          helper={helper}
          error={errors.monthlyBudget}
        />
        <View style={styles.pills}>
          {income > 0 && total !== income ? (
            <TogglePill
              label={`Use income ${money(income)}`}
              selected={false}
              onPress={() => setTotal(String(income))}
            />
          ) : income <= 0 ? (
            FLAT_SUGGESTIONS.map((amount, index) => (
              <TogglePill
                key={`suggestion-${amount}-${index}`}
                label={money(amount)}
                selected={fieldValue === String(amount)}
                onPress={() => setTotal(String(amount))}
              />
            ))
          ) : null}
        </View>
      </Stagger>

      <Stagger index={3} style={styles.spaced}>
        <TextField
          label="Monthly savings goal"
          placeholder="0"
          prefix={currency.symbol}
          value={draft.monthlySavingsGoal}
          onChangeText={value => setGoal(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          returnKeyType="done"
          helper="Optional. Set aside on the first day; spending never touches it."
        />
        <View style={styles.pills}>
          {savingsSuggestions.map((amount, index) => (
            <TogglePill
              key={`save-${amount}-${index}`}
              label={money(amount)}
              selected={draft.monthlySavingsGoal === String(amount)}
              onPress={() => setGoal(String(amount))}
            />
          ))}
        </View>
      </Stagger>

      {total > 0 ? (
        <Stagger index={4} style={styles.spaced}>
          <View style={styles.readout}>
            <View style={styles.committed} testID="budget-breakdown">
              <BreakdownRow label="Monthly budget" value={money(total)} />
              {bills > 0 ? (
                <BreakdownRow label="Monthly bills" value={`−${money(bills)}`} negative />
              ) : null}
              {goal > 0 ? (
                <BreakdownRow label="Savings goal" value={`−${money(goal)}`} negative />
              ) : null}
              <View style={[styles.committedRow, styles.committedTotal]}>
                <AppText variant="body" color={colors.muted}>
                  To spend
                </AppText>
                <AppText
                  variant="bodyStrong"
                  color={check.status === 'over' ? colors.roseLight : undefined}>
                  {check.status === 'over' ? `${money(check.shortBy)} short` : money(check.spendable)}
                </AppText>
              </View>
            </View>
            {check.status === 'over' ? (
              <AppText variant="body" color={colors.roseLight} testID="plan-over">
                {`Bills and your savings goal come to ${money(
                  bills + goal,
                )}, more than the budget. Raise the budget or lower them to continue.`}
              </AppText>
            ) : check.status === 'zero' ? (
              <AppText variant="body" color={colors.muted} testID="plan-zero">
                Bills and your savings goal take the whole budget, so the daily limit is 0. You can
                still log what you spend.
              </AppText>
            ) : (
              <>
                <AppText variant="caption" color={colors.muted}>
                  {flow === 'startNextMonth' ? `From ${dayMonth(startsOn)} that is` : 'That works out to'}
                </AppText>
                <AppText variant="numericHero" style={styles.readoutValue}>
                  {money(perDay)}
                </AppText>
                <AppText variant="body" color={colors.muted}>
                  {flow === 'midMonth'
                    ? `a day for the ${days} days left, today included.`
                    : `a day across ${days} days${draft.payday ? ', payday to payday' : ''}.`}
                </AppText>
                <AppText variant="caption" color={colors.muted} style={styles.leftover}>
                  One limit for the month: days you spend less raise the days after, and anything
                  left at the end is extra savings.
                </AppText>
              </>
            )}
          </View>
        </Stagger>
      ) : null}

      {asking && total > 0 && check.status !== 'over' ? (
        <Stagger index={5} style={styles.spaced}>
          <View style={styles.banner} testID="already-spent">
            <AppText variant="bodyStrong">Spent some of this month already?</AppText>
            <AppText variant="caption" color={colors.muted}>
              Paisa can't see what you spent before today. Add it so your daily limit is realistic,
              or start fresh.
            </AppText>
            <View style={styles.pills}>
              <TogglePill
                label="Start fresh from today"
                selected={!enteringSpent}
                onPress={() => onChange('alreadySpent', undefined)}
              />
              <TogglePill
                label="Add what I spent"
                selected={enteringSpent}
                onPress={() => onChange('alreadySpent', draft.alreadySpent ?? '')}
              />
            </View>
            {enteringSpent ? (
              <TextField
                label="Spent this month so far"
                placeholder="0"
                prefix={currency.symbol}
                value={draft.alreadySpent ?? ''}
                onChangeText={value => onChange('alreadySpent', value.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                returnKeyType="done"
                helper="Day-to-day spending only. Leave out rent and other bills; they are counted above."
              />
            ) : null}
          </View>
        </Stagger>
      ) : null}

      {startingLater.length > 0 && total > 0 ? (
        <Stagger index={6} style={styles.spaced}>
          <BillsPaidQuestion
            bills={startingLater.map(entry => ({
              key: entry.ref,
              label: entry.description,
              amount: entry.amount,
            }))}
            firstDate={startingLater[0].date}
            answers={Object.fromEntries(
              startingLater.map(entry => [
                entry.ref,
                draft.billsPaid?.[entry.ref] ?? billPaidAnswerOf(entry),
              ]),
            )}
            onAnswer={(ref, paid) => onChange('billsPaid', {...(draft.billsPaid ?? {}), [ref]: paid})}
            money={money}
            error={errors.billsPaid}
          />
        </Stagger>
      ) : null}
    </StepLayout>
  );
}

function dateOf(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function BreakdownRow({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.committedRow}>
      <AppText variant="body" color={colors.muted}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" color={negative ? colors.roseLight : undefined}>
        {value}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  spaced: {
    marginTop: spacing.xxl,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  banner: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  readout: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
  },
  readoutValue: {
    marginTop: spacing.xs,
    marginBottom: 2,
    fontSize: 36,
    lineHeight: 42,
  },
  leftover: {
    marginTop: spacing.md,
  },
  committed: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  committedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  committedTotal: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
}));
