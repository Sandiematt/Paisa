import React, {useMemo} from 'react';
import {View} from 'react-native';

import {AppText, Stagger, TextField, TogglePill} from '../../../components/ui';
import {cycleFor} from '../../../lib/budgetCycle';
import {
  automaticMonthlyBudget,
  dayToDayBudget,
  isAutomaticBudget,
  monthlyBudgetOf,
  withDayToDayBudget,
} from '../../../lib/budgetPlan';
import {colors, makeStyles, radii, spacing} from '../../../theme';
import {STEP_TITLES, currencyByCode} from '../constants';
import {StepLayout} from '../components/StepLayout';
import {OnboardingDraft} from '../types';

type BudgetStepProps = {
  draft: OnboardingDraft;
  onChange: <K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => void;
};

/** Without an income there is nothing to calculate from; these are starting points. */
const FLAT_SUGGESTIONS = [5000, 10000, 20000];
const SAVINGS_FRACTIONS = [0.1, 0.2, 0.3];

export function BudgetStep({draft, onChange}: BudgetStepProps) {
  const styles = useStyles();
  const copy = STEP_TITLES.budget;
  const currency = currencyByCode(draft.currency);
  const income = Number(draft.monthlyIncome) || 0;
  const money = (amount: number) => `${currency.symbol}${amount.toLocaleString('en-IN')}`;

  const savingsSuggestions = useMemo(() => {
    if (income > 500) {
      const calculated = SAVINGS_FRACTIONS.map(fraction =>
        Math.round((income * fraction) / 500) * 500,
      );
      return Array.from(new Set(calculated)).filter(amt => amt > 0);
    }
    return [2000, 5000, 10000];
  }, [income]);

  const savingsGoal = Number(draft.monthlySavingsGoal) || 0;
  const committed = (draft.bills ?? []).reduce(
    (sum, bill) => sum + (Number(bill.amount) || 0),
    0,
  );
  const automatic = isAutomaticBudget(draft);
  // The field shows the day-to-day budget: what is left once bills are paid.
  const budget = monthlyBudgetOf(draft);
  const dayToDay = dayToDayBudget(budget, committed);
  const calculated = dayToDayBudget(automaticMonthlyBudget(draft), committed);
  const fieldValue = automatic || draft.monthlyBudget !== '' ? String(dayToDay) : '';
  const cycleDays = cycleFor(new Date(), draft.payday).length;
  const perDay = Math.round(dayToDay / cycleDays);
  const leftForSavings = income > 0 ? income - budget : 0;

  const setBudget = (typed: string) => {
    const next = withDayToDayBudget(draft, typed, committed);
    onChange('budgetCustom', next.budgetCustom);
    onChange('monthlyBudget', next.monthlyBudget);
  };

  const helper = automatic
    ? calculated > 0
      ? 'Calculated automatically from your income, bills and savings goal. Change it if it looks wrong.'
      : `Bills and savings take all of your ${money(income)} income. Lower the savings goal, or set a budget yourself.`
    : income > 0
      ? `You set this yourself. The calculated budget is ${money(calculated)}.`
      : 'What you can spend each month after bills. Add your income to have it calculated.';

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <TextField
          label="Monthly savings goal"
          placeholder="0"
          prefix={currency.symbol}
          value={draft.monthlySavingsGoal}
          onChangeText={value =>
            onChange('monthlySavingsGoal', value.replace(/[^0-9]/g, ''))
          }
          keyboardType="number-pad"
          returnKeyType="done"
          helper="Set aside from your income first. Income above your plan is saved too."
        />
      </Stagger>

      <Stagger index={2} style={styles.spaced}>
        <View style={styles.pills}>
          {savingsSuggestions.map((amount, index) => (
            <TogglePill
              key={`save-${amount}-${index}`}
              label={money(amount)}
              selected={draft.monthlySavingsGoal === String(amount)}
              onPress={() => onChange('monthlySavingsGoal', String(amount))}
            />
          ))}
        </View>
      </Stagger>

      <Stagger index={3} style={styles.spaced}>
        <TextField
          label="Monthly budget"
          placeholder="0"
          prefix={currency.symbol}
          value={fieldValue}
          onChangeText={value => setBudget(value.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          returnKeyType="done"
          helper={helper}
        />
      </Stagger>

      {income > 0 && !automatic ? (
        <Stagger index={4} style={styles.spaced}>
          <View style={styles.pills}>
            <TogglePill
              label={`Use calculated ${money(calculated)}`}
              selected={false}
              onPress={() => setBudget(String(calculated))}
            />
          </View>
        </Stagger>
      ) : income <= 0 ? (
        <Stagger index={4} style={styles.spaced}>
          <View style={styles.pills}>
            {FLAT_SUGGESTIONS.map((amount, index) => (
              <TogglePill
                key={`suggestion-${amount}-${index}`}
                label={money(amount)}
                selected={fieldValue === String(amount)}
                onPress={() => setBudget(String(amount))}
              />
            ))}
          </View>
        </Stagger>
      ) : null}

      {dayToDay > 0 ? (
        <Stagger index={5} style={styles.spaced}>
          <View style={styles.readout}>
            {income > 0 ? (
              <View style={styles.committed} testID="budget-breakdown">
                <BreakdownRow label="Income" value={money(income)} />
                {committed > 0 ? (
                  <BreakdownRow label="Monthly bills" value={`−${money(committed)}`} negative />
                ) : null}
                <BreakdownRow
                  label={automatic ? 'Savings goal' : 'Left for savings'}
                  value={`−${money(Math.max(0, automatic ? savingsGoal : leftForSavings))}`}
                  negative
                />
                <View style={[styles.committedRow, styles.committedTotal]}>
                  <AppText variant="body" color={colors.muted}>
                    Monthly budget
                  </AppText>
                  <AppText variant="bodyStrong">{money(dayToDay)}</AppText>
                </View>
              </View>
            ) : null}
            <AppText variant="caption" color={colors.muted}>
              That works out to
            </AppText>
            <AppText variant="numericHero" style={styles.readoutValue}>
              {money(perDay)}
            </AppText>
            <AppText variant="body" color={colors.muted}>
              {`a day across ${cycleDays} days${draft.payday ? ', payday to payday' : ''}.`}
            </AppText>
            {!automatic && income > 0 && leftForSavings < savingsGoal ? (
              <AppText variant="body" color={colors.roseLight} style={styles.leftover}>
                {`This budget leaves ${money(Math.max(0, leftForSavings))} for savings, below the ${money(savingsGoal)} goal.`}
              </AppText>
            ) : null}
          </View>
        </Stagger>
      ) : null}
    </StepLayout>
  );
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
