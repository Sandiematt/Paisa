import React from 'react';
import {View} from 'react-native';
import {CalendarCheck} from 'phosphor-react-native/src/icons/CalendarCheck';
import {PiggyBank} from 'phosphor-react-native/src/icons/PiggyBank';
import {Receipt} from 'phosphor-react-native/src/icons/Receipt';
import {Target} from 'phosphor-react-native/src/icons/Target';
import {TrendUp} from 'phosphor-react-native/src/icons/TrendUp';

import {AppText, GradientIconSquare, Stagger} from '../../../components/ui';
import {GradientKey, colors, makeStyles, radii, spacing} from '../../../theme';
import {STEP_TITLES} from '../constants';
import {StepLayout} from '../components/StepLayout';

type Feature = {
  key: string;
  Icon: typeof Receipt;
  gradient: GradientKey;
  title: string;
  detail: string;
};

/** How the budget works, in the order the handbook explains it (D1-D8). */
export const BUDGET_FEATURES: Feature[] = [
  {
    key: 'limit',
    Icon: Target,
    gradient: 'primary',
    title: 'One daily limit',
    detail:
      'What is left to spend this month, divided by the days left. It is worked out fresh every day.',
  },
  {
    key: 'rollover',
    Icon: TrendUp,
    gradient: 'budgetStrip',
    title: 'Unspent money rolls over',
    detail:
      'Spend less today and the days after get more; spend more and they get a little less. Weeks are just a guide.',
  },
  {
    key: 'bills',
    Icon: Receipt,
    gradient: 'rose',
    title: 'Bills come off first',
    detail:
      'Rent, recharges, a mess: your monthly bills are set aside before the daily limit and never eat into it.',
  },
  {
    key: 'savings',
    Icon: PiggyBank,
    gradient: 'savings',
    title: 'Savings goal and extra savings',
    detail:
      'Your goal is set aside from day one. Whatever you do not spend by month end is extra savings, shown on its own.',
  },
  {
    key: 'review',
    Icon: CalendarCheck,
    gradient: 'fab',
    title: 'A quick look each new month',
    detail:
      'On the first open of a month you choose: keep last month\'s extra as savings, or add it to the new budget. Then check your budget and bills.',
  },
];

/**
 * First screen of the catch-up flow for accounts made before the rolling
 * budget (handbook 5.1), or of the setup again after a long absence.
 */
export function WhatsNewStep({restart = false}: {restart?: boolean}) {
  const styles = useStyles();
  const copy = restart
    ? {
        title: 'Welcome back',
        subtitle:
          'It has been a while, so let us start this month fresh. Your history and savings are kept; check your budget and Paisa picks up from today.',
      }
    : STEP_TITLES.whatsnew;
  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <View style={styles.card}>
          {BUDGET_FEATURES.map((feature, index) => (
            <View
              key={feature.key}
              style={[styles.row, index < BUDGET_FEATURES.length - 1 && styles.divider]}>
              <GradientIconSquare size={44} gradient={feature.gradient}>
                <feature.Icon size={22} color={colors.onAccent} weight="fill" />
              </GradientIconSquare>
              <View style={styles.text}>
                <AppText variant="bodyStrong">{feature.title}</AppText>
                <AppText variant="caption" color={colors.muted}>
                  {feature.detail}
                </AppText>
              </View>
            </View>
          ))}
        </View>
        <AppText variant="caption" color={colors.muted} style={styles.note}>
          Paisa only tracks your money. It stays in your bank.
        </AppText>
      </Stagger>
    </StepLayout>
  );
}

const useStyles = makeStyles(() => ({
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
  text: {
    flex: 1,
    gap: 2,
  },
  note: {
    marginTop: spacing.lg,
    marginLeft: spacing.xs,
  },
}));
