import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {ProgressBar} from '../src/components/ui';
import {BudgetDetailsScreen} from '../src/features/home/BudgetDetailsScreen';
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
      budget={31000}
      spent={0}
      remainingBudget={31000}
      spendRatio={0}
      overBudget={false}
      slices={[]}
      monthlyBudget={31000}
      {...overrides}
    />
  );
}

/** The progress bars inside the Daily plan card only. */
function planBars(tree: ReactTestRenderer.ReactTestRenderer) {
  const card = tree.root.findAll(node => node.props.testID === 'daily-plan')[0];
  return card.findAllByType(ProgressBar);
}

// Wednesday 14 Oct 2026. The week runs Mon 12 to Sun 18 (5 days left, today
// included). October has 31 / 7 weeks, so 31,000 a month is 7,000 a week and
// 1,000 a day. Spending before the week does not change that while the month
// has money left. 450 already went on Monday, which still leaves more than
// 1,000 a day for the rest of the week, so today's limit is 1,000.
const WEDNESDAY = new Date(2026, 9, 14);
const LEDGER = [
  expense('a', 4000, '2026-10-03'),
  expense('b', 450, '2026-10-12'),
];

describe('BudgetDetailsScreen daily plan', () => {
  it('shows the daily limit and what is left when under it', async () => {
    const tree = await render(
      screen({
        today: WEDNESDAY,
        transactions: [...LEDGER, expense('c', 600, '2026-10-14')],
      }),
    );
    const text = textOf(tree);
    expect(text).toContain('Daily plan');
    expect(text).toContain('Today you can spend');
    expect(text).toContain('Today you can spend₹1,000');
    expect(text).toContain('Spent today ₹600 · ₹400 left today');
    expect(text).toContain('This week ₹7,000 · ₹5,950 left · 5 days to go');
    expect(text).toContain('₹31,000 a month over 4.43 weeks: ₹7,000 a week, ₹1,000 a day');
    expect(text).toContain(
      'Your monthly budget is shared across the weeks of the month. Overspending lowers the coming days; unspent money is not added to them.',
    );
    expect(text).not.toContain("Over today's limit");
    expect(planBars(tree)[0].props.gradient).toBe('primary');
  });

  it('turns over-limit when today goes past the limit', async () => {
    const tree = await render(
      screen({
        today: WEDNESDAY,
        transactions: [...LEDGER, expense('c', 2000, '2026-10-14')],
      }),
    );
    const text = textOf(tree);
    expect(text).toContain("Spent today ₹2,000 · Over today's limit by ₹1,000");
    // The week as a whole still has room: 7,000 - 450 - 2,000.
    expect(text).toContain('This week ₹7,000 · ₹4,550 left');
    expect(planBars(tree)[0].props.gradient).toBe('primary');
  });

  it('turns the week bar rose when the whole week is overspent', async () => {
    const tree = await render(
      screen({
        today: WEDNESDAY,
        transactions: [...LEDGER, expense('c', 7450, '2026-10-14')],
      }),
    );
    expect(textOf(tree)).toContain('This week ₹7,000 · ₹900 over · 5 days to go');
    expect(planBars(tree)[0].props.gradient).toBe('rose');
  });

  it('counts detected payments that have not synced yet', async () => {
    const tree = await render(
      screen({
        today: WEDNESDAY,
        transactions: LEDGER,
        extraSpendByDate: {'2026-10-14': 300},
      }),
    );
    expect(textOf(tree)).toContain('Spent today ₹300 · ₹700 left today');
  });

  it('is hidden when no monthly budget is set', async () => {
    const tree = await render(
      screen({
        today: WEDNESDAY,
        monthlyBudget: 0,
        budget: 0,
        remainingBudget: 0,
        transactions: LEDGER,
      }),
    );
    const text = textOf(tree);
    expect(text).not.toContain('Daily plan');
    expect(text).not.toContain('Today you can spend');
  });

  it('is hidden when the screen is closed', async () => {
    const tree = await render(
      screen({visible: false, today: WEDNESDAY, transactions: LEDGER}),
    );
    expect(textOf(tree)).not.toContain('Daily plan');
  });

  it('splits the last week of the month at the month end', async () => {
    // Thursday 29 Oct. The week (Mon 26 to Sun 1 Nov) is clipped to Oct 26-31:
    // 6 days at 1,000 a day, 3 left including today. 1,000 went on Monday, so
    // 5,000 is left over 3 days, but a day never gets more than 1,000.
    const tree = await render(
      screen({
        today: new Date(2026, 9, 29),
        transactions: [
          expense('a', 25000, '2026-10-05'),
          expense('b', 1000, '2026-10-26'),
          // Next month does not touch October's plan.
          expense('c', 777, '2026-11-01'),
        ],
      }),
    );
    const text = textOf(tree);
    expect(text).toContain('Today you can spend₹1,000');
    expect(text).toContain('This week ₹6,000 · ₹5,000 left · 3 days to go');
    expect(text).toContain('Spent today ₹0 · ₹1,000 left today');
  });

  it('splits the monthly budget into weeks, not one week of the whole month', async () => {
    // Wednesday 28 Oct with nothing spent all month: 1,000 / (31 / 7) weeks is
    // 225.81 a week and 32.26 a day. The clipped last week (26-31 Oct, 6 days)
    // gets 193.55, not the whole 1,000 that is still unspent.
    const tree = await render(
      screen({
        today: new Date(2026, 9, 28),
        budget: 1000,
        remainingBudget: 1000,
        monthlyBudget: 1000,
        transactions: [],
      }),
    );
    const text = textOf(tree);
    expect(text).toContain('Today you can spend₹32');
    expect(text).toContain('This week ₹194 · ₹194 left · 4 days to go');
    expect(text).toContain('₹1,000 a month over 4.43 weeks: ₹226 a week, ₹32 a day');
  });

  it('says 1 day to go on the last day of the week', async () => {
    const tree = await render(
      screen({
        today: new Date(2026, 9, 31),
        transactions: [expense('a', 25000, '2026-10-05')],
      }),
    );
    // Saturday 31 Oct is the only day of its (clipped) week left.
    expect(textOf(tree)).toContain('1 day to go');
  });
});
