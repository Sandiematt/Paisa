import React from 'react';
import {View} from 'react-native';
import {CalendarCheck, Fingerprint, Receipt} from 'phosphor-react-native';

import {AppText, GradientIconSquare, Stagger} from '../../../components/ui';
import {GradientKey, colors, makeStyles, radii, spacing} from '../../../theme';
import {STEP_TITLES} from '../constants';
import {StepLayout} from '../components/StepLayout';

const FEATURES: {
  key: string;
  Icon: typeof Receipt;
  gradient: GradientKey;
  title: string;
  detail: string;
}[] = [
  {
    key: 'payday',
    Icon: CalendarCheck,
    gradient: 'savings',
    title: 'Budget from payday',
    detail: 'Your month runs payday to payday, and your salary can be added for you.',
  },
  {
    key: 'bills',
    Icon: Receipt,
    gradient: 'rose',
    title: 'Monthly bills',
    detail: 'Rent, EMIs and recharges are added on their due date and set aside from the budget.',
  },
  {
    key: 'lock',
    Icon: Fingerprint,
    gradient: 'fab',
    title: 'App lock',
    detail: 'Lock Paisa with your fingerprint or a 4-digit PIN.',
  },
];

/** First screen of the catch-up flow for accounts made before these steps existed. */
export function WhatsNewStep() {
  const styles = useStyles();
  const copy = STEP_TITLES.whatsnew;
  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <View style={styles.card}>
          {FEATURES.map((feature, index) => (
            <View
              key={feature.key}
              style={[styles.row, index < FEATURES.length - 1 && styles.divider]}>
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
          Takes about a minute. Skip any step you don't need.
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
