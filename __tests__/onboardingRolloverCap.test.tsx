import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {BudgetStep} from '../src/features/onboarding/steps/BudgetStep';
import {OnboardingDraft} from '../src/features/onboarding/types';
import {saveProfile, withoutRolloverCap} from '../src/lib/profileStore';
import {saveRolloverCap} from '../src/lib/rolloverCap';

jest.mock('expo-local-authentication', () => ({}));
jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => [true, null]}));
jest.mock('../src/features/auth/AuthProvider', () => ({
  useAuth: () => ({user: null}),
}));
// phosphor ships ~1500 icon modules; stub every icon as an empty component.
jest.mock('phosphor-react-native', () => new Proxy({}, {get: (_target, name) => (name === '__esModule' ? false : () => null)}));
jest.mock('../src/lib/supabase/client', () => ({
  supabase: {from: () => ({upsert: async () => ({error: null})})},
}));
jest.mock('../src/lib/rolloverCap', () => ({saveRolloverCap: jest.fn(async () => {})}));
jest.mock('../src/lib/transactionsStore', () => ({
  ...jest.requireActual('../src/lib/transactionsStore'),
  seedOpeningBalance: jest.fn(async () => {}),
}));

const draft: OnboardingDraft = {
  name: 'Ananya',
  email: 'ananya@example.com',
  currency: 'INR',
  startingBalance: '',
  monthlyIncome: '50000',
  goal: 'track',
  categoryIds: [],
  monthlyBudget: '30000',
  monthlySavingsGoal: '5000',
  payday: 1,
  logSalary: true,
  bills: [],
  appLock: null,
  autoTrackNotes: true,
  autoTrackBlocking: true,
  rolloverCap: null,
};

function pill(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root.find(node => node.props.label === label && typeof node.props.onPress === 'function');
}

describe('rollover cap in onboarding', () => {
  it('offers no cap and each cap on the budget step', async () => {
    const onChange = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <BudgetStep draft={draft} errors={{}} onChange={onChange} today="2026-11-10" />,
      );
    });

    expect(pill(tree, 'No cap').props.selected).toBe(true);
    act(() => pill(tree, '2× a usual day').props.onPress());
    expect(onChange).toHaveBeenCalledWith('rolloverCap', 2);
    act(() => pill(tree, 'No cap').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith('rolloverCap', null);
    await act(async () => tree.unmount());
  });

  it('saves the picked cap with the profile', async () => {
    await saveProfile('user-1', {...draft, rolloverCap: 1.5});
    expect(saveRolloverCap).toHaveBeenCalledWith('user-1', 1.5);
  });

  it('a held draft no longer carries the cap, so a later save leaves it alone', async () => {
    (saveRolloverCap as jest.Mock).mockClear();
    const held = withoutRolloverCap({...draft, rolloverCap: 3});
    expect('rolloverCap' in held).toBe(false);
    await saveProfile('user-1', held);
    expect(saveRolloverCap).not.toHaveBeenCalled();
  });
});
