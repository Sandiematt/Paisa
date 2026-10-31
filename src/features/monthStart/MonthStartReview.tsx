import React, {useEffect, useState} from 'react';
import {View} from 'react-native';

import {AppText, Card, GhostButton, PressableScale, PrimaryButton} from '../../components/ui';
import {BillInput, EditableBill} from '../../lib/bills';
import {CycleBill} from '../../lib/billMonths';
import {MonthState} from '../../lib/budgetEngine';
import {BudgetMonth} from '../../lib/budgetMonths';
import {MonthChoice} from '../../lib/supabase/database.types';
import {formatMoney} from '../../lib/formatMoney';
import {colors, makeStyles, radii, spacing} from '../../theme';
import {dayMonth, planProblem, shownLimit} from '../home/budgetCopy';
import {DetailsFrame} from '../home/DetailsParts';
import {asksExtraChoice} from './monthStart';
import {BillsSheet} from '../profile/BillsSheet';
import {MoneySheet} from '../profile/ProfileSheets';

type MonthStartReviewProps = {
  visible: boolean;
  /** The month that just ended. */
  month: BudgetMonth | null;
  currencySymbol: string;
  /** The new month's budget, as it stands with the current settings. */
  budget: MonthState | null;
  /** The new month's bills; carried ones are listed apart. */
  bills: CycleBill[];
  editableBills: EditableBill[];
  monthlyTotal: number;
  savingsGoal: number;
  plannedBills: number;
  income: number;
  /** Last month's extra recounted now (late-synced payments included). */
  recountExtra: () => number;
  onChoose: (choice: MonthChoice, extraSavings: number) => Promise<void>;
  onSaveTotal: (typed: string) => void;
  onSaveGoal: (typed: string) => void;
  onSaveBill: (bill: EditableBill | null, input: BillInput) => Promise<void>;
  onRemoveBill: (bill: EditableBill) => Promise<void>;
  onClose: () => void;
};

/** "October", or "25 Sep – 24 Oct" for a payday cycle. */
function monthName(month: BudgetMonth): string {
  const [year, m, day] = month.cycleStart.split('-').map(Number);
  return day === 1
    ? new Date(year, m - 1, 1).toLocaleDateString('en-IN', {month: 'long'})
    : `${dayMonth(month.cycleStart)} – ${dayMonth(month.cycleEnd)}`;
}

/**
 * The once-a-month review on the first open of a new budget month
 * (handbook 6.1): what to do with last month's extra savings, then a look at
 * the budget, bills and savings goal before the new month runs. Doing
 * nothing keeps the extra as savings and every setting as it was.
 */
export function MonthStartReview({
  visible,
  month,
  currencySymbol,
  budget,
  bills,
  editableBills,
  monthlyTotal,
  savingsGoal,
  plannedBills,
  income,
  recountExtra,
  onChoose,
  onSaveTotal,
  onSaveGoal,
  onSaveBill,
  onRemoveBill,
  onClose,
}: MonthStartReviewProps) {
  const styles = useStyles();
  const money = (amount: number) => formatMoney(amount, currencySymbol, {decimals: 0});
  const [step, setStep] = useState<1 | 2>(1);
  const [choice, setChoice] = useState<MonthChoice>('keep');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'total' | 'goal' | 'bills' | null>(null);
  const asking = asksExtraChoice(month);

  useEffect(() => {
    if (visible) {
      setStep(asksExtraChoice(month) ? 1 : 2);
      setChoice('keep');
      setError(null);
    }
  }, [month, visible]);

  if (!month) {
    return null;
  }

  const choose = async (picked: MonthChoice) => {
    setBusy(true);
    setError(null);
    try {
      await onChoose(picked, recountExtra());
      setStep(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // Leaving without choosing keeps the extra as savings (handbook 6).
  const dismiss = () => {
    if (step === 1 && asking) {
      onChoose('keep', recountExtra()).catch(() => {});
    }
    onClose();
  };

  const carried = bills.filter(bill => bill.carried && bill.status === 'notPaid');
  const ownBills = bills.filter(bill => !bill.carried && bill.dueThisCycle && bill.status !== 'skipped');
  const problem = planProblem(monthlyTotal || '', plannedBills, savingsGoal, currencySymbol);
  const partial = month.partialFrom ? `Partial month, tracked from ${dayMonth(month.partialFrom)}. ` : '';

  return (
    <DetailsFrame visible={visible} title="New month" onClose={dismiss}>
      {step === 1 ? (
        <Card testID="month-extra">
          <AppText variant="label" color={colors.lavender}>
            {`${monthName(month)} is done`}
          </AppText>
          <AppText variant="title" style={styles.title}>
            {`You saved ${money(month.extraSavings)} extra last month. What would you like to do?`}
          </AppText>
          <AppText variant="caption" color={colors.muted}>
            {`${partial}That is what was left of your spending money, on top of your ${money(
              month.savingsGoal,
            )} savings goal.`}
          </AppText>
          <View style={styles.choices} accessibilityRole="radiogroup">
            <Choice
              title="Keep as savings"
              detail="It stays saved. You can move some to a budget later."
              selected={choice === 'keep'}
              onPress={() => setChoice('keep')}
            />
            <Choice
              title="Add to this month's budget"
              detail={`${money(month.extraSavings)} more to spend this month; your daily limit goes up.`}
              selected={choice === 'budget'}
              onPress={() => setChoice('budget')}
            />
          </View>
          {error ? (
            <AppText variant="caption" color={colors.roseLight}>
              {error}
            </AppText>
          ) : null}
          <PrimaryButton
            label="Continue"
            loading={busy}
            disabled={busy}
            style={styles.action}
            onPress={() => choose(choice)}
          />
        </Card>
      ) : (
        <>
          {month.overspentBy > 0 ? (
            <Card style={styles.gap} testID="month-overspent">
              <AppText variant="bodyStrong">{`${monthName(month)} went over by ${money(month.overspentBy)}`}</AppText>
              <AppText variant="caption" color={colors.muted}>
                That stays with last month. Nothing was taken from your savings, and this month
                starts fresh.
              </AppText>
            </Card>
          ) : month.choice === 'budget' && month.toBudget > 0 ? (
            <Card style={styles.gap}>
              <AppText variant="bodyStrong">{`${money(month.toBudget)} from ${monthName(month)} added`}</AppText>
              <AppText variant="caption" color={colors.muted}>
                It is in this month's spending money below.
              </AppText>
            </Card>
          ) : null}

          {carried.length > 0 ? (
            <Card style={styles.gap} testID="month-carried">
              <AppText variant="bodyStrong">Not paid last month</AppText>
              <AppText variant="caption" color={colors.muted} style={styles.note}>
                Still set aside this month, with the money last month held back for them. Mark them
                paid in Budget when you pay.
              </AppText>
              {carried.map(bill => (
                <View key={bill.key} style={styles.row}>
                  <AppText variant="body">{bill.label}</AppText>
                  <AppText variant="bodyStrong">{money(bill.planned)}</AppText>
                </View>
              ))}
            </Card>
          ) : null}

          <Card style={styles.gap} testID="month-plan">
            <AppText variant="heading" accessibilityRole="header">
              This month's plan
            </AppText>
            <AppText variant="caption" color={colors.muted} style={styles.note}>
              Carried over from last month. Change anything for this month, or leave it as it is.
            </AppText>
            <PlanRow
              label="Monthly budget"
              value={monthlyTotal > 0 ? money(monthlyTotal) : 'Not set'}
              onEdit={() => setSheet('total')}
            />
            <PlanRow
              label="Monthly bills"
              value={money(plannedBills)}
              detail={
                ownBills.length > 0
                  ? ownBills.map(bill => `${bill.label} ${money(bill.planned)}`).join(' · ')
                  : 'None'
              }
              onEdit={() => setSheet('bills')}
            />
            <PlanRow
              label="Savings goal"
              value={money(savingsGoal)}
              onEdit={() => setSheet('goal')}
            />
            {problem ? (
              <AppText variant="caption" color={colors.roseLight} style={styles.note}>
                {problem}
              </AppText>
            ) : budget ? (
              <AppText variant="body" color={colors.muted} style={styles.note} testID="month-limit">
                {budget.zeroSpendable
                  ? 'Bills and your savings goal take the whole budget, so the daily limit is 0 this month.'
                  : `${money(budget.spendable)} to spend this month · ${money(
                      shownLimit(budget.dailyLimit),
                    )} today for the ${budget.remainingDays} days left.`}
              </AppText>
            ) : null}
            <PrimaryButton
              label="Looks good, continue"
              disabled={problem !== null}
              style={styles.action}
              onPress={onClose}
            />
          </Card>
        </>
      )}

      <MoneySheet
        visible={sheet === 'total'}
        title="Monthly budget"
        label="Monthly budget"
        symbol={currencySymbol}
        value={monthlyTotal > 0 ? String(monthlyTotal) : ''}
        lead="Everything you have for this month, bills and your savings goal included."
        suggestion={
          income > 0 ? {label: `Use your income ${money(income)}`, value: String(income)} : undefined
        }
        validate={value => planProblem(value, plannedBills, savingsGoal, currencySymbol)}
        onDone={onSaveTotal}
        onClose={() => setSheet(null)}
      />
      <MoneySheet
        visible={sheet === 'goal'}
        title="Savings goal"
        label="Monthly savings goal"
        symbol={currencySymbol}
        value={savingsGoal > 0 ? String(savingsGoal) : ''}
        lead="Set aside on the first day of the month, before the daily limit."
        validate={value =>
          monthlyTotal > 0 ? planProblem(monthlyTotal, plannedBills, Number(value) || 0, currencySymbol) : null
        }
        onDone={onSaveGoal}
        onClose={() => setSheet(null)}
      />
      <BillsSheet
        visible={sheet === 'bills'}
        bills={editableBills}
        symbol={currencySymbol}
        onSave={onSaveBill}
        onRemove={onRemoveBill}
        onClose={() => setSheet(null)}
      />
    </DetailsFrame>
  );
}

function Choice({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{checked: selected}}
      accessibilityLabel={`${title}. ${detail}`}
      style={[styles.choice, selected && styles.choiceSelected]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.choiceText}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" color={colors.muted}>
          {detail}
        </AppText>
      </View>
    </PressableScale>
  );
}

function PlanRow({
  label,
  value,
  detail,
  onEdit,
}: {
  label: string;
  value: string;
  detail?: string;
  onEdit: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.planRow}>
      <View style={styles.planText}>
        <AppText variant="bodyStrong">{label}</AppText>
        {detail ? (
          <AppText variant="caption" color={colors.muted} numberOfLines={2}>
            {detail}
          </AppText>
        ) : null}
      </View>
      <AppText variant="bodyStrong">{value}</AppText>
      <GhostButton label="Edit" tone="ink" onPress={onEdit} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  gap: {
    marginTop: spacing.lg,
  },
  title: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  note: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  action: {
    marginTop: spacing.lg,
  },
  choices: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.tile,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  choiceSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  choiceText: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  planText: {
    flex: 1,
  },
}));
