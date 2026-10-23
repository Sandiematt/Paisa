import {
  balanceFieldText,
  planProfileSave,
} from '../src/features/profile/profileSavePlan';
import {OnboardingDraft} from '../src/features/onboarding/types';

const original: OnboardingDraft = {
  name: 'Asha',
  email: 'asha@example.com',
  currency: 'INR',
  startingBalance: '1000',
  monthlyIncome: '50000',
  goal: null,
  categoryIds: [],
  monthlyBudget: '30000',
  monthlySavingsGoal: '5000',
};

const plan = (
  overrides: Partial<Parameters<typeof planProfileSave>[0]> = {},
) =>
  planProfileSave({
    draft: original,
    original,
    computedBalance: 1234.56,
    balanceText: '1234.56',
    balanceEdited: false,
    ...overrides,
  });

describe('balanceFieldText', () => {
  it('shows the exact balance with 2 decimals', () => {
    expect(balanceFieldText(1234.56)).toBe('1234.56');
    expect(balanceFieldText(1000)).toBe('1000.00');
  });
});

describe('planProfileSave', () => {
  it('has no target balance when the field was not edited, even for a non-integer balance', () => {
    expect(plan().options).toEqual({});
    expect(plan({balanceText: '1235'}).options).toEqual({});
  });

  it('targets the typed value when edited to a different value', () => {
    expect(
      plan({balanceText: '2000.5', balanceEdited: true}).options,
    ).toEqual({targetWalletBalance: 2000.5});
  });

  it('has no target when edited back to the same value', () => {
    expect(plan({balanceEdited: true}).options).toEqual({});
    expect(
      plan({balanceText: '1234.560', balanceEdited: true}).options,
    ).toEqual({});
  });

  it('accepts thousands separators in the typed balance', () => {
    expect(
      plan({balanceText: '2,000.50', balanceEdited: true}).options,
    ).toEqual({targetWalletBalance: 2000.5});
  });

  it('has no target when edited text is blank or invalid', () => {
    expect(plan({balanceText: '', balanceEdited: true}).options).toEqual({});
    expect(plan({balanceText: 'abc', balanceEdited: true}).options).toEqual({});
  });

  it('never changes the currency', () => {
    const result = plan({draft: {...original, currency: 'USD', name: 'Bo'}});
    expect(result.draft.currency).toBe('INR');
    expect(result.draft.name).toBe('Bo');
  });
});
