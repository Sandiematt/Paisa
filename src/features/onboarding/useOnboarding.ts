import {useCallback, useMemo, useState} from 'react';

import {DEFAULT_CATEGORY_IDS, MIN_CATEGORIES} from './constants';
import {OnboardingDraft, STEP_KEYS, StepKey, StepValidity} from './types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const INITIAL_DRAFT: OnboardingDraft = {
  name: '',
  email: '',
  currency: 'INR',
  monthlyIncome: '',
  goal: null,
  categoryIds: DEFAULT_CATEGORY_IDS,
  monthlyBudget: '',
};

export type OnboardingController = ReturnType<typeof useOnboarding>;

export function useOnboarding(onComplete: (draft: OnboardingDraft) => void) {
  const [draft, setDraft] = useState<OnboardingDraft>(INITIAL_DRAFT);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [showErrors, setShowErrors] = useState(false);

  const stepKey = STEP_KEYS[stepIndex];

  const update = useCallback(<K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => {
    setDraft(current => ({...current, [key]: value}));
  }, []);

  const toggleCategory = useCallback((id: string) => {
    setDraft(current => ({
      ...current,
      categoryIds: current.categoryIds.includes(id)
        ? current.categoryIds.filter(item => item !== id)
        : [...current.categoryIds, id],
    }));
  }, []);

  const errors = useMemo(() => {
    const next: Partial<Record<keyof OnboardingDraft, string>> = {};
    if (!draft.name.trim()) {
      next.name = 'We need something to call you.';
    }
    if (!EMAIL_PATTERN.test(draft.email.trim())) {
      next.email = 'That email address looks incomplete.';
    }
    if (draft.goal === null) {
      next.goal = 'Pick one so we know what to show you first.';
    }
    if (draft.categoryIds.length < MIN_CATEGORIES) {
      next.categoryIds = `Choose at least ${MIN_CATEGORIES} categories.`;
    }
    return next;
  }, [draft.categoryIds.length, draft.email, draft.goal, draft.name]);

  const validity = useMemo<Record<StepKey, StepValidity>>(
    () => ({
      basics: {
        canContinue: !errors.name && !errors.email,
        skippable: false,
      },
      money: {canContinue: true, skippable: true},
      goal: {canContinue: draft.goal !== null, skippable: false},
      categories: {
        canContinue: draft.categoryIds.length >= MIN_CATEGORIES,
        skippable: false,
      },
      budget: {canContinue: true, skippable: true},
    }),
    [draft.categoryIds.length, draft.goal, errors],
  );

  const current = validity[stepKey];
  const isLastStep = stepIndex === STEP_KEYS.length - 1;

  const advance = useCallback(() => {
    setDirection(1);
    setShowErrors(false);
    setStepIndex(index => {
      if (index >= STEP_KEYS.length - 1) {
        return index;
      }
      return index + 1;
    });
  }, []);

  const goNext = useCallback(() => {
    if (!current.canContinue) {
      setShowErrors(true);
      return;
    }
    if (isLastStep) {
      onComplete(draft);
      return;
    }
    advance();
  }, [advance, current.canContinue, draft, isLastStep, onComplete]);

  const goBack = useCallback(() => {
    setDirection(-1);
    setShowErrors(false);
    setStepIndex(index => Math.max(0, index - 1));
  }, []);

  const skip = useCallback(() => {
    if (isLastStep) {
      onComplete(draft);
      return;
    }
    advance();
  }, [advance, draft, isLastStep, onComplete]);

  return {
    draft,
    update,
    toggleCategory,
    stepKey,
    stepIndex,
    stepCount: STEP_KEYS.length,
    direction,
    progress: (stepIndex + 1) / STEP_KEYS.length,
    canContinue: current.canContinue,
    skippable: current.skippable,
    isLastStep,
    errors: showErrors ? errors : {},
    canGoBack: stepIndex > 0,
    goNext,
    goBack,
    skip,
  };
}
