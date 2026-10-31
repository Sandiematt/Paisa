import React, {useEffect, useRef, useState} from 'react';
import {AppState, View} from 'react-native';
import {Check} from 'phosphor-react-native/src/icons/Check';

import {AppText, Card, PressableScale} from '../../components/ui';
import {DetectorStatus} from '../../lib/autotrack/types';
import {colors, makeStyles, radii, spacing, withAlpha} from '../../theme';
import {runSetupAction, SetupStep, setupSteps} from './setupModel';

type SetupStepsProps = {
  status: DetectorStatus | null;
  /** Only the steps not done yet. */
  pendingOnly?: boolean;
};

/**
 * Numbered setup steps: a short title, one line, one button. The caller
 * re-reads status when the app comes back; a step still off after the user
 * went to turn it on shows what to try.
 */
export function SetupSteps({status, pendingOnly = false}: SetupStepsProps) {
  const steps = setupSteps(status);
  const visible = pendingOnly ? steps.filter(step => !step.done) : steps;
  // The step the user left Paisa to turn on, and the ones they came back from.
  const away = useRef<SetupStep['key'] | null>(null);
  const [returnedFrom, setReturnedFrom] = useState<SetupStep['key'][]>([]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const key = away.current;
      if (state === 'active' && key) {
        away.current = null;
        setReturnedFrom(keys => (keys.includes(key) ? keys : [...keys, key]));
      }
    });
    return () => subscription.remove();
  }, []);

  if (visible.length === 0) {
    return null;
  }

  return (
    <Card padding={0}>
      {visible.map((step, index) => (
        <StepRow
          key={step.key}
          number={steps.indexOf(step) + 1}
          step={step}
          stillOff={!step.done && returnedFrom.includes(step.key)}
          last={index === visible.length - 1}
          onAction={() => {
            away.current = step.key;
            runSetupAction(step.action);
          }}
        />
      ))}
    </Card>
  );
}

type StepRowProps = {
  number: number;
  step: SetupStep;
  stillOff: boolean;
  last: boolean;
  onAction: () => void;
};

function StepRow({number, step, stillOff, last, onAction}: StepRowProps) {
  const styles = useStyles();
  const [helpOpen, setHelpOpen] = useState(false);
  const showHelp = !step.done && (helpOpen || stillOff);

  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View
        style={[styles.badge, step.done && styles.badgeDone]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {step.done ? (
          <Check size={14} color={colors.onAccent} weight="bold" />
        ) : (
          <AppText variant="label" color={colors.lavender}>
            {number}
          </AppText>
        )}
      </View>

      <View style={styles.main}>
        <View style={styles.titleRow}>
          <AppText
            variant="heading"
            style={styles.title}
            accessibilityLabel={`Step ${number}, ${step.title}, ${
              step.required ? 'required' : 'optional'
            }, ${step.done ? 'done' : 'not done'}`}>
            {step.title}
          </AppText>
          {step.done ? (
            <AppText variant="label" color={colors.mint}>
              On
            </AppText>
          ) : step.required ? null : (
            <AppText variant="caption" color={colors.muted}>
              Optional
            </AppText>
          )}
        </View>

        {step.done ? null : (
          <>
            <AppText variant="label" color={colors.muted}>
              {step.body}
            </AppText>
            {showHelp ? (
              <AppText
                variant="caption"
                color={stillOff ? colors.roseLight : colors.muted}
                style={styles.help}>
                {stillOff ? `Still off. ${step.help}` : step.help}
              </AppText>
            ) : null}
            <View style={styles.actions}>
              <PressableScale
                onPress={onAction}
                scaleTo={0.96}
                accessibilityRole="button"
                accessibilityLabel={`${step.actionLabel}: ${step.title}`}
                style={[styles.button, step.required ? styles.buttonPrimary : styles.buttonSecondary]}>
                <AppText
                  variant="bodyStrong"
                  color={step.required ? colors.onAccent : colors.text}>
                  {step.actionLabel}
                </AppText>
              </PressableScale>
              {showHelp ? null : (
                <PressableScale
                  onPress={() => setHelpOpen(true)}
                  scaleTo={0.97}
                  accessibilityRole="button"
                  accessibilityLabel={`Help: ${step.title}`}
                  style={styles.helpLink}>
                  <AppText variant="label" color={colors.lavender}>
                    Need help?
                  </AppText>
                </PressableScale>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const BADGE = 26;

const useStyles = makeStyles(() => ({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 1.5,
    borderColor: withAlpha(colors.lavender, 0.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDone: {
    borderColor: colors.mint,
    backgroundColor: colors.mint,
  },
  main: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: BADGE,
  },
  title: {
    flex: 1,
  },
  help: {
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  button: {
    minHeight: 38,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.violet,
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfaceRaised,
  },
  helpLink: {
    minHeight: 38,
    justifyContent: 'center',
  },
}));
