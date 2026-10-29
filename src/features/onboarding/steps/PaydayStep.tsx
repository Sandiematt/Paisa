import React from 'react';
import {View} from 'react-native';
import {CalendarCheck, CurrencyInr} from 'phosphor-react-native';

import {
  AppText,
  GradientIconSquare,
  SettingsGroup,
  SettingsRow,
  Stagger,
  TogglePill,
  ToggleSwitch,
} from '../../../components/ui';
import {localDateISO, dateFromCalendarISO} from '../../../lib/transactionsStore';
import {nextMonthlyDate} from '../../../lib/scheduledSetup';
import {colors, makeStyles, radii, spacing} from '../../../theme';
import {
  PAYDAY_SHORTCUTS,
  STEP_TITLES,
  currencyByCode,
  dayLabel,
} from '../constants';
import {PaydayGrid} from '../components/PaydayGrid';
import {StepLayout} from '../components/StepLayout';
import {OnboardingDraft} from '../types';

type PaydayStepProps = {
  draft: OnboardingDraft;
  onChange: <K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => void;
};

const ICON_SIZE = 24;

export function PaydayStep({draft, onChange}: PaydayStepProps) {
  const styles = useStyles();
  const copy = STEP_TITLES.payday;
  const currency = currencyByCode(draft.currency);
  const payday = draft.payday ?? null;
  const income = Number(draft.monthlyIncome) || 0;
  const logSalary = draft.logSalary ?? true;

  const next = payday
    ? dateFromCalendarISO(nextMonthlyDate(payday, localDateISO()))
    : null;

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <AppText variant="label" color={colors.muted}>
          Quick pick
        </AppText>
        <View style={styles.pills}>
          {PAYDAY_SHORTCUTS.map(day => (
            <TogglePill
              key={day}
              label={dayLabel(day)}
              selected={payday === day}
              onPress={() => onChange('payday', day)}
            />
          ))}
        </View>
      </Stagger>

      <Stagger index={2} style={styles.spaced}>
        <View style={styles.calendar}>
          <AppText variant="label" color={colors.muted} style={styles.calendarLabel}>
            Or pick the day
          </AppText>
          <PaydayGrid value={payday} onSelect={day => onChange('payday', day)} />
        </View>
      </Stagger>

      {next ? (
        <Stagger index={3} style={styles.spaced}>
          <View style={styles.readout}>
            <GradientIconSquare size={44} gradient="savings">
              <CalendarCheck size={22} color={colors.onAccent} weight="fill" />
            </GradientIconSquare>
            <View style={styles.readoutText}>
              <AppText variant="caption" color={colors.muted}>
                Next payday
              </AppText>
              <AppText variant="heading">
                {next.toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </AppText>
            </View>
          </View>

          <SettingsGroup style={styles.toggleGroup}>
            <SettingsRow
              icon={<CurrencyInr size={ICON_SIZE} color={colors.text} />}
              label={
                income > 0
                  ? `Add ${currency.symbol}${income.toLocaleString('en-IN')} on payday`
                  : 'Add my salary on payday'
              }
              trailing={
                <ToggleSwitch
                  value={income > 0 && logSalary}
                  onValueChange={value => onChange('logSalary', value)}
                  disabled={income <= 0}
                  accessibilityLabel="Add salary on payday"
                />
              }
            />
          </SettingsGroup>
          <AppText variant="caption" color={colors.muted} style={styles.footnote}>
            {income > 0
              ? 'It repeats every month as income. Edit or stop it from Activity.'
              : 'Go back and add your monthly income to log it automatically.'}
          </AppText>
        </Stagger>
      ) : null}
    </StepLayout>
  );
}

const useStyles = makeStyles(() => ({
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  spaced: {
    marginTop: spacing.xxl,
  },
  calendar: {
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  calendarLabel: {
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  readoutText: {
    flex: 1,
    gap: 2,
  },
  toggleGroup: {
    marginTop: spacing.md,
  },
  footnote: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
}));
