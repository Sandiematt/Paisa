import React from 'react';
import {View} from 'react-native';

import {AppText, PressableScale} from '../../../components/ui';
import {colors, makeStyles, radii, spacing} from '../../../theme';

export type PaidQuestionBill = {
  /** The bill's ref (see scheduledSetup). */
  key: string;
  label: string;
  amount: number;
};

type BillsPaidQuestionProps = {
  /** Bills whose due day this month has already gone by. */
  bills: PaidQuestionBill[];
  /** When they are next due, `YYYY-MM-DD`. */
  firstDate: string;
  /** True paid, false not yet; a bill missing here is not answered. */
  answers: Record<string, boolean | undefined>;
  onAnswer: (key: string, paid: boolean) => void;
  money: (amount: number) => string;
  error?: string;
};

/**
 * Bills whose due day this month already went by before Paisa knew about
 * them. Paid or not, each is set aside from this month's budget (it is part
 * of the month); asking which are paid keeps an unpaid one reserved until it
 * is, so it is never counted as extra savings, and keeps a paid one from
 * being counted twice.
 */
export function BillsPaidQuestion({
  bills,
  firstDate,
  answers,
  onAnswer,
  money,
  error,
}: BillsPaidQuestionProps) {
  const styles = useStyles();
  const nextDue = new Date(`${firstDate}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
  return (
    <View style={[styles.question, error ? styles.questionError : null]} testID="bills-paid-question">
      <AppText variant="label" color={colors.lavender}>
        This month only
      </AppText>
      <AppText variant="heading" style={styles.title}>
        {bills.length > 1
          ? 'Which of these have you paid this month?'
          : `Have you paid this month's ${bills[0]?.label ?? 'bill'}?`}
      </AppText>
      <AppText variant="caption" color={colors.muted}>
        {`Their due day has passed; next they are added on ${nextDue}. Paid or not, they are set aside from this month's budget. One not paid yet stays set aside until you pay it.`}
      </AppText>
      {bills.map(bill => (
        <View key={bill.key} style={styles.bill}>
          <View style={styles.billText}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {bill.label}
            </AppText>
            <AppText variant="caption" color={colors.muted}>
              {money(bill.amount)}
            </AppText>
          </View>
          <View style={styles.choices} accessibilityRole="radiogroup">
            <PaidChoice
              title="Paid"
              label={`${bill.label}: paid`}
              selected={answers[bill.key] === true}
              onPress={() => onAnswer(bill.key, true)}
            />
            <PaidChoice
              title="Not yet"
              label={`${bill.label}: not paid yet`}
              selected={answers[bill.key] === false}
              onPress={() => onAnswer(bill.key, false)}
            />
          </View>
        </View>
      ))}
      {error ? (
        <AppText variant="caption" color={colors.roseLight}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

function PaidChoice({
  title,
  label,
  selected,
  onPress,
}: {
  title: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{checked: selected}}
      accessibilityLabel={label}
      style={[styles.choice, selected && styles.choiceSelected]}>
      <AppText variant="label" color={selected ? colors.text : colors.muted}>
        {title}
      </AppText>
    </PressableScale>
  );
}

const useStyles = makeStyles(() => ({
  question: {
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  questionError: {
    borderColor: colors.roseLight,
  },
  title: {
    marginTop: spacing.xs,
  },
  bill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  billText: {
    flex: 1,
  },
  choices: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  choice: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  choiceSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
}));
