import React, {useCallback, useEffect, useState} from 'react';
import {AppState, View} from 'react-native';
import {Lightning} from 'phosphor-react-native/src/icons/Lightning';
import {LockSimple} from 'phosphor-react-native/src/icons/LockSimple';
import {NotePencil} from 'phosphor-react-native/src/icons/NotePencil';
import {ShieldWarning} from 'phosphor-react-native/src/icons/ShieldWarning';

import {
  AppText,
  GradientIconSquare,
  SettingsGroup,
  SettingsRow,
  Stagger,
  ToggleSwitch,
} from '../../../components/ui';
import {getStatus} from '../../../lib/autotrack/nativeUpiDetector';
import {DetectorStatus} from '../../../lib/autotrack/types';
import {colors, makeStyles, radii, spacing} from '../../../theme';
import {PermissionsGroup} from '../../autotrack/PermissionsGroup';
import {STEP_TITLES} from '../constants';
import {StepLayout} from '../components/StepLayout';
import {OnboardingDraft} from '../types';

type AutoTrackStepProps = {
  draft: OnboardingDraft;
  onChange: <K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => void;
};

const ICON_SIZE = 24;

/**
 * Optional last step on Android: grant the two system permissions and pick
 * the auto-tracking toggles. Permissions are system-wide, so they are read
 * straight from native; the toggles ride on the draft and are applied to the
 * account once it exists.
 */
export function AutoTrackStep({draft, onChange}: AutoTrackStepProps) {
  const styles = useStyles();
  const copy = STEP_TITLES.autotrack;
  const [status, setStatus] = useState<DetectorStatus | null>(null);

  const refresh = useCallback(() => {
    getStatus().then(setStatus);
  }, []);

  // The user leaves for system settings to grant each permission.
  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const notesOn = draft.autoTrackNotes ?? true;
  const blockingOn = draft.autoTrackBlocking ?? true;
  const ready =
    status?.accessibilityEnabled === true &&
    status?.notificationAccessEnabled === true;

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <View style={styles.banner}>
          <GradientIconSquare size={40} gradient={ready ? 'primary' : 'savings'}>
            <Lightning size={20} color={colors.onAccent} weight="fill" />
          </GradientIconSquare>
          <View style={styles.bannerText}>
            <AppText variant="bodyStrong">
              {ready ? 'Auto-tracking is on' : 'Two permissions to turn it on'}
            </AppText>
            <AppText variant="caption" color={colors.muted}>
              {ready
                ? 'Payments you make will show up in Activity.'
                : 'Tap each one, switch Paisa on, then come back here.'}
            </AppText>
          </View>
        </View>
      </Stagger>

      <Stagger index={2} style={styles.section}>
        <PermissionsGroup status={status} />
        <View style={styles.privacy}>
          <LockSimple size={14} color={colors.muted} />
          <AppText variant="caption" color={colors.muted} style={styles.privacyText}>
            Paisa only reads the payment screens of supported UPI apps and
            payment messages. It never sees your UPI PIN.
          </AppText>
        </View>
      </Stagger>

      <Stagger index={3} style={styles.section}>
        <AppText variant="label" color={colors.muted} style={styles.groupLabel}>
          When a payment is detected
        </AppText>
        <SettingsGroup>
          <SettingsRow
            icon={<NotePencil size={ICON_SIZE} color={colors.text} />}
            label="Transaction notes"
            trailing={
              <ToggleSwitch
                value={notesOn}
                onValueChange={next => onChange('autoTrackNotes', next)}
                accessibilityLabel="Transaction notes"
              />
            }
          />
          <SettingsRow
            icon={<ShieldWarning size={ICON_SIZE} color={colors.text} />}
            label="Over-budget blocking"
            trailing={
              <ToggleSwitch
                value={blockingOn}
                onValueChange={next => onChange('autoTrackBlocking', next)}
                accessibilityLabel="Over-budget blocking"
              />
            }
          />
        </SettingsGroup>
        <AppText variant="caption" color={colors.muted} style={styles.footnote}>
          Notes asks what each payment was for. Blocking warns you on the Pay
          screen when a payment would go over today's limit. Change either any
          time in Profile.
        </AppText>
      </Stagger>
    </StepLayout>
  );
}

const useStyles = makeStyles(() => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  bannerText: {
    flex: 1,
    gap: 2,
  },
  section: {
    marginTop: spacing.xxl,
  },
  privacy: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  privacyText: {
    flex: 1,
  },
  groupLabel: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  footnote: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
}));
