import React from 'react';
import {BellRinging} from 'phosphor-react-native/src/icons/BellRinging';
import {PersonSimpleCircle} from 'phosphor-react-native/src/icons/PersonSimpleCircle';
import {TerminalWindow} from 'phosphor-react-native/src/icons/TerminalWindow';

import {AppText, SettingsGroup, SettingsRow} from '../../components/ui';
import {
  openAccessibilitySettings,
  openNotificationAccessSettings,
  openShizuku,
  requestShizukuPermission,
  startShizukuCapture,
} from '../../lib/autotrack/nativeUpiDetector';
import {DetectorStatus} from '../../lib/autotrack/types';
import {colors} from '../../theme';

const ICON_SIZE = 24;

/** How to get Shizuku going, under the permissions when the Shizuku method is picked. */
export const SHIZUKU_HELP =
  'Install Shizuku, start it with wireless debugging (Shizuku shows the steps), then allow Paisa. ' +
  'Start Shizuku again after the phone restarts; Paisa resumes on its own.';

function PermissionState({on, label}: {on: boolean; label?: string}) {
  return (
    <AppText variant="bodyStrong" color={on ? colors.mint : colors.lavender}>
      {on ? 'On' : label ?? 'Enable'}
    </AppText>
  );
}

type ShizukuStep = {
  /** Trailing label while the step is not done. */
  label: string;
  /** Spoken after the row label. */
  state: string;
  hint: string;
  run: () => void;
};

/** What the Shizuku row asks for next, from where Shizuku stands; null when capture is running. */
export function shizukuStep(status: DetectorStatus | null): ShizukuStep | null {
  if (status?.shizukuCaptureRunning) {
    return null;
  }
  switch (status?.shizukuState) {
    case 'ready':
      return {
        label: 'Resume',
        state: 'stopped',
        hint: 'Starts reading UPI screens again',
        run: () => {
          startShizukuCapture();
        },
      };
    case 'no_permission':
      return {
        label: 'Allow',
        state: 'not allowed',
        hint: 'Asks Shizuku to allow Paisa',
        run: () => {
          requestShizukuPermission();
        },
      };
    case 'not_running':
      return {
        label: 'Start',
        state: 'not running',
        hint: 'Opens Shizuku so you can start it',
        run: () => {
          openShizuku();
        },
      };
    case 'too_old':
      return {
        label: 'Update',
        state: 'needs an update',
        hint: 'Opens Shizuku',
        run: () => {
          openShizuku();
        },
      };
    default:
      return {
        label: 'Install',
        state: 'not installed',
        hint: 'Opens the Shizuku download page',
        run: () => {
          openShizuku();
        },
      };
  }
}

/**
 * The system permissions auto-tracking needs for the chosen method: the
 * accessibility service or Shizuku, plus notification access. Each is granted
 * outside Paisa, so the caller re-reads status when the app comes back.
 */
export function PermissionsGroup({status}: {status: DetectorStatus | null}) {
  const notificationsOn = status?.notificationAccessEnabled === true;
  const shizuku = status?.trackingMethod === 'shizuku';
  const accessibilityOn = status?.accessibilityEnabled === true;
  const step = shizuku ? shizukuStep(status) : null;
  return (
    <SettingsGroup>
      {shizuku ? (
        <SettingsRow
          icon={<TerminalWindow size={ICON_SIZE} color={colors.text} />}
          label="Shizuku"
          trailing={<PermissionState on={step === null} label={step?.label} />}
          onPress={step?.run}
          accessibilityLabel={`Shizuku, ${step ? step.state : 'on'}`}
          accessibilityHint={step?.hint}
        />
      ) : (
        <SettingsRow
          icon={<PersonSimpleCircle size={ICON_SIZE} color={colors.text} />}
          label="Accessibility service"
          trailing={<PermissionState on={accessibilityOn} />}
          onPress={() => {
            openAccessibilitySettings();
          }}
          accessibilityLabel={`Accessibility service, ${accessibilityOn ? 'on' : 'off'}`}
          accessibilityHint="Opens system settings"
        />
      )}
      <SettingsRow
        icon={<BellRinging size={ICON_SIZE} color={colors.text} />}
        label="Notification access"
        trailing={<PermissionState on={notificationsOn} />}
        onPress={() => {
          openNotificationAccessSettings();
        }}
        accessibilityLabel={`Notification access, ${notificationsOn ? 'on' : 'off'}`}
        accessibilityHint="Opens system settings"
      />
    </SettingsGroup>
  );
}
