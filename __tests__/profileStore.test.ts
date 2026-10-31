import {User} from '@supabase/supabase-js';

import {OnboardingDraft} from '../src/features/onboarding/types';
import {monthlyBudgetOf} from '../src/lib/budgetPlan';
import {draftFromUser, loadProfile, profilePayload} from '../src/lib/profileStore';

jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => [true, null]}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async () => {}),
  getItem: jest.fn(async () => null),
  removeItem: jest.fn(async () => {}),
}));

// The row the sign-up trigger inserts: name and currency, nothing else.
const triggerRow = {
  id: 'user-1',
  name: 'Ananya',
  currency: 'INR',
  starting_balance: null,
  monthly_income: null,
  monthly_budget: null,
  monthly_savings_goal: null,
  goal: null,
  category_ids: [],
  avatar_url: null,
};
let mockRow: Record<string, unknown> = triggerRow;

jest.mock('../src/lib/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({maybeSingle: async () => ({data: mockRow, error: null})}),
      }),
    }),
  },
}));

const completed: OnboardingDraft = {
  name: 'Ananya',
  email: 'ananya@example.com',
  currency: 'INR',
  startingBalance: '',
  monthlyIncome: '',
  goal: 'track',
  categoryIds: [],
  monthlyBudget: '18000',
  monthlySavingsGoal: '',
  budgetCustom: true,
  payday: 1,
  bills: [],
};

const signedUp = (draft: OnboardingDraft) =>
  ({
    id: 'user-1',
    email: draft.email,
    app_metadata: {provider: 'email'},
    user_metadata: profilePayload(draft),
  }) as unknown as User;

describe('profile after onboarding', () => {
  beforeEach(() => {
    mockRow = triggerRow;
  });

  it('keeps the budget set in onboarding while the row is still the empty one from sign-up', async () => {
    const stored = await loadProfile('user-1');
    const draft = draftFromUser(signedUp(completed), stored);
    expect(monthlyBudgetOf(draft)).toBe(18000);
  });

  it('keeps a calculated budget too, which needs the income and savings goal', async () => {
    const calculated = {
      ...completed,
      monthlyIncome: '40000',
      monthlySavingsGoal: '5000',
      monthlyBudget: '',
      budgetCustom: false,
    };
    const stored = await loadProfile('user-1');
    const draft = draftFromUser(signedUp(calculated), stored);
    expect(monthlyBudgetOf(draft)).toBe(35000);
  });

  it('reads a saved profile from its row, even a budget cleared since sign-up', async () => {
    mockRow = {...triggerRow, goal: 'track', monthly_income: 40000, monthly_budget: null};
    const stored = await loadProfile('user-1');
    const draft = draftFromUser(signedUp(completed), {...stored!, budgetCustom: true});
    expect(draft.monthlyBudget).toBe('');
    expect(draft.monthlyIncome).toBe('40000');
  });
});
