import {ColorToken, colors} from '../../theme';
import {
  BillPreset,
  CategoryPreset,
  CurrencyPreset,
  GoalPreset,
  StepKey,
} from './types';

export const STEP_TITLES: Record<StepKey, {title: string; subtitle: string}> = {
  whatsnew: {
    title: 'New in Paisa',
    subtitle:
      'A few things to set up once. Your account and everything in it stay as they are.',
  },
  basics: {
    title: 'First, the basics',
    subtitle: 'We use your name on your reports and nothing else.',
  },
  money: {
    title: 'How much is in the wallet?',
    subtitle: 'Starting balance is what you have now. Monthly income is what you expect to add.',
  },
  payday: {
    title: 'When does your salary land?',
    subtitle:
      'Pick the day it arrives. Paisa adds your income on that day every month, so your balance stays right without typing it in.',
  },
  bills: {
    title: 'Any fixed monthly bills?',
    subtitle:
      'Rent, EMIs, a mess, recharges. Each one is added on its due date every month and taken off your budget first.',
  },
  budget: {
    title: 'Savings and budget',
    subtitle: 'Say how much to save. Your budget is what your income leaves after bills and savings.',
  },
  autotrack: {
    title: 'Track UPI payments for you',
    subtitle:
      'Paisa can log what you pay in Google Pay, PhonePe and Paytm, so you never type an expense in again.',
  },
  lock: {
    title: 'Lock the app',
    subtitle:
      'Set it up now: your fingerprint, or a 4-digit PIN just for Paisa. It asks each time the app opens.',
  },
  done: {
    title: "You're all set",
    subtitle: 'Here is what Paisa will do for you. Change any of it in Profile.',
  },
};

/** Common fixed costs; the slug files each one under a default category. */
export const BILL_PRESETS: BillPreset[] = [
  {id: 'rent', label: 'Rent', slug: 'housing'},
  {id: 'emi', label: 'Loan EMI', slug: 'bills'},
  {id: 'phone', label: 'Recharge', slug: 'bills'},
  {id: 'internet', label: 'Wi-Fi', slug: 'bills'},
  {id: 'electricity', label: 'Electricity', slug: 'bills'},
  {id: 'ott', label: 'Streaming', slug: 'subscriptions'},
  {id: 'gym', label: 'Gym', slug: 'health'},
  {id: 'help', label: 'House help', slug: 'housing'},
  {id: 'insurance', label: 'Insurance', slug: 'health'},
  {id: 'tuition', label: 'Tuition', slug: 'education'},
];

/** Paydays offered as one-tap shortcuts above the calendar grid. */
export const PAYDAY_SHORTCUTS = [1, 7, 25, 31];

/** "1st", "22nd", ...; 31 reads as the last day, since short months clamp to it. */
export function dayLabel(day: number): string {
  if (day >= 31) {
    return 'Last day';
  }
  const tens = day % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th';
  return `${day}${suffix}`;
}

/** Paisa is for India, so rupees are the only currency. */
export const CURRENCIES: CurrencyPreset[] = [
  {code: 'INR', symbol: '\u20B9', label: 'Indian rupee'},
];

/**
 * Category and goal colours are palette roles read on access, so a preset
 * follows the active scheme instead of freezing on the one the app booted with.
 */
function category(id: string, label: string, role: ColorToken): CategoryPreset {
  return {
    id,
    label,
    get color() {
      return colors[role];
    },
  };
}

export const GOALS: GoalPreset[] = [
  {
    id: 'track',
    title: 'Track my spending',
    description: 'See where the money went, category by category.',
    get accent() {
      return colors.accent;
    },
  },
  {
    id: 'save',
    title: 'Save more each month',
    description: 'Set a target and watch the gap close.',
    get accent() {
      return colors.positive;
    },
  },
  {
    id: 'split',
    title: 'Split bills with people',
    description: 'Shared costs, settled balances, no spreadsheet.',
    get accent() {
      return colors.violet;
    },
  },
];

export const CATEGORIES: CategoryPreset[] = [
  category('housing', 'Housing', 'accent'),
  category('dining', 'Dining', 'coral'),
  category('groceries', 'Groceries', 'teal'),
  category('shopping', 'Shopping', 'positive'),
  category('transport', 'Transport', 'violet'),
  category('bills', 'Bills', 'slate'),
  category('health', 'Health', 'coral'),
  category('travel', 'Travel', 'teal'),
  category('subscriptions', 'Subscriptions', 'accent'),
  category('education', 'Education', 'violet'),
];

export const MIN_CATEGORIES = 3;

export const DEFAULT_CATEGORY_IDS = ['housing', 'dining', 'groceries'];

export function currencyByCode(code: string): CurrencyPreset {
  return CURRENCIES.find(item => item.code === code) ?? CURRENCIES[0];
}

export function categoryById(id: string): CategoryPreset | undefined {
  return CATEGORIES.find(item => item.id === id);
}
