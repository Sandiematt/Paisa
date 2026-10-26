import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {StyleSheet, View} from 'react-native';

import {
  loadSeenSections,
  markSectionSeen,
  resetTutorial,
} from '../../lib/tutorialStore';
import {TutorialOverlay} from './TutorialOverlay';
import {
  Rect,
  stepsFor,
  TUTORIAL_SECTIONS,
  TutorialSection,
  TutorialStep,
  TutorialTargetId,
} from './tutorialSteps';

type TargetNode = React.ComponentRef<typeof View>;
type TargetRef = React.RefObject<TargetNode | null>;

type TutorialContextValue = {
  active: boolean;
  register: (id: TutorialTargetId, ref: TargetRef) => () => void;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

// Leaves a screen a moment to draw (and a tab swap to finish) before its tips
// cover it. Switching away before then cancels them.
const START_DELAY_MS = 700;
// Later steps are on the same, settled screen: measure on the next frame.
const NEXT_STEP_MS = 16;
// A view that never reports its position (unmounted mid-measure, say) must
// not hold the tips on the previous step; show this one unhighlighted.
const MEASURE_TIMEOUT_MS = 300;

/** A step's spotlight, tagged with the step it was measured for. */
export type Measurement = {stepId: string; rect: Rect | null};

type TutorialProviderProps = {
  children: React.ReactNode;
  /** The signed-in account; each screen's tips show once per account. */
  userId: string | null;
  userMetadata?: Record<string, unknown> | null;
  /** The screen the user is on. Its tips start the first time it is shown. */
  tab: TutorialSection;
  /** True once the screen has data, so tips never cover a spinner. */
  ready: boolean;
  /** True while a sheet or full-screen page is open; tips wait for it to close. */
  blocked?: boolean;
  /** The step on screen, or null when no tips are showing. */
  onStepChange?: (step: TutorialStep | null) => void;
  /** Bump to show every screen's tips again (Settings → Replay). */
  restartKey?: number;
};

export function TutorialProvider({
  children,
  userId,
  userMetadata,
  tab,
  ready,
  blocked = false,
  onStepChange,
  restartKey = 0,
}: TutorialProviderProps) {
  const targets = useRef(new Map<TutorialTargetId, TargetRef>());
  const rootRef = useRef<TargetNode>(null);
  const [seen, setSeen] = useState<Set<TutorialSection> | null>(null);
  const [tour, setTour] = useState<{
    section: TutorialSection;
    index: number;
  } | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const stepChange = useRef(onStepChange);
  stepChange.current = onStepChange;
  const metadata = useRef(userMetadata);
  metadata.current = userMetadata;

  const steps = useMemo(() => (tour ? stepsFor(tour.section) : []), [tour]);
  const step = tour ? steps[tour.index] ?? null : null;

  const register = useCallback((id: TutorialTargetId, ref: TargetRef) => {
    targets.current.set(id, ref);
    return () => {
      if (targets.current.get(id) === ref) {
        targets.current.delete(id);
      }
    };
  }, []);

  // Which screens this account has already seen.
  useEffect(() => {
    setSeen(null);
    setTour(null);
    if (!userId) {
      return;
    }
    let cancelled = false;
    loadSeenSections(userId, TUTORIAL_SECTIONS, metadata.current).then(
      found => {
        if (!cancelled) {
          setSeen(found);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Replay: forget every screen, so each shows its tips on the next visit,
  // starting with the one the user is on.
  useEffect(() => {
    if (restartKey === 0 || !userId) {
      return;
    }
    setTour(null);
    setSeen(new Set());
    resetTutorial(userId, TUTORIAL_SECTIONS);
  }, [restartKey, userId]);

  // The first visit to a screen starts that screen's tips, and only those.
  useEffect(() => {
    if (!ready || blocked || !seen || tour || seen.has(tab)) {
      return;
    }
    const timer = setTimeout(
      () => setTour({section: tab, index: 0}),
      START_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [blocked, ready, seen, tab, tour]);

  // Measure what the step spotlights. The overlay keeps showing the previous
  // step until this lands, so moving between steps never blanks the screen.
  useEffect(() => {
    stepChange.current?.(step);
    if (!step) {
      setMeasurement(null);
      return;
    }
    if (!step.target) {
      setMeasurement({stepId: step.id, rect: null});
      return;
    }
    let cancelled = false;
    const done = (rect: Rect | null) => {
      if (!cancelled) {
        cancelled = true;
        setMeasurement({stepId: step.id, rect});
      }
    };
    const measure = () => {
      const node = targets.current.get(step.target!)?.current;
      const root = rootRef.current;
      if (
        typeof node?.measureInWindow !== 'function' ||
        typeof root?.measureInWindow !== 'function'
      ) {
        done(null);
        return;
      }
      root.measureInWindow((rootX: number, rootY: number) => {
        node.measureInWindow(
          (x: number, y: number, width: number, height: number) => {
            done({x: x - rootX, y: y - rootY, width, height});
          },
        );
      });
    };
    const timer = setTimeout(measure, NEXT_STEP_MS);
    const fallback = setTimeout(() => done(null), MEASURE_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(fallback);
    };
  }, [step]);

  const end = useCallback(() => {
    if (!tour) {
      return;
    }
    const {section} = tour;
    setTour(null);
    setSeen(current => new Set([...(current ?? []), section]));
    if (userId) {
      markSectionSeen(userId, section);
    }
  }, [tour, userId]);

  const next = useCallback(() => {
    setTour(current =>
      current && current.index < stepsFor(current.section).length - 1
        ? {...current, index: current.index + 1}
        : current,
    );
  }, []);

  const back = useCallback(() => {
    setTour(current =>
      current && current.index > 0
        ? {...current, index: current.index - 1}
        : current,
    );
  }, []);

  const value = useMemo(
    () => ({active: tour !== null, register}),
    [register, tour],
  );

  return (
    <TutorialContext.Provider value={value}>
      <View ref={rootRef} style={styles.fill} collapsable={false}>
        {children}
        {step && tour ? (
          <TutorialOverlay
            step={step}
            index={tour.index}
            total={steps.length}
            measurement={measurement}
            onNext={next}
            onBack={back}
            onSkip={end}
            onFinish={end}
          />
        ) : null}
      </View>
    </TutorialContext.Provider>
  );
}

/** Whether tips are showing. Safe outside a provider. */
export function useTutorial() {
  const value = useContext(TutorialContext);
  return {active: value?.active ?? false};
}

/**
 * Marks a view as a spotlight target. Put the returned ref on a View with
 * `collapsable={false}` so Android keeps it measurable.
 */
export function useTutorialTarget(id: TutorialTargetId) {
  const value = useContext(TutorialContext);
  const ref = useRef<TargetNode>(null);
  const register = value?.register;
  useEffect(() => (register ? register(id, ref) : undefined), [id, register]);
  return ref;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
