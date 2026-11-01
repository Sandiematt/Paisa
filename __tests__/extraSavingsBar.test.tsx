import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {ProgressBar} from '../src/components/ui';
import {extraSavingsShare} from '../src/features/home/budgetCopy';
import {SavingsDetailsScreen} from '../src/features/home/SavingsDetailsScreen';
import {MonthState} from '../src/lib/budgetEngine';
import {budgetForCycle} from '../src/lib/budgetInputs';
import {EMPTY_HISTORY} from '../src/lib/budgetMonths';
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

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function render(budget: MonthState | null) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <SavingsDetailsScreen
        visible
        onClose={() => {}}
        currencySymbol="₹"
        budget={budget}
        monthlySavingsGoal={4000}
        history={EMPTY_HISTORY}
        keptExtra={0}
        range="month"
      />,
    );
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

// ₹24,000 budget with a ₹4,000 goal: ₹20,000 to spend in November.
function stateWith(rows: TransactionRow[], today = '2026-11-10'): MonthState {
  return budgetForCycle({total: 24000, savingsGoal: 4000, transactions: rows}, today).state;
}

function meter(tree: ReactTestRenderer.ReactTestRenderer) {
  const found = tree.root.findAll(node => node.props.testID === 'extra-savings-meter');
  return found.length > 0 ? found[0].findByType(ProgressBar).props.progress : null;
}

function textOf(tree: ReactTestRenderer.ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestRendererJSON | string | null | (ReactTestRenderer.ReactTestRendererJSON | string)[]) => {
    if (node === null) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'string') {
      parts.push(node);
      return;
    }
    walk(node.children as (ReactTestRenderer.ReactTestRendererJSON | string)[] | null);
  };
  walk(tree.toJSON());
  return parts.join('');
}

describe('extra savings bar', () => {
  it('starts full while nothing is spent', async () => {
    const tree = await render(stateWith([]));
    expect(meter(tree)).toBe(1);
    expect(textOf(tree)).toContain('₹20,000 of ₹20,000 still unspent');
  });

  it('drains as spending comes in, to what is really left', async () => {
    const some = stateWith([expense('a', 5000, '2026-11-03')]);
    const more = stateWith([expense('a', 5000, '2026-11-03'), expense('b', 7000, '2026-11-09')]);
    const someTree = await render(some);
    const moreTree = await render(more);
    expect(meter(someTree)).toBeCloseTo(0.75, 5);
    expect(meter(moreTree)).toBeCloseTo(0.4, 5);
    expect(textOf(moreTree)).toContain('₹8,000 of ₹20,000 still unspent');
  });

  it('counts what was spent today', async () => {
    const tree = await render(stateWith([expense('a', 2000, '2026-11-10')]));
    expect(meter(tree)).toBeCloseTo(0.9, 5);
  });

  it('is empty once the month is overspent, and never below empty', async () => {
    const state = stateWith([expense('a', 21000, '2026-11-04')]);
    expect(state.overspent).toBe(true);
    expect(meter(await render(state))).toBe(0);
  });

  it('is not shown before the budget starts or without one', async () => {
    const waiting = budgetForCycle(
      {
        total: 24000,
        savingsGoal: 4000,
        transactions: [],
        flow: {version: 1, trackingStart: '2026-12-01', alreadySpent: 0, startedOn: '2026-11-29', source: 'new'},
      },
      '2026-11-29',
    ).state;
    expect(meter(await render(waiting))).toBeNull();
    expect(meter(await render(null))).toBeNull();
  });
});

describe('extraSavingsShare', () => {
  it('is what is left of the day-to-day money, from 0 to 1', () => {
    expect(extraSavingsShare({kind: 'active', spendable: 1000, projectedExtra: 250})).toBe(0.25);
    expect(extraSavingsShare({kind: 'active', spendable: 1000, projectedExtra: 1500})).toBe(1);
    expect(extraSavingsShare({kind: 'active', spendable: 0, projectedExtra: 0})).toBe(0);
    expect(extraSavingsShare({kind: 'waiting', spendable: 1000, projectedExtra: 1000})).toBe(0);
  });
});
