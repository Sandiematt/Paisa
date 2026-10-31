import React from 'react';
import {Alert} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {PressableScale, SecondaryButton, ToggleSwitch} from '../src/components/ui';
import {AutoTrackingScreen} from '../src/features/autotrack/AutoTrackingScreen';
import {
  autoTrackState,
  groupPayments,
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
jest.mock('../src/lib/autotrack/nativeUpiDetector', () => ({
  openAccessibilitySettings: () => mockOpenAccessibility(),
  openNotificationAccessSettings: () => mockOpenNotificationAccess(),
  openShizuku: () => mockOpenShizuku(),
  requestShizukuPermission: () => mockRequestShizukuPermission(),
  startShizukuCapture: () => mockStartShizukuCapture(),
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
  weekStart: '2026-10-12',
  weekEnd: '2026-10-18',
  weekBudget: 9450,
  spentWeekBeforeToday: 450,
  daysLeftInWeek: 5,
  dailyLimit: 1800,
  spentToday: 600,
  remainingToday: 1200,
  remainingWeek: 8400,
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
  });

  it('renders every section with data, including a flagged payment', async () => {
    const value = autoTrack({lastSyncAt: TODAY_NOON});
    mockUseAutoTrack.mockReturnValue(value);
    const tree = await render(screen());
    const text = textOf(tree);

    // Hero.
    expect(text).toContain('Active');
    expect(text).toContain('Google Pay installed');
    expect(text).toContain('Paytm not installed');
    expect(text).toContain('Last synced 12:00 PM');
    expect(text).toContain('Sync now');
    expect(value.refreshStatus).toHaveBeenCalled();

    // Permissions.
    expect(text).toContain('Accessibility service, on');
    expect(text).toContain('Notification access, on');

    // Allowance.
    expect(text).toContain("Today's allowance");
    expect(text).toContain('₹1,800');
    expect(text).toContain('Spent today');
    expect(text).toContain('₹600');
    expect(text).toContain('Left today');
    expect(text).toContain('₹1,200');
    expect(text).toContain('Week budget ₹9,450 · 5 days left');

    // Settings and footnotes.
    expect(text).toContain('Transaction notes');
    expect(text).toContain('Over-budget blocking');
    expect(text).toContain(
      'Ask what each detected payment was for. Notes appear on the payment in Activity.',
    );
    expect(text).toContain(
      "Warn on the UPI Pay screen when a payment would go over today's limit. It can't stop a payment, but Cancel takes you back.",
    );

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

  it('asks for permission and opens the right system settings', async () => {
    mockUseAutoTrack.mockReturnValue(
      autoTrack({
        status: {...BOTH_ON, accessibilityEnabled: false, installedApps: []},
      }),
    );
    const tree = await render(screen());
    const text = textOf(tree);
    expect(text).toContain('Needs permission');
    expect(text).toContain('Enable');
    expect(text).toContain('Accessibility service, off');
    expect(text).toContain('Notification access, on');

    await act(async () => {
      byLabel(tree, 'Accessibility service, off').props.onPress();
    });
    expect(mockOpenAccessibility).toHaveBeenCalledTimes(1);
    await act(async () => {
      byLabel(tree, 'Notification access, on').props.onPress();
    });
    expect(mockOpenNotificationAccess).toHaveBeenCalledTimes(1);
  });

  it('lets the user pick Shizuku instead of the accessibility service', async () => {
    const value = autoTrack();
    mockUseAutoTrack.mockReturnValue(value);
    const tree = await render(screen());
    const text = textOf(tree);
    expect(text).toContain('How Paisa reads payments');
    const cards = tree.root
      .findAllByType(PressableScale)
      .filter(node => node.props.accessibilityRole === 'radio');
    expect(cards).toHaveLength(2);
    expect(cards.map(card => card.props.accessibilityState.selected)).toEqual([true, false]);
    await act(async () => {
      cards[1].props.onPress();
    });
    expect(value.setTrackingMethod).toHaveBeenCalledWith('shizuku');
    // The method already chosen is not set again.
    await act(async () => {
      cards[0].props.onPress();
    });
    expect(value.setTrackingMethod).toHaveBeenCalledTimes(1);
  });

  it('shows Shizuku instead of the accessibility service once Shizuku is picked', async () => {
    mockUseAutoTrack.mockReturnValue(autoTrack({status: SHIZUKU_ON}));
    const tree = await render(screen());
    const text = textOf(tree);
    expect(text).toContain('Active');
    expect(text).toContain('Permissions | Shizuku | On');
    expect(text).toContain('wireless debugging');
    expect(text).not.toContain('Accessibility service, ');
  });

  it('walks through each Shizuku setup step', async () => {
    const steps: [Partial<DetectorStatus>, string, jest.Mock][] = [
      [{shizukuState: 'not_installed'}, 'Shizuku, not installed', mockOpenShizuku],
      [{shizukuState: 'not_running'}, 'Shizuku, not running', mockOpenShizuku],
      [{shizukuState: 'no_permission'}, 'Shizuku, not allowed', mockRequestShizukuPermission],
      [{shizukuState: 'ready'}, 'Shizuku, stopped', mockStartShizukuCapture],
    ];
    for (const [patch, label, action] of steps) {
      mockUseAutoTrack.mockReturnValue(
        autoTrack({status: {...SHIZUKU_ON, shizukuCaptureRunning: false, ...patch}}),
      );
      const tree = await render(screen());
      expect(textOf(tree)).toContain('Needs setup');
      action.mockClear();
      await act(async () => {
        byLabel(tree, label).props.onPress();
      });
      expect(action).toHaveBeenCalledTimes(1);
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
    for (const absent of ['Permissions', 'Sync now', 'Transaction notes', 'Detected payments', 'Diagnostics']) {
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
      autoTrack({allowance: {...ALLOWANCE, spentToday: 2000, remainingToday: -200, remainingWeek: 7000}}),
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

    expect(toggle('Transaction notes').props.value).toBe(true);
    expect(toggle('Over-budget blocking').props.value).toBe(false);

    await act(async () => {
      toggle('Transaction notes').props.onValueChange(false);
    });
    expect(value.updatePrefs).toHaveBeenLastCalledWith({notesEnabled: false});

    await act(async () => {
      toggle('Over-budget blocking').props.onValueChange(true);
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
    expect(textOf(busy)).toContain('Syncing…');
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
  it('derives the state from platform and permissions', () => {
    expect(autoTrackState(false, null)).toBe('unavailable');
    expect(autoTrackState(true, null)).toBe('checking');
    expect(autoTrackState(true, BOTH_ON)).toBe('active');
    expect(autoTrackState(true, {...BOTH_ON, notificationAccessEnabled: false})).toBe('needs-permission');
  });

  it('counts Shizuku capture, not the accessibility service, when Shizuku is picked', () => {
    expect(autoTrackState(true, SHIZUKU_ON)).toBe('active');
    expect(autoTrackState(true, {...SHIZUKU_ON, accessibilityEnabled: true, shizukuCaptureRunning: false})).toBe(
      'needs-permission',
    );
    expect(autoTrackState(true, {...BOTH_ON, shizukuCaptureRunning: true, accessibilityEnabled: false})).toBe(
      'needs-permission',
    );
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
