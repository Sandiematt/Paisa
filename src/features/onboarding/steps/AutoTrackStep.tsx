import React, {useCallback, useEffect, useState} from 'react';
import {AppState} from 'react-native';

import {Stagger} from '../../../components/ui';
import {
  getStatus,
  isAutoTrackSupported,
  setTrackingMethod,
  subscribeToDetector,
} from '../../../lib/autotrack/nativeUpiDetector';
import {DetectorStatus, TrackingMethod} from '../../../lib/autotrack/types';
import {AutoTrackSetup} from '../../autotrack/AutoTrackSetup';
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

/**
 * Optional step on Android: the same setup as the Auto-tracking screen
 * ([AutoTrackSetup]). Skipping it is fine. Permissions and the method are
 * device-wide, so they are read and set straight from native; the toggles
 * ride on the draft and are applied to the account once it exists.
 */
export function AutoTrackStep({draft, onChange}: AutoTrackStepProps) {
  const copy = STEP_TITLES.autotrack;
  const [status, setStatus] = useState<DetectorStatus | null>(null);

  const refresh = useCallback(() => {
    getStatus().then(setStatus);
  }, []);

  // The user leaves for system settings (or Shizuku) to grant each permission;
  // Shizuku answering, or capture starting, is reported as a status change.
  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh();
      }
    });
    const unsubscribe = subscribeToDetector(reason => {
      if (reason === 'status') {
        refresh();
      }
    });
    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, [refresh]);

  const chooseMethod = useCallback(
    (method: TrackingMethod) => {
      setStatus(current =>
        current ? {...current, trackingMethod: method} : current,
      );
      setTrackingMethod(method).then(refresh);
    },
    [refresh],
  );

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <AutoTrackSetup
          supported={isAutoTrackSupported()}
          status={status}
          prefs={{
            notesEnabled: draft.autoTrackNotes ?? true,
            blockingEnabled: draft.autoTrackBlocking ?? true,
          }}
          onPrefsChange={patch => {
            if (patch.notesEnabled !== undefined) {
              onChange('autoTrackNotes', patch.notesEnabled);
            }
            if (patch.blockingEnabled !== undefined) {
              onChange('autoTrackBlocking', patch.blockingEnabled);
            }
          }}
          onChangeMethod={chooseMethod}
        />
      </Stagger>
    </StepLayout>
  );
}
