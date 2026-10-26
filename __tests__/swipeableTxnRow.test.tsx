import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {SwipeableTxnRow} from '../src/features/activity/SwipeableTxnRow';
import {ActivityTransaction} from '../src/features/activity/types';

// The font hook pulls in expo-font, which is not resolvable under jest here.
jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => [true, null]}));

// phosphor ships ~1500 icon modules; stub every icon as an empty component.
jest.mock('phosphor-react-native', () => new Proxy({}, {get: (_target, name) => (name === '__esModule' ? false : () => null)}));

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

const noop = () => {};

function item(note: string): ActivityTransaction {
  return {
    id: 'row-1',
    merchant: 'Cafe Mocha',
    category: 'Dining',
    categorySlug: 'dining',
    account: 'PhonePe',
    amount: -149.5,
    kind: 'expense',
    recurring: false,
    note,
    date: '2026-10-14',
  };
}

async function renderRow(note: string) {
  const tree = await render(
    <SwipeableTxnRow
      item={item(note)}
      currencySymbol="₹"
      open={false}
      onOpen={noop}
      onClose={noop}
      onEdit={noop}
      onDelete={noop}
      onToggleRecurring={noop}
      onDuplicate={noop}
    />,
  );
  // The swipe strip (and its accessibility label) mounts once the row is measured.
  const clip = tree.root.findAll(node => typeof node.props.onLayout === 'function')[0];
  await act(async () => {
    clip.props.onLayout({nativeEvent: {layout: {width: 360, height: 64, x: 0, y: 0}}});
  });
  return tree;
}

function noteNodes(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAll(node => node.props.testID === 'txn-note');
}

describe('SwipeableTxnRow note line', () => {
  it('shows the note under the category line, on one line, and reads it aloud', async () => {
    const tree = await renderRow('Chai with Ravi');
    expect(noteNodes(tree).length).toBeGreaterThan(0);
    const text = tree.root.findAll(
      node => node.props.children === 'Chai with Ravi' && node.props.numberOfLines === 1,
    );
    expect(text.length).toBeGreaterThan(0);
    const labelled = tree.root.findAll(
      node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('Cafe Mocha'),
    );
    expect(labelled[0].props.accessibilityLabel).toBe(
      'Cafe Mocha, Dining, -₹149.50, note: Chai with Ravi. Swipe for actions.',
    );
  });

  it('renders no note element, and the same label as before, without a note', async () => {
    for (const empty of ['', '   ']) {
      const tree = await renderRow(empty);
      expect(noteNodes(tree)).toHaveLength(0);
      const labelled = tree.root.findAll(
        node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('Cafe Mocha'),
      );
      expect(labelled[0].props.accessibilityLabel).toBe(
        'Cafe Mocha, Dining, -₹149.50. Swipe for actions.',
      );
    }
  });
});
