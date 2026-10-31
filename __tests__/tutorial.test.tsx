import React from 'react';
import {View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactTestRenderer, {act} from 'react-test-renderer';

import {
  TutorialProvider,
  useTutorialTarget,
} from '../src/features/tutorial/TutorialProvider';
import {
  placeCard,
  stepsFor,
  TUTORIAL_SECTIONS,
  TUTORIAL_STEPS,
  TutorialSection,
  visibleRect,
} from '../src/features/tutorial/tutorialSteps';
import {
  loadSeenSections,
  markSectionSeen,
  resetTutorial,
} from '../src/lib/tutorialStore';

jest.mock('../src/theme/useAppFonts', () => ({
  useAppFonts: () => [true, null],
}));

jest.mock('react-native-safe-area-context', () => {
  const {View: RNView} = require('react-native');
  return {
    SafeAreaView: RNView,
    useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
  };
});

const mockUpdateUser = jest.fn(async (_: unknown) => ({data: {}, error: null}));
jest.mock('../src/lib/supabase/client', () => ({
  supabase: {auth: {updateUser: (arg: unknown) => mockUpdateUser(arg)}},
}));

const HOME = stepsFor('home');
const ACTIVITY = stepsFor('activity');

function textOf(tree: ReactTestRenderer.ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (
    node:
      | ReactTestRenderer.ReactTestRendererNode
      | null
      | ReactTestRenderer.ReactTestRendererNode[],
  ) => {
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
  return parts.join(' | ');
}

function press(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  const target = tree.root.find(
    node =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  );
  act(() => target.props.onPress());
}

/** Advances past the next-frame measure, so the pressed step lands. */
async function settle(ms = 400) {
  // Two passes: timers that start the tips schedule the measuring timers.
  for (let pass = 0; pass < 2; pass += 1) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }
}

function Target() {
  const ref = useTutorialTarget('home.balance');
  return <View ref={ref} collapsable={false} />;
}

type Props = Partial<React.ComponentProps<typeof TutorialProvider>>;

function element(props: Props, onStepChange: jest.Mock) {
  return (
    <TutorialProvider
      userId="u1"
      tab="home"
      ready
      onStepChange={onStepChange}
      {...props}>
      <Target />
    </TutorialProvider>
  );
}

async function renderProvider(props: Props = {}) {
  const onStepChange = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(element(props, onStepChange));
  });
  // Let the "seen" lookup resolve, then the start delay and measure fire.
  await settle(1500);
  const rerender = async (next: Props) => {
    await act(async () => {
      tree.update(element({...props, ...next}, onStepChange));
    });
    await settle(1500);
  };
  return {tree, onStepChange, rerender};
}

beforeEach(async () => {
  jest.useFakeTimers();
  mockUpdateUser.mockClear();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('tutorial steps', () => {
  it('gives every screen its own tips, Home opening with a welcome', () => {
    const ids = TUTORIAL_STEPS.map(step => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of TUTORIAL_SECTIONS) {
      expect(stepsFor(section).length).toBeGreaterThan(0);
    }
    expect(HOME[0]).toMatchObject({id: 'welcome', target: null});
  });

  it('explains the budget and the daily limit on Home, with simple numbers', () => {
    const ids = HOME.map(step => step.id);
    expect(ids).toEqual(
      expect.arrayContaining(['budget-how', 'daily-limit', 'daily-limit-changes', 'goals']),
    );
    // The example adds up: 9,000 - 5,000 bills - 2,000 savings = 2,000; over 30 days about 66 a day.
    expect(HOME.find(step => step.id === 'budget-how')?.body).toContain('₹2,000 left over');
    expect(HOME.find(step => step.id === 'daily-limit')?.body).toContain('about ₹66 a day');
  });

  it('places the card below a target, above when it would not fit, else centred', () => {
    const insets = {top: 40, bottom: 30};
    expect(
      placeCard({x: 0, y: 100, width: 100, height: 50}, 800, 200, insets),
    ).toEqual({top: 166, placement: 'below'});
    expect(
      placeCard({x: 0, y: 650, width: 100, height: 60}, 800, 200, insets),
    ).toEqual({top: 434, placement: 'above'});
    expect(placeCard(null, 800, 200, insets)).toEqual({
      top: 300,
      placement: 'center',
    });
  });

  it('only spotlights targets that are on screen', () => {
    const screen = {width: 400, height: 800};
    expect(
      visibleRect({x: 10, y: 10, width: 50, height: 50}, screen),
    ).not.toBeNull();
    expect(
      visibleRect({x: 10, y: 900, width: 50, height: 50}, screen),
    ).toBeNull();
    expect(
      visibleRect({x: 10, y: 10, width: 0, height: 50}, screen),
    ).toBeNull();
    expect(visibleRect(null, screen)).toBeNull();
  });
});

describe('tutorialStore', () => {
  const all = TUTORIAL_SECTIONS;

  it('remembers each screen separately, on the device and the account', async () => {
    expect(await loadSeenSections('u1', all, {})).toEqual(new Set());
    await markSectionSeen('u1', 'home', new Date('2026-10-26T10:00:00Z'));
    expect(await loadSeenSections('u1', all, null)).toEqual(new Set(['home']));
    expect(await loadSeenSections('u2', all, null)).toEqual(new Set());
    expect(mockUpdateUser).toHaveBeenCalledWith({
      data: {tutorial_home_seen_at: '2026-10-26T10:00:00.000Z'},
    });
    expect(
      await loadSeenSections('u3', all, {tutorial_insights_seen_at: 'x'}),
    ).toEqual(new Set(['insights']));
  });

  it('treats the old single-tour flag as every screen seen', async () => {
    expect(
      await loadSeenSections('u1', all, {tutorial_completed_at: 'x'}),
    ).toEqual(new Set(all));
  });

  it('still saves on the device when the account update fails', async () => {
    mockUpdateUser.mockRejectedValueOnce(new Error('offline'));
    await markSectionSeen('u2', 'activity');
    expect(await loadSeenSections('u2', all, null)).toEqual(
      new Set(['activity']),
    );
  });

  it('reset forgets every screen on the device and the account', async () => {
    await markSectionSeen('u1', 'home');
    await markSectionSeen('u1', 'activity');
    await resetTutorial('u1', all);
    expect(await loadSeenSections('u1', all, null)).toEqual(new Set());
    expect(mockUpdateUser).toHaveBeenLastCalledWith({
      data: {
        tutorial_completed_at: null,
        tutorial_home_seen_at: null,
        tutorial_activity_seen_at: null,
        tutorial_insights_seen_at: null,
      },
    });
  });
});

describe('TutorialProvider', () => {
  it('shows only Home tips on Home, with Next and Back', async () => {
    const {tree} = await renderProvider();

    expect(textOf(tree)).toContain('Welcome to Paisa');
    expect(textOf(tree)).toContain(`1 of ${HOME.length}`);

    press(tree, 'Next step');
    await settle();
    expect(textOf(tree)).toContain(HOME[1].title);

    press(tree, 'Previous step');
    await settle();
    expect(textOf(tree)).toContain('Welcome to Paisa');
  });

  it('keeps the current step on screen until the next one is ready', async () => {
    const {tree} = await renderProvider();
    press(tree, 'Next step');
    // Before the next step is measured, the card still shows step 1, not a blank.
    expect(textOf(tree)).toContain('Welcome to Paisa');
    await settle();
    expect(textOf(tree)).toContain(HOME[1].title);
    expect(textOf(tree)).not.toContain('Welcome to Paisa');
  });

  it('never moves to another screen on its own', async () => {
    const {tree, onStepChange} = await renderProvider();
    for (let i = 0; i < HOME.length - 1; i += 1) {
      press(tree, 'Next step');
      await settle();
    }
    press(tree, 'Finish tour');
    await settle(3000);

    expect(textOf(tree)).toBe('');
    const sections = onStepChange.mock.calls
      .map(([step]) => step?.section)
      .filter(Boolean);
    expect(new Set(sections)).toEqual(new Set(['home']));
    expect(await loadSeenSections('u1', TUTORIAL_SECTIONS, null)).toEqual(
      new Set(['home']),
    );
  });

  it("starts a screen's tips the first time the user opens it", async () => {
    await markSectionSeen('u1', 'home');
    const {tree, rerender} = await renderProvider();
    expect(textOf(tree)).toBe('');

    await rerender({tab: 'activity'});
    expect(textOf(tree)).toContain(ACTIVITY[0].title);
    // A single tip has no counter or Skip, just Finish.
    expect(textOf(tree)).not.toContain('1 of 1');
    expect(() => press(tree, 'Skip tour')).toThrow();
    press(tree, 'Finish tour');
    await settle();

    expect(textOf(tree)).toBe('');
    await rerender({tab: 'home'});
    await rerender({tab: 'activity'});
    expect(textOf(tree)).toBe('');
  });

  it('Skip ends a screen’s tips and remembers them', async () => {
    const {tree} = await renderProvider();
    press(tree, 'Skip tour');
    await settle();

    expect(textOf(tree)).toBe('');
    const seen = await loadSeenSections('u1', TUTORIAL_SECTIONS, null);
    expect(seen.has('home')).toBe(true);
    expect(seen.has('activity')).toBe(false);
  });

  it('cancels if the user leaves the screen before the tips start', async () => {
    const onStepChange = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(element({}, onStepChange));
    });
    await settle(300);
    await act(async () => {
      tree.update(element({tab: 'insights' as TutorialSection}, onStepChange));
    });
    await settle(1500);
    expect(textOf(tree)).toContain(stepsFor('insights')[0].title);
    expect(textOf(tree)).not.toContain('Welcome to Paisa');
  });

  it('waits while something is open on top of the screen', async () => {
    const {tree, rerender} = await renderProvider({blocked: true});
    expect(textOf(tree)).toBe('');
    await rerender({blocked: false});
    expect(textOf(tree)).toContain('Welcome to Paisa');
  });

  it('waits until the screen is ready', async () => {
    const {tree} = await renderProvider({ready: false});
    expect(textOf(tree)).toBe('');
  });

  it("Replay shows the current screen's tips again, and the others on their next visit", async () => {
    for (const section of TUTORIAL_SECTIONS) {
      await markSectionSeen('u1', section);
    }
    const {tree, rerender} = await renderProvider();
    expect(textOf(tree)).toBe('');

    await rerender({restartKey: 1});
    expect(textOf(tree)).toContain('Welcome to Paisa');
    press(tree, 'Skip tour');
    await settle();

    await rerender({tab: 'insights'});
    expect(textOf(tree)).toContain(stepsFor('insights')[0].title);
  });
});
