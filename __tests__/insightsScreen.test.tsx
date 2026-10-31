import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {InsightsScreen} from '../src/features/insights/InsightsScreen';

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

jest.mock('../src/features/NavBar/FloatingNavScroll', () => ({
  useFloatingNavClearance: () => 120,
  useFloatingNavScroll: () => ({visible: true, onScroll: () => {}, scrollEventThrottle: 16}),
}));

const mockUseInsights = jest.fn();
jest.mock('../src/features/insights/useInsights', () => ({
  useInsights: (period: string) => mockUseInsights(period),
}));

/** All rendered text plus accessibility labels, flattened (toJSON itself is circular to stringify). */
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
    const label = node.props?.accessibilityLabel;
    if (typeof label === 'string') parts.push(label);
    walk(node.children as ReactTestRenderer.ReactTestRendererNode[] | null);
  };
  walk(tree.toJSON());
  return parts.join(' | ');
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
  // Unmount so the skeleton's looping animation stops and jest can exit.
  await act(async () => {
    mounted.splice(0).forEach(tree => tree.unmount());
  });
});

const noop = async () => {};

describe('InsightsScreen', () => {
  beforeEach(() => mockUseInsights.mockReset());

  it('shows an unavailable state, never example numbers, when the load fails', async () => {
    const reload = jest.fn(noop);
    mockUseInsights.mockReturnValue({
      data: null,
      status: 'error',
      error: 'Could not reach the server. Check your connection.',
      reload,
      refresh: noop,
    });
    const tree = await render(<InsightsScreen currencySymbol="₹" />);
    const json = textOf(tree);
    expect(json).toContain("You're offline");
    expect(json).toContain('Insights unavailable');
    expect(json).not.toContain('Where it went');
    expect(json).not.toContain('AI summary');
    // Insights is a root tab: there is no back button.
    expect(json).not.toContain('Go back');
    // There is nothing to share.
    const share = tree.root.findByProps({accessibilityLabel: 'Share this summary'});
    expect(share.props.accessibilityState).toEqual({disabled: true});

    const retry = tree.root.findByProps({accessibilityLabel: 'Retry loading insights'});
    await act(async () => retry.props.onPress());
    expect(reload).toHaveBeenCalled();
  });

  it('shows the skeleton while the first fetch is in flight', async () => {
    mockUseInsights.mockReturnValue({data: null, status: 'loading', error: null, reload: noop, refresh: noop});
    jest.useFakeTimers();
    const tree = await render(<InsightsScreen currencySymbol="₹" />);
    // Not shown immediately: fast loads must not flash a skeleton.
    expect(textOf(tree)).not.toContain('Loading insights');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    jest.useRealTimers();
    const json = textOf(tree);
    expect(json).toContain('Loading insights');
    expect(json).not.toContain('Where it went');
  });

  it('renders live data, including the year period tab and the empty state', async () => {
    const stats = {
      referenceDate: '2026-10-24',
      period: 'month',
      isPeriodComplete: false,
      currency: 'INR',
      periodComparison: {
        currentTotal: 0,
        previousTotal: 0,
        changeAmount: 0,
        changePercent: 0,
        direction: 'flat',
        changeKind: 'no-change',
      },
      categoryChanges: [],
      unusualSpending: [],
      recurringPayments: {items: [], currentTotal: 0, previousTotal: 0, changePercent: null},
      savingsProgress: {
        goalSet: false,
        monthlySavingsGoal: null,
        savedSoFarThisMonth: 0,
        percentOfGoal: null,
        projectedMonthEndSavings: null,
        onTrack: null,
      },
      patternChanges: [],
      trendBuckets: [],
    };
    mockUseInsights.mockReturnValue({
      data: {summary: 'All quiet.', highlights: [], stats, generatedAt: new Date().toISOString(), aiGenerated: true},
      status: 'ready',
      error: null,
      reload: noop,
      refresh: noop,
    });
    const tree = await render(<InsightsScreen currencySymbol="₹" />);
    const json = textOf(tree);
    expect(json).toContain('Spent in October');
    expect(json).toContain('No spending in October');
    expect(json).toContain('All quiet.');
    expect(json).toContain('Year');
    expect(json).not.toContain('Where it went');
    const share = tree.root.findByProps({accessibilityLabel: 'Share this summary'});
    expect(share.props.accessibilityState).toEqual({disabled: false});
  });

  it('renders the charts and categories for live month data', async () => {
    const stats = {
      referenceDate: '2026-10-24',
      period: 'month',
      isPeriodComplete: false,
      currency: 'INR',
      periodComparison: {
        currentTotal: 2000,
        previousTotal: 2500,
        changeAmount: -500,
        changePercent: -20,
        direction: 'down',
        changeKind: 'decrease',
      },
      categoryChanges: [],
      unusualSpending: [],
      recurringPayments: {items: [], currentTotal: 0, previousTotal: 0, changePercent: null},
      savingsProgress: {
        goalSet: false,
        monthlySavingsGoal: null,
        savedSoFarThisMonth: 0,
        percentOfGoal: null,
        projectedMonthEndSavings: null,
        onTrack: null,
      },
      patternChanges: [],
      trendBuckets: [
        {date: '2026-10-01', amount: 800, label: 'W1'},
        {date: '2026-10-08', amount: 1000, label: 'W2'},
        {date: '2026-10-15', amount: 200, label: 'W3'},
      ],
      transactionCount: 9,
      dailyAverage: 83.33,
      topSpendingWeekday: {label: 'Sat', amount: 700},
      monthlyBudget: 3100,
      categoryBreakdown: [
        {category: 'Dining', slug: 'dining', currentAmount: 1200, previousAmount: 1400},
        {category: 'Groceries', slug: 'groceries', currentAmount: 800, previousAmount: 1100},
      ],
    };
    mockUseInsights.mockReturnValue({
      data: {summary: 'Dining is down.', highlights: [], stats, generatedAt: new Date().toISOString(), aiGenerated: true},
      status: 'ready',
      error: null,
      reload: noop,
      refresh: noop,
    });
    const tree = await render(<InsightsScreen currencySymbol="₹" />);
    const json = textOf(tree);
    expect(json).toContain('₹500 (20%) less than September');
    expect(json).toContain('Spending by week');
    expect(json).toContain('₹700 pace');
    expect(json).toContain('This week');
    expect(json).toContain('Where it went');
    expect(json).toContain('Dining');
    expect(json).toContain('biggest day');
    expect(json).toContain('Sat');
  });
});
