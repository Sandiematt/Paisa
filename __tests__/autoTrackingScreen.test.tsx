import React from 'react';
import {Alert, AppState} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {PressableScale, PrimaryButton, SecondaryButton, ToggleSwitch} from '../src/components/ui';
import {AutoTrackingScreen} from '../src/features/autotrack/AutoTrackingScreen';
import {
  autoTrackState,
  groupPayments,
  lastDetectedLabel,
  paymentPill,
} from '../src/features/autotrack/autoTrackFormat';
import {
  DailyAllowance,
  DetectedTxn,
  DetectorStatus,
} from '../src/lib/autotrack/types';

// The font hook pulls in expo-font, which is not resolvable under jest here.
jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => [true, null]}));

// phosphor ships ~1500 icon modules; stub every icon as an empty component.
jest.mock('phosphor-react-native', () => new Proxy({}, {get: (_target, name) => (name === '__esModule' ? false : () => null)}));

jest.mock('react-native-safe-area-context', () => {
  const {View} = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
  };
});

const mockUseAutoTrack = jest.fn();
jest.mock('../src/features/autotrack/AutoTrackProvider', () => ({
  useAutoTrack: () => mockUseAutoTrack(),
}));

const mockOpenAccessibility = jest.fn();
const mockOpenNotificationAccess = jest.fn();
const mockOpenShizuku = jest.fn();
const mockRequestShizukuPermission = jest.fn();
const mockStartShizukuCapture = jest.fn();
const mockDeveloperMode = jest.fn(() => Promise.resolve(true));
jest.mock('../src/lib/autotrack/nativeUpiDetector', () => ({
  openAccessibilitySettings: () => mockOpenAccessibility(),
  openNotificationAccessSettings: () => mockOpenNotificationAccess(),
  openShizuku: () => mockOpenShizuku(),
  requestShizukuPermission: () => mockRequestShizukuPermission(),
  startShizukuCapture: () => mockStartShizukuCapture(),
  isDeveloperModeEnabled: () => mockDeveloperMode(),
}));

/** All rendered text plus accessibility labels, flattened. */
function textOf(tree: ReactTestRenderer.ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestRendererNode | null | ReactTestRenderer.ReactTestRendererNode[]) => {
    if (node === null) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    const label = node.props?.accessibilityLabel;
    if (typeof label === 'string') parts.push(label);
    walk(node.children as ReactTestRenderer.ReactTestRendererNode[] | null);
  };
  walk(tree.toJSON());
  return parts.join(' | ');
}

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}

afterEach(async () => {
  // Unmount so the skeleton's looping animation stops and jest can exit.
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const GPAY = 'com.google.android.apps.nbu.paisa.user';
const PHONEPE = 'com.phonepe.app';
const PAYTM = 'net.one97.paytm';

const noon = new Date();
noon.setHours(12, 0, 0, 0);
const TODAY_NOON = noon.getTime();
const YESTERDAY_NOON = TODAY_NOON - 24 * 60 * 60 * 1000;

function payment(partial: Partial<DetectedTxn> & Pick<DetectedTxn, 'id'>): DetectedTxn {
  return {
    sourceApp: PHONEPE,
    amount: '149.50',
    status: 'SUCCESS',
    direction: 'DEBIT',
    merchant: null,
    upiRef: null,
    detectedAtMillis: TODAY_NOON,
    updatedAtMillis: TODAY_NOON,
    flag: null,
    flagReason: null,
    possibleDuplicateOfId: null,
    note: null,
    synced: false,
    dirty: false,
    remoteId: null,
    syncedAtMillis: null,
    ...partial,
  };
}

const BOTH_ON: DetectorStatus = {
  accessibilityEnabled: true,
  notificationAccessEnabled: true,
  installedApps: [GPAY, PHONEPE],
  trackingMethod: 'accessibility',
  shizukuState: 'not_installed',
  shizukuCaptureRunning: false,
};

const SHIZUKU_ON: DetectorStatus = {
  ...BOTH_ON,
  accessibilityEnabled: false,
  trackingMethod: 'shizuku',
  shizukuState: 'ready',
  shizukuCaptureRunning: true,
};

const ALLOWANCE: DailyAllowance = {
  date: '2026-10-14',
  cycleStart: '2026-10-01',
  cycleEnd: '2026-10-31',
  daysLeft: 18,
  budget: 40000,
  spentBeforeToday: 7600,
  dailyLimit: 1800,
  spentToday: 600,
  remainingToday: 1200,
  remainingMonth: 31800,
};

const PAYMENTS: DetectedTxn[] = [
  payment({id: 1, merchant: 'Cafe Mocha', synced: true, note: 'Chai with Ravi'}),
  payment({id: 2, sourceApp: GPAY, amount: '60', detectedAtMillis: TODAY_NOON - 3600_000}),
  payment({
    id: 3,
    sourceApp: PAYTM,
    amount: '149.50',
    flag: 'POSSIBLE_DUPLICATE',
    flagReason: 'Same amount as a payment 2 minutes earlier',
    detectedAtMillis: TODAY_NOON - 7200_000,
  }),
  payment({id: 4, direction: 'CREDIT', amount: '500', synced: true, detectedAtMillis: YESTERDAY_NOON}),
  payment({id: 5, status: 'FAILED', amount: '20', detectedAtMillis: YESTERDAY_NOON - 3600_000}),
  payment({id: 6, status: 'PENDING', amount: '30', detectedAtMillis: YESTERDAY_NOON - 7200_000}),
];

function autoTrack(overrides: Record<string, unknown> = {}) {
  return {
    supported: true,
    loading: false,
    status: BOTH_ON,
    refreshStatus: jest.fn(async () => {}),
    setTrackingMethod: jest.fn(async () => {}),
    prefs: {notesEnabled: true, blockingEnabled: true},
    prefsLoaded: true,
    updatePrefs: jest.fn(),
    setLogStreaming: jest.fn(),
    transactions: PAYMENTS,
    log: ['payment of ₹149.50 started in PhonePe', 'service connected'],
    allowance: ALLOWANCE,
    syncNow: jest.fn(async () => {}),
    syncing: false,
    lastSyncAt: null,
    keep: jest.fn(async () => {}),
    merge: jest.fn(async () => {}),
    clearHistory: jest.fn(async () => {}),
    shareReport: jest.fn(async () => {}),
    ...overrides,
  };
}

function screen(onOpenBudget = jest.fn(), onClose = jest.fn()) {
  return (
    <AutoTrackingScreen
      visible
      onClose={onClose}
      currencySymbol="₹"
      onOpenBudget={onOpenBudget}
    />
  );
}

function byLabel(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root
    .findAllByType(PressableScale)
    .find(node => node.props.accessibilityLabel === label)!;
}

function byLabelPrefix(tree: ReactTestRenderer.ReactTestRenderer, prefix: string) {
  return tree.root
    .findAllByType(PressableScale)
    .filter(
      node =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith(prefix),
    );
}

describe('AutoTrackingScreen', () => {
  beforeEach(() => {
    mockUseAutoTrack.mockReset();
    mockOpenAccessibility.mockReset();
    mockOpenNotificationAccess.mockReset();
    mockDeveloperMode.mockImplementation(() => Promise.resolve(true));
  });

  it('hides Diagnostics unless Developer options are on', async () => {
    mockDeveloperMode.mockImplementation(() => Promise.resolve(false));
    mockUseAutoTrack.mockReturnValue(autoTrack({lastSyncAt: TODAY_NOON}));
    const tree = await render(screen());
    const text = textOf(tree);
    expect(text).toContain('Detected payments');
    expect(text).not.toContain('Diagnostics');
  });

  it('renders every section with data, including a flagged payment', async () => {
    const value = autoTrack({lastSyncAt: TODAY_NOON});
    mockUseAutoTrack.mockReturnValue(value);
    const tree = await render(screen());
    const text = textOf(tree);

    // Hero.
    expect(text).toContain('Auto-tracking status: Active');
    expect(text).toContain('Never miss a UPI expense again.');
    expect(text).toContain('Google Pay installed');
    expect(text).toContain('Paytm not installed');
    expect(text).toContain('Last payment detected 12:00 PM');
    expect(text).not.toContain('Last synced');
    expect(text).toContain('Sync now');
    expect(value.refreshStatus).toHaveBeenCalled();

    // Setup is done: the success card replaces the steps, and the method choice stays out of sight.
    expect(text).toContain("You're all set!");
    expect(text).toContain('Payment tracking, on');
    expect(text).toContain('Payment alerts, on');
    expect(text).not.toContain('Step 1,');

    // Allowance.
    expect(text).toContain("Today's allowance");
    expect(text).toContain('₹1,800');
    expect(text).toContain('Spent today');
    expect(text).toContain('₹600');
    expect(text).toContain('Left today');
    expect(text).toContain('₹1,200');
    expect(text).toContain('₹31,800 left this month · 18 days left');

    // Settings and footnotes.
    expect(text).toContain('Ask for a note');
    expect(text).toContain('Warn before overspending');

    // Payments, grouped by day.
    expect(text).toContain('Today');
    expect(text).toContain('Yesterday');
    expect(text).toContain('Cafe Mocha');
    expect(text).toContain('PhonePe · 12:00 PM');
    expect(text).toContain('Chai with Ravi');
    expect(text).toContain('-₹149.50');
    expect(text).toContain('+₹500.00');
    for (const pill of ['Synced', 'Pending sync', 'Needs review', 'Failed', 'Pending']) {
      expect(text).toContain(pill);
    }
    expect(text).toContain('Same amount as a payment 2 minutes earlier');

    // Diagnostics start collapsed.
    expect(text).toContain('Diagnostics');
    expect(text).not.toContain('service connected');
  });

  it('keeps or merges a flagged payment', async () => {
    const value = autoTrack();
    mockUseAutoTrack.mockReturnValue(value);
    const tree = await render(screen());

    // Only the flagged row offers the choice.
    const keeps = byLabelPrefix(tree, 'Keep ');
    expect(keeps).toHaveLength(1);
    await act(async () => {
      keeps[0].props.onPress();
    });
    expect(value.keep).toHaveBeenCalledWith(3);

    const merges = byLabelPrefix(tree, 'Merge ');
    expect(merges).toHaveLength(1);
    await act(async () => {
      merges[0].props.onPress();
    });
    expect(value.merge).toHaveBeenCalledWith(3);
  });

  it('guides setup with numbered steps and opens the right settings', async () => {
    mockUseAutoTrack.mockReturnValue(
      autoTrack({
        status: {...BOTH_ON, accessibilityEnabled: false, notificationAccessEnabled: false},
      }),
    );
    const tree = await render(screen());
    const text = textOf(tree);
    expect(text).toContain('Auto-tracking status: Setup required');
    expect(text).toContain('Step 1, Allow screen reading, required, not done');
    expect(text).toContain('Step 2, Payment alerts, optional, not done');
    expect(text).toContain('Never your UPI PIN.');
    expect(text).not.toContain("You're all set!");

    await act(async () => {
      byLabel(tree, 'Turn on: Allow screen reading').props.onPress();
    });
    expect(mockOpenAccessibility).toHaveBeenCalledTimes(1);
    await act(async () => {
      byLabel(tree, 'Allow: Payment alerts').props.onPress();
    });
    expect(mockOpenNotificationAccess).toHaveBeenCalledTimes(1);
  });

  it('counts payment alerts as optional: active without them, offered as an extra', async () => {
    mockUseAutoTrack.mockReturnValue(
      autoTrack({status: {...BOTH_ON, notificationAccessEnabled: false}}),
    );
    const tree = await render(screen());
    const text = textOf(tree);
    expect(text).toContain('Auto-tracking status: Active');
    expect(text).toContain("You're all set!");
    expect(text).toContain('Payment alerts, off');
    expect(text).toContain('Step 2, Payment alerts, optional, not done');
    expect(text).not.toContain('Step 1,');
  });

  it('returns to the app from the success card', async () => {
    mockUseAutoTrack.mockReturnValue(autoTrack());
    const onClose = jest.fn();
    const tree = await render(screen(jest.fn(), onClose));
    await act(async () => {
      tree.root
        .findAllByType(PrimaryButton)
        .find(node => node.props.label === 'Back to Paisa')!
        .props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows what to try when a step is still off after coming back', async () => {
    let onAppState: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (state: string) => void) => {
      onAppState = handler;
      return {remove: jest.fn()};
    }) as unknown as typeof AppState.addEventListener);
    mockUseAutoTrack.mockReturnValue(
      autoTrack({status: {...BOTH_ON, accessibilityEnabled: false}}),
    );
    const tree = await render(screen());
    expect(textOf(tree)).not.toContain('Still off');
    await act(async () => {
      byLabel(tree, 'Turn on: Allow screen reading').props.onPress();
    });
    await act(async () => {
      onAppState?.('background');
      onAppState?.('active');
    });
    const text = textOf(tree);
    expect(text).toContain('Still off.');
    expect(text).toContain('Allow restricted settings');
  });

  it('switches the setup method from the switch at the top', async () => {
    const value = autoTrack({status: {...BOTH_ON, accessibilityEnabled: false}});
    mockUseAutoTrack.mockReturnValue(value);
    const tree = await render(screen());
    const segment = (label: string) =>
      tree.root.findAll(
        node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      )[0];
    expect(segment('Standard setup')).toBeDefined();
    await act(async () => {
      segment('Shizuku setup').props.onPress();
    });
    expect(value.setTrackingMethod).toHaveBeenCalledWith('shizuku');
    // The method in use is not set again.
    await act(async () => {
      segment('Standard setup').props.onPress();
    });
    expect(value.setTrackingMethod).toHaveBeenCalledTimes(1);
  });

  it('shows the Shizuku method as active', async () => {
    mockUseAutoTrack.mockReturnValue(autoTrack({status: SHIZUKU_ON}));
    const tree = await render(screen());
    const text = textOf(tree);
    expect(text).toContain('Auto-tracking status: Active');
    expect(text).toContain("You're all set!");
  });

  it('walks through each Shizuku setup step, and shows a stopped capture as paused', async () => {
    const steps: [Partial<DetectorStatus>, string, string, jest.Mock][] = [
      [{shizukuState: 'not_installed'}, 'Setup required', 'Get Shizuku', mockOpenShizuku],
      [{shizukuState: 'not_running'}, 'Setup required', 'Open Shizuku', mockOpenShizuku],
      [{shizukuState: 'too_old'}, 'Setup required', 'Update', mockOpenShizuku],
      [{shizukuState: 'no_permission'}, 'Setup required', 'Allow', mockRequestShizukuPermission],
      [{shizukuState: 'ready'}, 'Paused', 'Resume', mockStartShizukuCapture],
    ];
    for (const [patch, badge, action, call] of steps) {
      mockUseAutoTrack.mockReturnValue(
        autoTrack({status: {...SHIZUKU_ON, shizukuCaptureRunning: false, ...patch}}),
      );
      const tree = await render(screen());
      expect(textOf(tree)).toContain(`Auto-tracking status: ${badge}`);
      call.mockClear();
      await act(async () => {
        byLabel(tree, `${action}: Connect Shizuku`).props.onPress();
      });
      expect(call).toHaveBeenCalledTimes(1);
    }
  });

  it('explains Android-only support and renders nothing interactive when unsupported', async () => {
    mockUseAutoTrack.mockReturnValue(
      autoTrack({supported: false, status: null, transactions: [], allowance: null}),
    );
    const tree = await render(screen());
    const text = textOf(tree);
    expect(text).toContain('Not available');
    expect(text).toContain('Android only');
    for (const absent of ['Shizuku', 'Sync now', 'Ask for a note', 'Detected payments', 'Diagnostics']) {
      expect(text).not.toContain(absent);
    }
    expect(tree.root.findAllByType(ToggleSwitch)).toHaveLength(0);
  });

  it('prompts to set a budget when there is no allowance, and opens the budget editor', async () => {
    mockUseAutoTrack.mockReturnValue(autoTrack({allowance: null}));
    const onOpenBudget = jest.fn();
    const tree = await render(screen(onOpenBudget));
    expect(textOf(tree)).toContain('Set a monthly budget to get a daily limit');
    await act(async () => {
      byLabel(tree, 'Set a monthly budget').props.onPress();
    });
    expect(onOpenBudget).toHaveBeenCalledTimes(1);
  });

  it('shows "Over by" when today is past the limit', async () => {
    mockUseAutoTrack.mockReturnValue(
      autoTrack({allowance: {...ALLOWANCE, spentToday: 2000, remainingToday: -200, remainingMonth: 30400}}),
    );
    const tree = await render(screen());
    const text = textOf(tree);
    expect(text).toContain('Over by');
    expect(text).toContain('₹200');
    expect(text).not.toContain('Left today');
  });

  it('updates each preference independently', async () => {
    const value = autoTrack({prefs: {notesEnabled: true, blockingEnabled: false}});
    mockUseAutoTrack.mockReturnValue(value);
    const tree = await render(screen());
    const toggle = (label: string) =>
      tree.root.findAllByType(ToggleSwitch).find(node => node.props.accessibilityLabel === label)!;

    expect(toggle('Ask for a note').props.value).toBe(true);
    expect(toggle('Warn before overspending').props.value).toBe(false);

    await act(async () => {
      toggle('Ask for a note').props.onValueChange(false);
    });
    expect(value.updatePrefs).toHaveBeenLastCalledWith({notesEnabled: false});

    await act(async () => {
      toggle('Warn before overspending').props.onValueChange(true);
    });
    expect(value.updatePrefs).toHaveBeenLastCalledWith({blockingEnabled: true});
    expect(value.updatePrefs).toHaveBeenCalledTimes(2);
  });

  it('syncs on demand and disables the button while syncing', async () => {
    const value = autoTrack();
    mockUseAutoTrack.mockReturnValue(value);
    const tree = await render(screen());
    await act(async () => {
      byLabel(tree, 'Sync now').props.onPress();
    });
    expect(value.syncNow).toHaveBeenCalledTimes(1);

    mockUseAutoTrack.mockReturnValue(autoTrack({syncing: true}));
    const busy = await render(screen());
    expect(textOf(busy)).toContain('Saving payments to Activity…');
    const button = busy.root.findAll(
      node => node.props.accessibilityLabel === 'Sync now' && node.props.accessibilityState != null,
    )[0];
    expect(button.props.accessibilityState).toEqual({disabled: true});
    expect(button.props.disabled).toBe(true);
  });

  it('shows the empty state when nothing was detected', async () => {
    mockUseAutoTrack.mockReturnValue(autoTrack({transactions: []}));
    const tree = await render(screen());
    expect(textOf(tree)).toContain(
      'Payments you make in Google Pay, PhonePe or Paytm will show up here.',
    );
  });

  it('shows a skeleton, not the empty state, while the detector is first read', async () => {
    mockUseAutoTrack.mockReturnValue(autoTrack({loading: true, status: null, transactions: []}));
    jest.useFakeTimers();
    const tree = await render(screen());
    expect(textOf(tree)).not.toContain('Payments you make in');
    expect(textOf(tree)).not.toContain('Loading detected payments');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    const text = textOf(tree);
    expect(text).toContain('Loading detected payments');
    expect(text).not.toContain('Payments you make in');
  });

  it('lists at most the 50 newest payments', async () => {
    const many = Array.from({length: 60}, (_, index) =>
      payment({id: index + 1, merchant: `Shop ${index + 1}`, detectedAtMillis: TODAY_NOON - index * 1000}),
    );
    mockUseAutoTrack.mockReturnValue(autoTrack({transactions: many}));
    const tree = await render(screen());
    const text = textOf(tree);
    expect(text).toContain('50 payments');
    expect(text).toContain('Shop 1,');
    expect(text).toContain('Shop 50,');
    expect(text).not.toContain('Shop 51,');
  });

  it('opens diagnostics, shares the report and confirms before clearing', async () => {
    const value = autoTrack();
    mockUseAutoTrack.mockReturnValue(value);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render(screen());

    await act(async () => {
      byLabel(tree, 'Diagnostics').props.onPress();
    });
    const text = textOf(tree);
    expect(text).toContain('payment of ₹149.50 started in PhonePe');
    expect(text).toContain('service connected');

    await act(async () => {
      tree.root
        .findAllByType(SecondaryButton)
        .find(node => node.props.label === 'Share report')!
        .props.onPress();
    });
    expect(value.shareReport).toHaveBeenCalledTimes(1);

    await act(async () => {
      byLabel(tree, 'Clear history').props.onPress();
    });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(value.clearHistory).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => {
      buttons.find(button => button.style === 'destructive')!.onPress!();
    });
    expect(value.clearHistory).toHaveBeenCalledTimes(1);
  });
});

describe('AutoTrackingScreen log streaming and toggles', () => {
  it('streams the log only while diagnostics is expanded', async () => {
    const value = autoTrack();
    mockUseAutoTrack.mockReturnValue(value);
    const tree = await render(screen());
    expect(value.setLogStreaming).not.toHaveBeenCalled();

    await act(async () => {
      byLabel(tree, 'Diagnostics').props.onPress();
    });
    expect(value.setLogStreaming).toHaveBeenLastCalledWith(true);

    await act(async () => {
      byLabel(tree, 'Diagnostics').props.onPress();
    });
    expect(value.setLogStreaming).toHaveBeenLastCalledWith(false);
  });

  it('stops streaming when the screen unmounts with diagnostics open', async () => {
    const value = autoTrack();
    mockUseAutoTrack.mockReturnValue(value);
    const tree = await render(screen());
    await act(async () => {
      byLabel(tree, 'Diagnostics').props.onPress();
    });
    await act(async () => {
      tree.unmount();
    });
    mounted.splice(mounted.indexOf(tree), 1);
    expect(value.setLogStreaming).toHaveBeenLastCalledWith(false);
  });

  it('disables both toggles until the prefs have loaded', async () => {
    mockUseAutoTrack.mockReturnValue(autoTrack({prefsLoaded: false}));
    const tree = await render(screen());
    const toggles = tree.root.findAllByType(ToggleSwitch);
    expect(toggles).toHaveLength(2);
    expect(toggles.every(toggle => toggle.props.disabled === true)).toBe(true);
  });

  it('enables the toggles once the prefs have loaded', async () => {
    mockUseAutoTrack.mockReturnValue(autoTrack());
    const tree = await render(screen());
    const toggles = tree.root.findAllByType(ToggleSwitch);
    expect(toggles.every(toggle => toggle.props.disabled === false)).toBe(true);
  });
});

describe('autoTrackFormat', () => {
  it('derives the state from platform and the required step only', () => {
    expect(autoTrackState(false, null)).toBe('unavailable');
    expect(autoTrackState(true, null)).toBe('checking');
    expect(autoTrackState(true, BOTH_ON)).toBe('active');
    // Payment alerts are optional.
    expect(autoTrackState(true, {...BOTH_ON, notificationAccessEnabled: false})).toBe('active');
    expect(autoTrackState(true, {...BOTH_ON, accessibilityEnabled: false})).toBe('setup-required');
  });

  it('counts Shizuku capture, not the accessibility service, when Shizuku is picked', () => {
    expect(autoTrackState(true, SHIZUKU_ON)).toBe('active');
    expect(autoTrackState(true, {...SHIZUKU_ON, accessibilityEnabled: true, shizukuCaptureRunning: false})).toBe(
      'paused',
    );
    expect(autoTrackState(true, {...SHIZUKU_ON, shizukuState: 'not_running', shizukuCaptureRunning: false})).toBe(
      'setup-required',
    );
    expect(autoTrackState(true, {...BOTH_ON, shizukuCaptureRunning: true, accessibilityEnabled: false})).toBe(
      'setup-required',
    );
  });

  it('labels the last detected payment', () => {
    const now = new Date(TODAY_NOON + 3600_000);
    expect(lastDetectedLabel(null, now)).toBe('No payments detected yet');
    expect(lastDetectedLabel(TODAY_NOON, now)).toBe('Last payment detected 12:00 PM');
    expect(lastDetectedLabel(YESTERDAY_NOON, now)).toMatch(/^Last payment detected \w{3} \d{1,2}, 12:00 PM$/);
  });

  it('maps a payment to its status pill', () => {
    expect(paymentPill(payment({id: 1, synced: true})).label).toBe('Synced');
    expect(paymentPill(payment({id: 1, synced: true, dirty: true})).label).toBe('Pending sync');
    expect(paymentPill(payment({id: 1})).label).toBe('Pending sync');
    expect(paymentPill(payment({id: 1, flag: 'POSSIBLE_DUPLICATE'})).label).toBe('Needs review');
    expect(paymentPill(payment({id: 1, status: 'FAILED'})).label).toBe('Failed');
    expect(paymentPill(payment({id: 1, status: 'PENDING'})).label).toBe('Pending');
    expect(paymentPill(payment({id: 1, direction: 'UNKNOWN'})).label).toBe('Not synced');
    expect(paymentPill(payment({id: 1, direction: 'UNKNOWN', synced: true})).label).toBe('Synced');
  });

  it('groups newest first by local day', () => {
    const groups = groupPayments(PAYMENTS, new Date(TODAY_NOON));
    expect(groups.map(group => group.label)).toEqual(['Today', 'Yesterday']);
    expect(groups[0].items.map(item => item.id)).toEqual([1, 2, 3]);
    expect(groups[1].items.map(item => item.id)).toEqual([4, 5, 6]);
  });
});
