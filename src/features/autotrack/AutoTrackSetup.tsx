import React from 'react';
import {View} from 'react-native';
import {NotePencil} from 'phosphor-react-native/src/icons/NotePencil';
import {ShieldWarning} from 'phosphor-react-native/src/icons/ShieldWarning';

import {
  AppText,
  SegmentedControl,
  SettingsGroup,
  SettingsRow,
  ToggleSwitch,
} from '../../components/ui';
import {
  AutoTrackPrefs,
  DEFAULT_TRACKING_METHOD,
  DetectorStatus,
  TrackingMethod,
} from '../../lib/autotrack/types';
import {colors, makeStyles, spacing} from '../../theme';
import {autoTrackState} from './autoTrackFormat';
import {SetupComplete} from './SetupComplete';
import {SetupSteps} from './SetupSteps';
import {StatusHero} from './StatusHero';

const ICON_SIZE = 22;

const METHODS = [
  {value: 'accessibility', label: 'Standard', accessibilityLabel: 'Standard setup'},
  {value: 'shizuku', label: 'Shizuku', accessibilityLabel: 'Shizuku setup'},
] as const;

type AutoTrackSetupProps = {
  supported: boolean;
  status: DetectorStatus | null;
  prefs: AutoTrackPrefs;
  /** True until the stored prefs are loaded. */
  prefsDisabled?: boolean;
  onPrefsChange: (patch: Partial<AutoTrackPrefs>) => void;
  onChangeMethod: (method: TrackingMethod) => void;
  /** In the app only: the hero's "Last payment detected" line and Sync now. */
  lastDetectedAt?: number | null;
  syncing?: boolean;
  onSyncNow?: () => void;
  /** In the app only: "Back to Paisa" once set up. */
  onDone?: () => void;
};

/**
 * The whole auto-tracking setup, shared by the Auto-tracking screen and the
 * onboarding step: the method switch, the status card, then either the
 * numbered steps or "You're all set!", and the two toggles.
 */
export function AutoTrackSetup({
  supported,
  status,
  prefs,
  prefsDisabled = false,
  onPrefsChange,
  onChangeMethod,
  lastDetectedAt,
  syncing,
  onSyncNow,
  onDone,
}: AutoTrackSetupProps) {
  const styles = useStyles();
  const state = autoTrackState(supported, status);
  const method = status?.trackingMethod ?? DEFAULT_TRACKING_METHOD;

  return (
    <View style={styles.root}>
      {supported ? (
        <SegmentedControl
          options={METHODS}
          value={method}
          onChange={next => {
            if (next !== method) {
              onChangeMethod(next);
            }
          }}
          accessibilityLabel="Setup method"
        />
      ) : null}

      <StatusHero
        state={state}
        status={status}
        lastDetectedAt={lastDetectedAt}
        syncing={syncing}
        onSyncNow={onSyncNow}
      />

      {supported ? (
        <>
          {state === 'active' ? (
            <>
              <SetupComplete status={status} prefs={prefs} onDone={onDone} />
              <SetupSteps status={status} pendingOnly />
            </>
          ) : (
            <SetupSteps status={status} />
          )}

          <View>
            <AppText variant="label" color={colors.muted} style={styles.label}>
              When you pay
            </AppText>
            <SettingsGroup>
              <SettingsRow
                icon={<NotePencil size={ICON_SIZE} color={colors.text} />}
                label="Ask for a note"
                trailing={
                  <ToggleSwitch
                    value={prefs.notesEnabled}
                    disabled={prefsDisabled}
                    onValueChange={next => onPrefsChange({notesEnabled: next})}
                    accessibilityLabel="Ask for a note"
                  />
                }
              />
              <SettingsRow
                icon={<ShieldWarning size={ICON_SIZE} color={colors.text} />}
                label="Warn before overspending"
                trailing={
                  <ToggleSwitch
                    value={prefs.blockingEnabled}
                    disabled={prefsDisabled}
                    onValueChange={next => onPrefsChange({blockingEnabled: next})}
                    accessibilityLabel="Warn before overspending"
                  />
                }
              />
            </SettingsGroup>
          </View>
        </>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    gap: spacing.lg,
  },
  label: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
}));
