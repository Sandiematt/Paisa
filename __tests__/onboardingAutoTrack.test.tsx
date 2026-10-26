import React from 'react';
import {Platform, Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {
  OnboardingController,
  useOnboarding,
} from '../src/features/onboarding/useOnboarding';

jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => [true, null]}));
jest.mock('../src/features/auth/AuthProvider', () => ({
  useAuth: () => ({user: null}),
}));

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

  it('adds a last auto-tracking step on Android with both toggles on', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mount();
    expect(flow.stepCount).toBe(6);
    expect(flow.draft.autoTrackNotes).toBe(true);
    expect(flow.draft.autoTrackBlocking).toBe(true);
  });

  it('leaves the flow unchanged where auto-tracking is unsupported', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mount();
    expect(flow.stepCount).toBe(5);
  });
});
