import React from 'react';
import {View} from 'react-native';
import {ArrowRight} from 'phosphor-react-native/src/icons/ArrowRight';

import {AppText, Card, PressableScale, ProgressBar} from '../../components/ui';
import {formatMoney} from '../../lib/formatMoney';
import {DailyAllowance} from '../../lib/autotrack/types';
import {colors, makeStyles, spacing} from '../../theme';
import {daysLabel, monthProgress} from './autoTrackFormat';

type AllowanceCardProps = {
  allowance: DailyAllowance | null;
  currencySymbol: string;
  onOpenBudget: () => void;
};

/** Today's adaptive daily limit, what is spent, and the week's pace. */
export function AllowanceCard({
  allowance,
  currencySymbol,
  onOpenBudget,
}: AllowanceCardProps) {
  const styles = useStyles();
  const money = (amount: number) =>
    formatMoney(amount, currencySymbol, {decimals: 0});

  if (!allowance) {
    return (
      <Card style={styles.empty}>
        <AppText variant="heading">No daily limit yet</AppText>
        <AppText variant="label" color={colors.muted}>
          Set a monthly budget to get a daily limit
        </AppText>
        <PressableScale
          onPress={onOpenBudget}
          scaleTo={0.97}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Set a monthly budget"
          accessibilityHint="Opens the budget editor"
          style={styles.link}>
          <AppText variant="bodyStrong" color={colors.lavender}>
            Set budget
          </AppText>
          <ArrowRight size={16} color={colors.lavender} weight="bold" />
        </PressableScale>
      </Card>
    );
  }

  const over = allowance.remainingToday < 0;
  const monthOver = allowance.remainingMonth < 0;

  return (
    <Card>
      <AppText variant="label" color={colors.muted}>
        You can spend today
      </AppText>
      <AppText
        variant="numericHero"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={styles.hero}>
        {money(allowance.dailyLimit)}
      </AppText>

      <View style={styles.split}>
        <View style={styles.half}>
          <AppText variant="label" color={colors.muted}>
            Spent today
          </AppText>
          <AppText variant="numeric" numberOfLines={1}>
            {money(allowance.spentToday)}
          </AppText>
        </View>
        <View style={styles.half}>
          <AppText
            variant="label"
            color={over ? colors.roseLight : colors.muted}>
            {over ? 'Over by' : 'Left today'}
          </AppText>
          <AppText
            variant="numeric"
            color={over ? colors.roseLight : colors.mint}
            numberOfLines={1}>
            {money(Math.abs(allowance.remainingToday))}
          </AppText>
        </View>
      </View>

      <View style={styles.week}>
        <ProgressBar
          progress={monthProgress(allowance)}
          gradient={monthOver ? 'rose' : 'primary'}
          height={6}
        />
        <AppText
          variant="caption"
          color={monthOver ? colors.roseLight : colors.muted}>
          {monthOver
            ? `Overspent by ${money(-allowance.remainingMonth)} this month`
            : `${money(allowance.remainingMonth)} left this month · ${daysLabel(
                allowance.daysLeft,
                'left',
              )}`}
        </AppText>
      </View>
    </Card>
  );
}

const useStyles = makeStyles(() => ({
  empty: {
    gap: spacing.sm,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    minHeight: 32,
  },
  hero: {
    marginTop: 2,
  },
  split: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  half: {
    flex: 1,
    gap: 2,
  },
  week: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
}));
