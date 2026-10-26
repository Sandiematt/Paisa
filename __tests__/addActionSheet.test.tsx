import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {AddActionSheet} from '../src/features/add/AddActionSheet';

jest.mock('../src/theme/useAppFonts', () => ({
  useAppFonts: () => [true, null],
}));

// phosphor ships ~1500 icon modules; stub every icon as an empty component.
jest.mock(
  'phosphor-react-native',
  () =>
    new Proxy(
      {},
      {get: (_target, name) => (name === '__esModule' ? false : () => null)},
    ),
);

jest.mock('react-native-safe-area-context', () => {
  const {View} = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
  };
});

describe('AddActionSheet', () => {
  it('offers income, expense and receipt scanning', async () => {
    const onSelect = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <AddActionSheet visible onClose={() => {}} onSelect={onSelect} />,
      );
    });

    for (const [label, choice] of [
      ['Add income', 'income'],
      ['Add expense', 'expense'],
      ['Scan receipt', 'scan'],
    ] as const) {
      const option = tree.root.find(
        node =>
          node.props.accessibilityLabel === label &&
          typeof node.props.onPress === 'function',
      );
      act(() => option.props.onPress());
      expect(onSelect).toHaveBeenLastCalledWith(choice);
    }
    await act(async () => tree.unmount());
  });
});
