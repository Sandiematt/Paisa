import {ActivityTransaction} from './types';

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Stand-in ledger so the Activity layout can ship before persistence exists.
 * Amounts are in the user's major currency unit.
 */
export const SAMPLE_TRANSACTIONS: ActivityTransaction[] = [
  {
    id: 't1',
    merchant: 'Whole Foods',
    category: 'Groceries',
    account: 'Everyday ...4021',
    amount: -48.2,
    kind: 'expense',
    recurring: false,
    note: 'Weekly shop',
    date: isoDaysAgo(0),
  },
  {
    id: 't2',
    merchant: 'Uber',
    category: 'Transport',
    account: 'Everyday ...4021',
    amount: -12.4,
    kind: 'expense',
    recurring: false,
    note: '',
    date: isoDaysAgo(0),
  },
  {
    id: 't3',
    merchant: 'Starbucks',
    category: 'Dining',
    account: 'Amex ...3009',
    amount: -6.75,
    kind: 'expense',
    recurring: false,
    note: '',
    date: isoDaysAgo(0),
  },
  {
    id: 't4',
    merchant: 'Venmo',
    category: 'Income',
    account: 'Everyday ...4021',
    amount: 7.2,
    kind: 'income',
    recurring: false,
    note: 'Coffee split',
    date: isoDaysAgo(0),
  },
  {
    id: 't5',
    merchant: 'Netflix',
    category: 'Subscriptions',
    account: 'Amex ...3009',
    amount: -15.99,
    kind: 'expense',
    recurring: true,
    note: '',
    date: isoDaysAgo(1),
  },
  {
    id: 't6',
    merchant: 'Equinox',
    category: 'Health',
    account: 'Everyday ...4021',
    amount: -89,
    kind: 'expense',
    recurring: true,
    note: 'Membership',
    date: isoDaysAgo(1),
  },
  {
    id: 't7',
    merchant: 'Target',
    category: 'Shopping',
    account: 'Everyday ...4021',
    amount: -37.14,
    kind: 'expense',
    recurring: false,
    note: '',
    date: isoDaysAgo(1),
  },
  {
    id: 't8',
    merchant: 'ACME Payroll',
    category: 'Income',
    account: 'Everyday ...4021',
    amount: 3120,
    kind: 'income',
    recurring: true,
    note: 'Salary',
    date: isoDaysAgo(3),
  },
  {
    id: 't9',
    merchant: 'Shell',
    category: 'Transport',
    account: 'Amex ...3009',
    amount: -41.2,
    kind: 'expense',
    recurring: false,
    note: 'Fuel',
    date: isoDaysAgo(3),
  },
];
