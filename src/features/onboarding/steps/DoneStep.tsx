import React from 'react';
import {View} from 'react-native';
import {CalendarCheck} from 'phosphor-react-native/src/icons/CalendarCheck';
import {CheckCircle} from 'phosphor-react-native/src/icons/CheckCircle';
import {Fingerprint} from 'phosphor-react-native/src/icons/Fingerprint';
import {Receipt} from 'phosphor-react-native/src/icons/Receipt';
import {Target} from 'phosphor-react-native/src/icons/Target';
import {Wallet} from 'phosphor-react-native/src/icons/Wallet';

import {
  AppText,
  CelebrationBadge,
  GradientIconSquare,
  Stagger,
} from '../../../components/ui';
import {
  cycleLength,
  cycleRangeFor,
  nextCycleStart,
  remainingDays,
  validatePlan,
} from '../../../lib/budgetEngine';
import {flowForToday} from '../../../lib/budgetFlow';
import {isAutomaticBudget, monthlyTotalOf} from '../../../lib/budgetPlan';
import {localDateISO} from '../../../lib/transactionsStore';
import {dayMonth} from '../../home/budgetCopy';
import {KnownBill, planBillsTotal} from './BudgetStep';
import {GradientKey, colors, makeStyles, radii, spacing} from '../../../theme';
import {STEP_TITLES, currencyByCode, dayLabel} from '../constants';
import {StepLayout} from '../components/StepLayout';
import {OnboardingDraft} from '../types';

type DoneStepProps = {
  draft: OnboardingDraft;
  today?: string;
  knownBills?: KnownBill[];
};

type SummaryRow = {
  key: string;
  Icon: typeof Wallet;
  gradient: GradientKey;
  title: string;
  detail: string;
  set: boolean;
};

function money(symbol: string, amount: number): string {
  return `${symbol}${Math.round(amount).toLocaleString('en-IN')}`;
}

/** When the budget starts and what a day gets, from the date check. */
export function budgetSummary(
  draft: OnboardingDraft,
  today: string,
  knownBills: KnownBill[] = [],
): {detail: string; set: boolean} {
  const {symbol} = currencyByCode(draft.currency);
  const total = monthlyTotalOf(draft);
  if (total <= 0) {
    return {detail: 'Not set', set: false};
  }
  const check = validatePlan(
    total,
    planBillsTotal(draft, knownBills),
    Number(draft.monthlySavingsGoal) || 0,
  );
  if (check.status === 'over') {
    return {detail: 'Bills and savings are more than the budget', set: false};
  }
  const flow = flowForToday(today, draft.payday, draft.startNow === true);
  const cycle = cycleRangeFor(today, draft.payday);
  if (flow === 'startNextMonth') {
    const starts = nextCycleStart(today, draft.payday);
    const days = cycleLength(cycleRangeFor(starts, draft.payday));
    return {
      detail: `Starts ${dayMonth(starts)} · ${money(symbol, check.spendable)} to spend, about ${money(
        symbol,
        Math.floor(check.spendable / days),
      )} a day`,
      set: true,
    };
  }
  const spent = flow === 'midMonth' ? Number(draft.alreadySpent) || 0 : 0;
  const days = remainingDays(today, cycle);
  const perDay = Math.floor(Math.max(0, check.spendable - spent) / days);
  return {
    detail: `${money(symbol, check.spendable)} to spend${isAutomaticBudget(draft) ? ', from your income' : ''} · about ${money(
      symbol,
      perDay,
    )} a day${flow === 'midMonth' ? ` for the ${days} days left` : ''}`,
    set: true,
  };
}

function summarize(draft: OnboardingDraft, today: string, knownBills: KnownBill[]): SummaryRow[] {
  const {symbol} = currencyByCode(draft.currency);
  const balance = Number(draft.startingBalance) || 0;
  const income = Number(draft.monthlyIncome) || 0;
  const bills = (draft.bills ?? []).filter(bill => Number(bill.amount) > 0);
  const billTotal = bills.reduce((sum, bill) => sum + Number(bill.amount), 0);
  const budget = budgetSummary(draft, today, knownBills);
  const payday = draft.payday ?? null;
  const logsSalary = payday !== null && (draft.logSalary ?? true) && income > 0;

  return [
    {
      key: 'wallet',
      Icon: Wallet,
      gradient: 'primary',
      title: 'Tracked balance',
      detail: `Starting with ${money(symbol, balance)}`,
      set: true,
    },
    {
      key: 'payday',
      Icon: CalendarCheck,
      gradient: 'savings',
      title: 'Payday',
      detail:
        payday === null
          ? 'Not set'
          : logsSalary
            ? `${money(symbol, income)} added on the ${dayLabel(payday).toLowerCase()} each month`
            : `On the ${dayLabel(payday).toLowerCase()} each month`,
      set: payday !== null,
    },
    {
      key: 'bills',
      Icon: Receipt,
      gradient: 'rose',
      title: 'Monthly bills',
      detail:
        bills.length === 0
          ? 'None added'
          : `${bills.length} ${bills.length === 1 ? 'bill' : 'bills'} · ${money(symbol, billTotal)} a month`,
      set: bills.length > 0,
    },
    {
      key: 'budget',
      Icon: Target,
      gradient: 'budgetStrip',
      title: 'Budget',
      detail: budget.detail,
      set: budget.set,
    },
    {
      key: 'lock',
      Icon: Fingerprint,
      gradient: 'fab',
      title: 'App lock',
      detail:
        draft.appLock === 'pin'
          ? '4-digit PIN needed to open'
          : draft.appLock === 'biometric'
            ? 'Fingerprint needed to open'
            : 'Off',
      set: Boolean(draft.appLock),
    },
  ];
}

export function DoneStep({draft, today = localDateISO(), knownBills = []}: DoneStepProps) {
  const styles = useStyles();
  const copy = STEP_TITLES.done;
  const firstName = draft.name.trim().split(/\s+/)[0];
  const rows = summarize(draft, today, knownBills);

  return (
    <StepLayout
      title={firstName ? `${copy.title}, ${firstName}` : copy.title}
      subtitle={copy.subtitle}>
      <Stagger index={1} style={styles.badge}>
        <CelebrationBadge />
      </Stagger>

      <Stagger index={2}>
        <View style={styles.card}>
          {rows.map((row, index) => (
            <View
              key={row.key}
              style={[styles.row, index < rows.length - 1 && styles.divider]}>
              <GradientIconSquare size={40} gradient={row.gradient}>
                <row.Icon size={20} color={colors.onAccent} weight="fill" />
              </GradientIconSquare>
              <View style={styles.rowText}>
                <AppText variant="bodyStrong">{row.title}</AppText>
                <AppText variant="caption" color={colors.muted}>
                  {row.detail}
                </AppText>
              </View>
              {row.set ? (
                <CheckCircle size={22} color={colors.positive} weight="fill" />
              ) : (
                <View style={styles.unset} />
              )}
            </View>
          ))}
        </View>
      </Stagger>
    </StepLayout>
  );
}

const useStyles = makeStyles(() => ({
  badge: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  card: {
    paddingHorizontal: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  // Sized to sit where the check icon does on a finished row.
  unset: {
    width: 18,
    height: 18,
    marginHorizontal: 2,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.hairlineStrong,
  },
}));
