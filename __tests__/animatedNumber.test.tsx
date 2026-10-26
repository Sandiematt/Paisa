import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {AnimatedNumber} from '../src/components/ui/AnimatedNumber';

// The font hook pulls in expo-font, which is not resolvable under jest here.
jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => [true, null]}));

const format = (value: number) => `₹${Math.round(value)}`;

let now = 0;
let queued: FrameRequestCallback[] = [];

beforeEach(() => {
  now = 0;
  queued = [];
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => {
    queued.push(callback);
    return queued.length;
  });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Advances the frame loop by `ms`, one frame at a time. */
function advance(ms: number) {
  const end = now + ms;
  while (now < end && queued.length > 0) {
    now += 16;
    const frame = queued.splice(0);
    act(() => frame.forEach(callback => callback(now)));
  }
}

function shownText(tree: ReactTestRenderer.ReactTestRenderer): string {
  return tree.root.findByType(Text).props.children;
}

async function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(element);
  });
  return tree;
}

describe('AnimatedNumber', () => {
  it('counts up from zero and lands exactly on the value', async () => {
    const tree = await render(<AnimatedNumber value={1200} format={format} durationMs={300} />);

    expect(shownText(tree)).toBe('₹0');
    advance(150);
    const midway = Number(shownText(tree).slice(1));
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(1200);

    advance(400);
    expect(shownText(tree)).toBe('₹1200');
    act(() => tree.unmount());
  });

  it('gives screen readers the final value while counting', async () => {
    const tree = await render(<AnimatedNumber value={500} format={format} />);
    expect(tree.root.findByType(Text).props.accessibilityLabel).toBe('₹500');
    act(() => tree.unmount());
  });

  it('starts a remount from the last value shown under the same key', async () => {
    const first = await render(
      <AnimatedNumber value={800} format={format} durationMs={200} memoryKey="test-balance" />,
    );
    advance(400);
    act(() => first.unmount());

    const second = await render(
      <AnimatedNumber value={800} format={format} durationMs={200} memoryKey="test-balance" />,
    );
    expect(shownText(second)).toBe('₹800');
    expect(queued).toHaveLength(0);
    act(() => second.unmount());
  });
});
