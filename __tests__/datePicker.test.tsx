import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {DatePickerSheet} from '../src/features/add/DatePickerSheet';
import {
  isAfterDay,
  longDateLabel,
  monthHasPastDays,
  monthWeeks,
  quickPicks,
  relativeDayLabel,
  shortDateLabel,
} from '../src/features/add/datePickerModel';

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

const TODAY = new Date(2026, 9, 26); // Mon 26 Oct 2026

describe('datePickerModel', () => {
  it('offers today, yesterday and the day before by name', () => {
    expect(
      quickPicks(TODAY).map(pick => [pick.label, pick.date.getDate()]),
    ).toEqual([
      ['Today', 26],
      ['Yesterday', 25],
      ['Sat', 24],
    ]);
  });

  it('labels dates in full, adding the year only when it differs', () => {
    expect(longDateLabel(new Date(2026, 9, 24), TODAY)).toBe(
      'Saturday, 24 October',
    );
    expect(longDateLabel(new Date(2025, 11, 31), TODAY)).toBe(
      'Wednesday, 31 December 2025',
    );
    expect(shortDateLabel(new Date(2026, 9, 26), TODAY)).toBe('Mon, 26 Oct');
    expect(shortDateLabel(new Date(2025, 0, 5), TODAY)).toBe('Sun, 5 Jan 2025');
  });

  it('says how recent a day is, for the last week', () => {
    expect(relativeDayLabel(TODAY, TODAY)).toBe('Today');
    expect(relativeDayLabel(new Date(2026, 9, 25), TODAY)).toBe('Yesterday');
    expect(relativeDayLabel(new Date(2026, 9, 22), TODAY)).toBe('4 days ago');
    expect(relativeDayLabel(new Date(2026, 8, 1), TODAY)).toBeNull();
  });

  it('keeps future days and months out of reach', () => {
    expect(isAfterDay(new Date(2026, 9, 27), TODAY)).toBe(true);
    expect(isAfterDay(new Date(2026, 9, 26, 23, 0), TODAY)).toBe(false);
    expect(monthHasPastDays(new Date(2026, 9, 1), TODAY)).toBe(true);
    expect(monthHasPastDays(new Date(2026, 10, 1), TODAY)).toBe(false);
  });

  it('lays a month out in Sunday-first weeks', () => {
    const weeks = monthWeeks(new Date(2026, 9, 1));
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(weeks[0][4]?.getDate()).toBe(1);
    expect(weeks.every(week => week.length === 7)).toBe(true);
  });
});

describe('DatePickerSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 26, 12, 0));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function find(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
    return tree.root.find(
      node =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === 'function',
    );
  }

  async function render(value: Date) {
    const onChange = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <DatePickerSheet
          visible
          value={value}
          onClose={() => {}}
          onChange={onChange}
        />,
      );
    });
    return {tree, onChange};
  }

  const button = (tree: ReactTestRenderer.ReactTestRenderer) =>
    tree.root.find(
      node =>
        typeof node.props.label === 'string' &&
        node.props.label.startsWith('Use '),
    );

  it('names the chosen day and confirms it', async () => {
    const {tree, onChange} = await render(new Date(2026, 9, 26));
    expect(button(tree).props.label).toBe('Use Mon, 26 Oct');

    act(() => find(tree, 'Yesterday').props.onPress());
    expect(button(tree).props.label).toBe('Use Sun, 25 Oct');
    act(() => button(tree).props.onPress());
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 9, 25));
  });

  it('browsing months keeps the chosen day', async () => {
    const {tree} = await render(new Date(2026, 9, 20));
    act(() => find(tree, 'Previous month').props.onPress());
    expect(button(tree).props.label).toBe('Use Tue, 20 Oct');
    act(() => find(tree, 'Saturday, 12 September').props.onPress());
    expect(button(tree).props.label).toBe('Use Sat, 12 Sep');
  });

  it('cannot move past the current month or pick a future day', async () => {
    const {tree} = await render(new Date(2026, 9, 26));
    expect(find(tree, 'Next month').props.disabled).toBe(true);
    expect(find(tree, 'Tuesday, 27 October').props.disabled).toBe(true);
  });

  it('jumps by month and year from the month grid', async () => {
    const {tree} = await render(new Date(2026, 9, 26));
    act(() =>
      find(tree, 'October 2026. Choose month and year').props.onPress(),
    );
    expect(find(tree, 'November 2026').props.disabled).toBe(true);
    act(() => find(tree, 'Previous year').props.onPress());
    act(() => find(tree, 'March 2025').props.onPress());
    act(() => find(tree, 'Saturday, 15 March 2025').props.onPress());
    expect(button(tree).props.label).toBe('Use Sat, 15 Mar 2025');
  });
});
