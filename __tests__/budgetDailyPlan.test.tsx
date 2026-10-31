import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {ProgressBar} from '../src/components/ui';
import {BudgetDetailsScreen, billStatusLine} from '../src/features/home/BudgetDetailsScreen';
import {BudgetFacts, budgetForCycle} from '../src/lib/budgetInputs';
import {TransactionRow} from '../src/lib/transactionsStore';

// The font hook pulls in expo-font, which is not resolvable under jest here.
jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => [true, null]}));

// phosphor ships ~1500 icon modules; stub every icon as an empty component.
jest.mock('phosphor-react-native', () => new Proxy({}, {get: (_target, name) => (name === '__esModule' ? false : () => null)}));

jest.mock('react-native-safe-area-context', () => {
  const {View} = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
  };
});

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
    walk(node.children as ReactTestRenderer.ReactTestRendererNode[] | null);
  };
  walk(tree.toJSON());
  return parts.join('');
}

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}

afterEach(async () => {
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

function expense(id: string, amount: number, date: string): TransactionRow {
  return {
    id,
    userId: 'user-1',
    type: 'expense',
    amount,
    categoryId: null,
    description: null,
    merchant: null,
    paymentMethod: null,
    notes: null,
    kind: 'regular',
    isRecurring: false,
    transactionDate: date,
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
  };
}

function screen(overrides: Partial<React.ComponentProps<typeof BudgetDetailsScreen>>) {
  return (
    <BudgetDetailsScreen
      visible
      onClose={() => {}}
      currencySymbol="₹"
      budget={null}
      spent={0}
      slices={[]}
      {...overrides}
    />
  );
}

/** The progress bars inside the Daily limit card only. */
function planBars(tree: ReactTestRenderer.ReactTestRenderer) {
  const card = tree.root.findAll(node => node.props.testID === 'daily-plan')[0];
  return card.findAllByType(ProgressBar);
}

// Wednesday 14 Oct 2026, 18 days left today included. ₹31,000 budget, no
// bills or goal. ₹4,000 on the 3rd and ₹450 on Monday the 12th leave 26,550,
// so today's limit is 26,550 / 18 = 1,475: one limit for the month, rolling
// whatever earlier days left over all the days still to come.
const WEDNESDAY = '2026-10-14';
const LEDGER = [
  expense('a', 4000, '2026-10-03'),
  expense('b', 450, '2026-10-12'),
];

function budgetFor(
  rows: TransactionRow[],
  patch: Partial<BudgetFacts> = {},
  today = WEDNESDAY,
) {
  return budgetForCycle({total: 31000, savingsGoal: 0, transactions: rows, ...patch}, today);
}

describe('BudgetDetailsScreen daily limit', () => {
  it('shows today\'s rolling limit, what is left today and the month', async () => {
    const {state, bills} = budgetFor(LEDGER);
    const tree = await render(screen({budget: state, bills, transactions: LEDGER}));
    const text = textOf(tree);
    expect(text).toContain('Today you can spend');
    expect(text).toContain('₹1,475');
    expect(text).toContain('₹1,475 left today');
    expect(text).toContain('Left to spend this month');
    expect(text).toContain('₹26,550');
    expect(text).toContain('18 days left');
  });

  it('shows the week as the sum of its daily limits, not a cap', async () => {
    const {state} = budgetFor(LEDGER);
    const tree = await render(screen({budget: state}));
    const text = textOf(tree);
    expect(text).toContain('Spent this week');
    expect(text).toContain(`₹450 of ${'₹'}${state.week.total.toLocaleString('en-IN', {maximumFractionDigits: 0})}`);
    expect(planBars(tree)).toHaveLength(1);
  });

  it('marks today as over without blocking anything', async () => {
    const rows = [...LEDGER, expense('c', 2000, WEDNESDAY)];
    const {state} = budgetFor(rows);
    const text = textOf(await render(screen({budget: state})));
    expect(text).toContain("₹525 over today's limit");
    expect(text).not.toContain('Overspent');
  });

  it('shows an overspent month with a 0 limit, never a negative one', async () => {
    const rows = [...LEDGER, expense('c', 30000, '2026-10-13')];
    const {state} = budgetFor(rows);
    const text = textOf(await render(screen({budget: state})));
    expect(text).toContain('Overspent this month');
    expect(text).toContain('₹3,450');
    expect(text).toContain('Today you can spend₹0');
    expect(text).not.toContain('-₹');
  });

  it('counts payments detected but not synced yet', async () => {
    const {state} = budgetFor(LEDGER, {unsyncedSpend: {[WEDNESDAY]: 300}});
    const text = textOf(await render(screen({budget: state})));
    expect(text).toContain('Spent ₹300');
    expect(text).toContain('₹1,175 left today');
  });

  it('sets bills and the savings goal aside before the limit', async () => {
    const rent: TransactionRow = {
      ...expense('rent', 9000, '2026-10-01'),
      isRecurring: true,
      description: 'Rent',
    };
    const {state, bills} = budgetFor([...LEDGER, rent], {savingsGoal: 4000});
    const tree = await render(screen({budget: state, bills}));
    const text = textOf(tree);
    expect(text).toContain('₹18,000 to spend this month, after bills and savings');
    expect(text).toContain('Monthly bills');
    expect(text).toContain('Rent');
    expect(text).toContain('Paid');
    // (18,000 - 4,450) / 18
    expect(text).toContain('₹752');
  });

  it('waits for the 1st when the budget starts next month', async () => {
    const {state} = budgetFor([], {
      flow: {version: 1, trackingStart: '2026-11-01', alreadySpent: 0, startedOn: '2026-10-30', source: 'new'},
    }, '2026-10-30');
    const tree = await render(screen({budget: state}));
    const text = textOf(tree);
    expect(text).toContain('Your budget starts soon');
    expect(text).toContain('Tracking and daily limits begin on 1 Nov');
    expect(tree.root.findAll(node => node.props.testID === 'daily-plan')).toHaveLength(0);
  });

  it('asks to fix a budget that bills and the goal do not fit in', async () => {
    const {state} = budgetFor([], {total: 5000, pendingBills: [{key: 'rent', label: 'Rent', amount: 6000, date: '2026-10-20'}]});
    const onEditBudget = jest.fn();
    const tree = await render(screen({budget: state, onEditBudget}));
    expect(textOf(tree)).toContain('add up to more than your budget');
    expect(state.kind).toBe('invalid');
  });

  it('labels a partial month', async () => {
    const {state} = budgetFor([], {
      flow: {version: 1, trackingStart: '2026-10-14', alreadySpent: 0, startedOn: '2026-10-14', source: 'new'},
    });
    expect(textOf(await render(screen({budget: state})))).toContain('Partial month, tracked from 14 Oct');
  });

  it('hides the daily limit with no budget', async () => {
    const tree = await render(screen({budget: null}));
    expect(tree.root.findAll(node => node.props.testID === 'daily-plan')).toHaveLength(0);
    expect(textOf(tree)).toContain('Not set');
  });
});

describe('bill status lines', () => {
  const base = budgetFor([], {pendingBills: [{key: 'wifi', label: 'Wi-Fi', amount: 600, date: '2026-10-20'}]}).bills[0];

  it.each([
    [{status: 'upcoming' as const}, 'Due 20 Oct · added that day'],
    [{status: 'paid' as const, paid: 650}, 'Paid ₹650 (planned ₹600)'],
    [{status: 'paid' as const, paid: 600}, 'Paid'],
    [{status: 'notPaid' as const}, 'Not paid yet · set aside'],
    [{status: 'notPaid' as const, carried: true, cycleStart: '2026-09-01'}, 'Unpaid from 1 Sept · still set aside'],
    [{status: 'paidOutside' as const}, 'Paid outside Paisa'],
  ])('%o reads "%s"', (patch, line) => {
    const money = (amount: number) => `₹${amount}`;
    expect(billStatusLine({...base, ...patch}, money).text.replace('Sep ', 'Sept ')).toBe(
      line.replace('Sep ', 'Sept '),
    );
  });
});

