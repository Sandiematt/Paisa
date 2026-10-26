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
// included). October has 31 days, so with 4,000 spent before the week the week
// budget is (31,000 - 4,000) * 7 / 20 = 9,450. 450 already went on Monday, so
// today's limit is (9,450 - 450) / 5 = 1,800.
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
    expect(text).toContain('₹1,800');
    expect(text).toContain('Spent today ₹600 · ₹1,200 left today');
    expect(text).toContain('This week ₹9,450 · ₹8,400 left · 5 days to go');
    expect(text).toContain(
      'Unspent money rolls into the rest of the week; overspending lowers the coming days.',
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
    expect(text).toContain("Spent today ₹2,000 · Over today's limit by ₹200");
    // The week as a whole still has room: 9,450 - 450 - 2,000.
    expect(text).toContain('This week ₹9,450 · ₹7,000 left');
    expect(planBars(tree)[0].props.gradient).toBe('primary');
  });

  it('turns the week bar rose when the whole week is overspent', async () => {
    const tree = await render(
      screen({
        today: WEDNESDAY,
        transactions: [...LEDGER, expense('c', 10450, '2026-10-14')],
      }),
    );
    expect(textOf(tree)).toContain('This week ₹9,450 · ₹1,450 over · 5 days to go');
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
    expect(textOf(tree)).toContain('Spent today ₹300 · ₹1,500 left today');
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
    // 6 days, 3 left including today. With 25,000 spent before the week the
    // week budget is 6,000, minus 1,000 already spent on Monday, over 3 days.
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
    expect(text).toContain('₹1,667');
    expect(text).toContain('This week ₹6,000 · ₹5,000 left · 3 days to go');
    expect(text).toContain('Spent today ₹0 · ₹1,667 left today');
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
