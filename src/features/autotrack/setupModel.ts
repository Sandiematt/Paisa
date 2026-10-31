import {
  openAccessibilitySettings,
  openNotificationAccessSettings,
  openShizuku,
  requestShizukuPermission,
  startShizukuCapture,
} from '../../lib/autotrack/nativeUpiDetector';
import {DetectorStatus} from '../../lib/autotrack/types';

/** What a setup step's button does; each maps to one existing native call. */
export type SetupAction =
  | 'accessibility-settings'
  | 'notification-settings'
  | 'open-helper'
  | 'allow-helper'
  | 'resume-helper';

export type SetupStep = {
  key: 'screens' | 'alerts';
  title: string;
  /** One short line: why, or what to do next. */
  body: string;
  required: boolean;
  done: boolean;
  actionLabel: string;
  action: SetupAction;
  /** What to try when it will not turn on. */
  help: string;
};

/** Step 1 with the standard method: Paisa's accessibility service. */
function standardStep(status: DetectorStatus | null): SetupStep {
  return {
    key: 'screens',
    title: 'Allow screen reading',
    body: 'Only payment screens. Never your UPI PIN.',
    required: true,
    done: status?.accessibilityEnabled === true,
    actionLabel: 'Turn on',
    action: 'accessibility-settings',
    help: 'Find "Paisa auto-tracking" and switch it on. Greyed out? App info › ⋮ › Allow restricted settings.',
  };
}

/** Step 1 with the Shizuku method: one action at a time, by where Shizuku stands. */
function shizukuStep(status: DetectorStatus): SetupStep {
  const base = {
    key: 'screens' as const,
    title: 'Connect Shizuku',
    required: true,
    done: status.shizukuCaptureRunning,
    help: 'Start Shizuku with wireless debugging (Shizuku shows how). Start it again after a restart.',
  };
  switch (status.shizukuState) {
    case 'ready':
      return {...base, body: 'Tracking is paused.', actionLabel: 'Resume', action: 'resume-helper'};
    case 'no_permission':
      return {...base, body: 'Let Paisa use Shizuku.', actionLabel: 'Allow', action: 'allow-helper'};
    case 'not_running':
      return {...base, body: 'Open Shizuku and tap Start.', actionLabel: 'Open Shizuku', action: 'open-helper'};
    case 'too_old':
      return {...base, body: 'Update Shizuku first.', actionLabel: 'Update', action: 'open-helper'};
    default:
      return {...base, body: 'Install the free Shizuku app.', actionLabel: 'Get Shizuku', action: 'open-helper'};
  }
}

function alertsStep(status: DetectorStatus | null): SetupStep {
  return {
    key: 'alerts',
    title: 'Payment alerts',
    body: 'Helps avoid counting a payment twice.',
    required: false,
    done: status?.notificationAccessEnabled === true,
    actionLabel: 'Allow',
    action: 'notification-settings',
    help: 'Find "Paisa payment check" and switch it on.',
  };
}

/**
 * The guided setup, in order: reading payment screens (required, by the
 * method in use) and payment alerts (optional). Built from the native status
 * only, so it always shows what is really on.
 */
export function setupSteps(status: DetectorStatus | null): SetupStep[] {
  const screens =
    status?.trackingMethod === 'shizuku' ? shizukuStep(status) : standardStep(status);
  return [screens, alertsStep(status)];
}

/** Runs a step's action through the existing native bridge calls. */
export function runSetupAction(action: SetupAction): void {
  switch (action) {
    case 'accessibility-settings':
      openAccessibilitySettings();
      break;
    case 'notification-settings':
      openNotificationAccessSettings();
      break;
    case 'open-helper':
      openShizuku();
      break;
    case 'allow-helper':
      requestShizukuPermission();
      break;
    case 'resume-helper':
      startShizukuCapture();
      break;
  }
}
