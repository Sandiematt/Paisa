import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {
  OnboardingController,
  OnboardingOptions,
  useOnboarding,
} from '../src/features/onboarding/useOnboarding';
import {hashPin, makePinRecord, pinMatches} from '../src/lib/biometricLock';
import {firstMissedRule, passwordMeetsRules} from '../src/lib/passwordRules';
import {scheduleFromDraft, setupIsCurrent} from '../src/lib/scheduledSetup';

jest.mock('expo-local-authentication', () => ({}));
jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => [true, null]}));
jest.mock('../src/features/auth/AuthProvider', () => ({
  useAuth: () => ({user: null}),
}));

let flow: OnboardingController;
function Probe(props: OnboardingOptions) {
  flow = useOnboarding(() => {}, props);
  return <Text>{flow.stepKey}</Text>;
}

function mount(options: OnboardingOptions = {}) {
  act(() => {
    ReactTestRenderer.create(<Probe {...options} />);
  });
}

function fillBasics(password = 'Paisa@2026') {
  act(() => {
    flow.update('name', 'Ananya');
    flow.update('email', 'ananya@example.com');
    flow.update('password', password);
    flow.update('confirmPassword', password);
  });
}

describe('password rules', () => {
  it('needs length, both cases, a number and a symbol', () => {
    expect(passwordMeetsRules('Paisa@2026')).toBe(true);
    expect(firstMissedRule('Pa@1')?.id).toBe('length');
    expect(firstMissedRule('paisa@2026')?.id).toBe('upper');
    expect(firstMissedRule('PAISA@2026')?.id).toBe('lower');
    expect(firstMissedRule('Paisa@paisa')?.id).toBe('digit');
    expect(firstMissedRule('Paisa2026')?.id).toBe('symbol');
  });
});

describe('basics step', () => {
  it('blocks a weak password', async () => {
    mount({checkEmail: async () => false});
    fillBasics('paisa2026');
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('basics');
    expect(flow.errors.password).toBe('Password needs a capital letter.');
  });

  it('stops on the first step when the email already has an account', async () => {
    const checkEmail = jest.fn(async () => true);
    mount({checkEmail});
    fillBasics();
    await act(async () => {
      await flow.goNext();
    });
    expect(checkEmail).toHaveBeenCalledWith('ananya@example.com');
    expect(flow.stepKey).toBe('basics');
    expect(flow.errors.email).toMatch(/already uses this email/);
  });

  it('carries on when the email is free or the check cannot answer', async () => {
    mount({checkEmail: async () => null});
    fillBasics();
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('money');
  });
});

describe('bills step', () => {
  async function toBills() {
    mount({checkEmail: async () => false});
    fillBasics();
    for (let step = 0; step < 3; step += 1) {
      await act(async () => {
        await flow.goNext();
      });
    }
    expect(flow.stepKey).toBe('bills');
  }

  it('asks for the due date of every bill', async () => {
    await toBills();
    act(() => {
      flow.update('bills', [{id: 'rent', label: 'Rent', slug: 'housing', amount: '18000', day: null}]);
    });
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('bills');
    expect(flow.errors.bills).toBe('Pick the due date for every bill.');

    act(() => {
      flow.update('bills', [{id: 'rent', label: 'Rent', slug: 'housing', amount: '18000', day: 5}]);
    });
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('budget');
  });

  it('skipping drops half-filled bills', async () => {
    await toBills();
    act(() => {
      flow.update('bills', [{id: 'emi', label: 'Loan EMI', slug: 'bills', amount: '', day: null}]);
    });
    act(() => {
      flow.skip();
    });
    expect(flow.stepKey).toBe('budget');
    expect(flow.draft.bills).toEqual([]);
  });

  it('schedules a custom bill on its own due date', () => {
    const entries = scheduleFromDraft(
      {
        name: 'A',
        email: 'a@b.co',
        currency: 'INR',
        startingBalance: '',
        monthlyIncome: '',
        goal: null,
        categoryIds: [],
        monthlyBudget: '',
        monthlySavingsGoal: '',
        bills: [
          {id: 'custom-1', label: ' Car EMI ', slug: 'bills', amount: '12000', day: 7, custom: true},
        ],
      },
      '2026-10-29',
    );
    expect(entries).toEqual([
      expect.objectContaining({
        ref: 'onboarding:bill:custom-1',
        description: 'Car EMI',
        amount: 12000,
        date: '2026-11-07',
      }),
    ]);
  });
});

describe('catch-up flow for existing accounts', () => {
  it('asks only the new steps, and leaves out the lock when one is set', () => {
    mount({mode: 'upgrade', passwordless: true, skipLock: false});
    expect(flow.stepKey).toBe('whatsnew');
    expect(flow.stepCount).toBe(6);
    mount({mode: 'upgrade', passwordless: true, skipLock: true});
    expect(flow.stepCount).toBe(5);
  });

  it('"Not now" on the first screen leaves the flow', () => {
    const onDismiss = jest.fn();
    mount({mode: 'upgrade', passwordless: true, onDismiss});
    act(() => {
      flow.skip();
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it('sign-up never shows the what-is-new screen', () => {
    mount({checkEmail: async () => false});
    expect(flow.stepKey).toBe('basics');
  });

  it('marks accounts by setup version', () => {
    expect(setupIsCurrent(null)).toBe(false);
    expect(setupIsCurrent({user_metadata: {}} as never)).toBe(false);
    expect(setupIsCurrent({user_metadata: {setupVersion: 2}} as never)).toBe(true);
  });
});

describe('app PIN', () => {
  it('stores a salted hash that only the same PIN matches', () => {
    const record = makePinRecord('2580');
    expect(record.hash).not.toContain('2580');
    expect(pinMatches(record, '2580')).toBe(true);
    expect(pinMatches(record, '2581')).toBe(false);
    expect(hashPin('2580', 'a')).not.toBe(hashPin('2580', 'b'));
  });
});
