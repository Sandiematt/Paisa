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
  async function toBills(today?: string) {
    mount({checkEmail: async () => false, today});
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

  it('mid-month, asks which bills already past their due day are paid', async () => {
    // Joining on 15 October: rent was due on the 5th, so it next comes on 5 November.
    await toBills('2026-10-15');
    act(() => {
      flow.update('monthlyIncome', '25000');
      flow.update('bills', [{id: 'rent', label: 'Rent', slug: 'housing', amount: '15000', day: 5}]);
    });
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('budget');
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('budget');
    expect(flow.errors.billsPaid).toMatch(/each of these bills/);

    act(() => {
      flow.update('billsPaid', {'onboarding:bill:rent': false});
    });
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).not.toBe('budget');
    // Not yet paid: it stays set aside this month until it is.
    const [rent] = scheduleFromDraft(flow.draft, '2026-10-15');
    expect(rent).toMatchObject({date: '2026-11-05', notPaidSince: '2026-10-15'});
  });

  it('does not ask in the last days of the month: the budget starts on the 1st', async () => {
    await toBills('2026-10-30');
    act(() => {
      flow.update('monthlyIncome', '25000');
      flow.update('bills', [{id: 'rent', label: 'Rent', slug: 'housing', amount: '15000', day: 5}]);
    });
    await act(async () => {
      await flow.goNext();
    });
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).not.toBe('budget');
    expect(flow.errors.billsPaid).toBeUndefined();
  });

  it('starting now in the last days asks about paid bills like mid-month', async () => {
    await toBills('2026-10-30');
    act(() => {
      flow.update('monthlyIncome', '25000');
      flow.update('bills', [{id: 'rent', label: 'Rent', slug: 'housing', amount: '15000', day: 5}]);
      flow.update('startNow', true);
    });
    await act(async () => {
      await flow.goNext();
    });
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('budget');
    expect(flow.errors.billsPaid).toMatch(/each of these bills/);
  });

  it('will not continue while bills and the goal take more than the budget', async () => {
    await toBills('2026-11-01');
    act(() => {
      flow.update('monthlyIncome', '9000');
      flow.update('monthlySavingsGoal', '2000');
      flow.update('bills', [{id: 'rent', label: 'Rent', slug: 'housing', amount: '8000', day: 5}]);
    });
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('budget');
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('budget');
    expect(flow.errors.monthlyBudget).toMatch(/more than this budget/);
    // Exactly enough is allowed: a 0 daily limit, with a gentle notice.
    act(() => {
      flow.update('monthlySavingsGoal', '1000');
    });
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).not.toBe('budget');
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

  it('only confirms the budget for an account that already set payday, bills and a lock', () => {
    mount({mode: 'upgrade', passwordless: true, upgradeFrom: 2});
    expect(flow.stepKey).toBe('whatsnew');
    expect(flow.stepCount).toBe(3);
  });

  it('checks the budget against the bills the account already has', async () => {
    mount({
      mode: 'upgrade',
      passwordless: true,
      upgradeFrom: 2,
      today: '2026-11-10',
      knownBills: [{key: 'ledger:rent', label: 'Rent', amount: 15000}],
      initialDraft: {monthlyIncome: '', monthlyBudget: '10000', budgetCustom: true},
    });
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('budget');
    await act(async () => {
      await flow.goNext();
    });
    expect(flow.stepKey).toBe('budget');
    expect(flow.errors.monthlyBudget).toBeDefined();
  });

  it('restarts with the setup again after a long absence, values filled in', () => {
    mount({mode: 'restart', passwordless: true, initialDraft: {monthlyIncome: '30000'}});
    expect(flow.stepKey).toBe('whatsnew');
    expect(flow.stepCount).toBe(3);
    expect(flow.draft.monthlyIncome).toBe('30000');
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
    // Round 3 is the rolling budget: accounts on round 2 see What's new once.
    expect(setupIsCurrent({user_metadata: {setupVersion: 2}} as never)).toBe(false);
    expect(setupIsCurrent({user_metadata: {setupVersion: 3}} as never)).toBe(true);
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
