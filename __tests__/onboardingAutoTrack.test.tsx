import React from 'react';
import {NativeModules, Platform, Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {AutoTrackStep} from '../src/features/onboarding/steps/AutoTrackStep';
import {
  OnboardingController,
  useOnboarding,
} from '../src/features/onboarding/useOnboarding';

jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => [true, null]}));
jest.mock('../src/features/auth/AuthProvider', () => ({
  useAuth: () => ({user: null}),
}));
// phosphor ships ~1500 icon modules; stub every icon as an empty component.
jest.mock('phosphor-react-native', () => new Proxy({}, {get: (_target, name) => (name === '__esModule' ? false : () => null)}));

const stub = NativeModules.UpiDetector as unknown as Record<string, jest.Mock>;

function statusJson(patch: Record<string, unknown>) {
  return JSON.stringify({
    accessibilityEnabled: false,
    notificationAccessEnabled: false,
    installedApps: [],
    trackingMethod: 'accessibility',
    shizukuState: 'not_installed',
    shizukuCaptureRunning: false,
    ...patch,
  });
}

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

async function renderStep() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <AutoTrackStep draft={{autoTrackNotes: true, autoTrackBlocking: false} as never} onChange={jest.fn()} />,
    );
  });
  return tree;
}

let flow: OnboardingController;
function Probe() {
  flow = useOnboarding(() => {});
  return <Text>{flow.stepKey}</Text>;
}

function mount() {
  act(() => {
    ReactTestRenderer.create(<Probe />);
  });
}

describe('onboarding auto-tracking step', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.replaceProperty(Platform, 'OS', 'ios');
  });

  it('adds an auto-tracking step on Android with both toggles on', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mount();
    expect(flow.stepCount).toBe(8);
    expect(flow.draft.autoTrackNotes).toBe(true);
    expect(flow.draft.autoTrackBlocking).toBe(true);
  });

  it('shows the same setup as the app: method switch, numbered steps, toggles', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    stub.getStatus.mockResolvedValue(statusJson({}));
    const tree = await renderStep();
    const text = textOf(tree);
    expect(text).toContain('Standard setup');
    expect(text).toContain('Shizuku setup');
    expect(text).toContain('Step 1, Allow screen reading, required, not done');
    expect(text).toContain('Step 2, Payment alerts, optional, not done');
    expect(text).toContain('Ask for a note');
    // In onboarding there is no "last payment" line or Back button.
    expect(text).not.toContain('Sync now');
    await act(async () => tree.unmount());
    stub.getStatus.mockReset();
  });

  it('shows the success state once payment screens can be read', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    stub.getStatus.mockResolvedValue(statusJson({accessibilityEnabled: true, notificationAccessEnabled: true}));
    const tree = await renderStep();
    const text = textOf(tree);
    expect(text).toContain("You're all set!");
    expect(text).toContain('Overspend warnings, off');
    expect(text).not.toContain('Step 1,');
    // The onboarding footer moves on; no extra "Back to Paisa" here.
    expect(text).not.toContain('Back to Paisa');
    await act(async () => tree.unmount());
    stub.getStatus.mockReset();
  });

  it('leaves the flow unchanged where auto-tracking is unsupported', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mount();
    expect(flow.stepCount).toBe(7);
  });
});
