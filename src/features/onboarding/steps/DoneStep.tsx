import React from 'react';
import {View} from 'react-native';
import {
  CalendarCheck,
  CheckCircle,
  Fingerprint,
  Receipt,
  Target,
  Wallet,
} from 'phosphor-react-native';

import {
  AppText,
  CelebrationBadge,
  GradientIconSquare,
  Stagger,
} from '../../../components/ui';
import {cycleFor} from '../../../lib/budgetCycle';
import {dayToDayBudget, isAutomaticBudget, monthlyBudgetOf} from '../../../lib/budgetPlan';
import {GradientKey, colors, makeStyles, radii, spacing} from '../../../theme';
import {STEP_TITLES, currencyByCode, dayLabel} from '../constants';
import {StepLayout} from '../components/StepLayout';
import {OnboardingDraft} from '../types';

type DoneStepProps = {
  draft: OnboardingDraft;
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

function summarize(draft: OnboardingDraft): SummaryRow[] {
  const {symbol} = currencyByCode(draft.currency);
  const balance = Number(draft.startingBalance) || 0;
  const income = Number(draft.monthlyIncome) || 0;
  const budget = monthlyBudgetOf(draft);
  const bills = (draft.bills ?? []).filter(bill => Number(bill.amount) > 0);
  const billTotal = bills.reduce((sum, bill) => sum + Number(bill.amount), 0);
  const dayToDay = dayToDayBudget(budget, billTotal);
  const payday = draft.payday ?? null;
  const logsSalary = payday !== null && (draft.logSalary ?? true) && income > 0;

  return [
    {
      key: 'wallet',
      Icon: Wallet,
      gradient: 'primary',
      title: 'Wallet',
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
      detail:
        dayToDay > 0
          ? `${money(symbol, dayToDay)} a month${
              isAutomaticBudget(draft) ? ', calculated' : ''
            } · about ${money(symbol, dayToDay / cycleFor(new Date(), payday).length)} a day`
          : 'Not set',
      set: dayToDay > 0,
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

export function DoneStep({draft}: DoneStepProps) {
  const styles = useStyles();
  const copy = STEP_TITLES.done;
  const firstName = draft.name.trim().split(/\s+/)[0];
  const rows = summarize(draft);

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
