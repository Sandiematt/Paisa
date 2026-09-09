import {colors} from '../../theme';
import {
  CategoryPreset,
  CurrencyPreset,
  GoalPreset,
  StepKey,
} from './types';

export const STEP_TITLES: Record<StepKey, {title: string; subtitle: string}> = {
  basics: {
    title: 'First, the basics',
    subtitle: 'We use your name on your reports and nothing else.',
  },
  money: {
    title: 'How do you count?',
    subtitle: 'Income helps us size your budget. You can add it later.',
  },
  goal: {
    title: "What's the goal?",
    subtitle: 'This decides what your home screen leads with.',
  },
  categories: {
    title: 'Pick your categories',
    subtitle: 'Choose at least three. You can edit these any time.',
  },
  budget: {
    title: 'Set a monthly budget',
    subtitle: 'A ceiling to measure against. Optional, and easy to change.',
  },
};

export const CURRENCIES: CurrencyPreset[] = [
  {code: 'INR', symbol: '\u20B9', label: 'Indian rupee'},
  {code: 'USD', symbol: '$', label: 'US dollar'},
  {code: 'EUR', symbol: '\u20AC', label: 'Euro'},
  {code: 'GBP', symbol: '\u00A3', label: 'British pound'},
  {code: 'AED', symbol: 'AED', label: 'UAE dirham'},
  {code: 'SGD', symbol: 'S$', label: 'Singapore dollar'},
];

export const GOALS: GoalPreset[] = [
  {
    id: 'track',
    title: 'Track my spending',
    description: 'See where the money went, category by category.',
    accent: colors.accent,
  },
  {
    id: 'save',
    title: 'Save more each month',
    description: 'Set a target and watch the gap close.',
    accent: colors.positive,
  },
  {
    id: 'split',
    title: 'Split bills with people',
    description: 'Shared costs, settled balances, no spreadsheet.',
    accent: colors.violet,
  },
];

export const CATEGORIES: CategoryPreset[] = [
  {id: 'housing', label: 'Housing', color: colors.accent},
  {id: 'dining', label: 'Dining', color: colors.coral},
  {id: 'groceries', label: 'Groceries', color: colors.teal},
  {id: 'shopping', label: 'Shopping', color: colors.positive},
  {id: 'transport', label: 'Transport', color: colors.violet},
  {id: 'bills', label: 'Bills', color: colors.slate},
  {id: 'health', label: 'Health', color: colors.coral},
  {id: 'travel', label: 'Travel', color: colors.teal},
  {id: 'subscriptions', label: 'Subscriptions', color: colors.accent},
  {id: 'education', label: 'Education', color: colors.violet},
];

export const MIN_CATEGORIES = 3;

export const DEFAULT_CATEGORY_IDS = ['housing', 'dining', 'groceries'];

export function currencyByCode(code: string): CurrencyPreset {
  return CURRENCIES.find(item => item.code === code) ?? CURRENCIES[0];
}

export function categoryById(id: string): CategoryPreset | undefined {
  return CATEGORIES.find(item => item.id === id);
}
