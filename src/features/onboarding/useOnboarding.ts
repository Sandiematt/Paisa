import {useCallback, useMemo, useState} from 'react';

import {useAuth} from '../auth/AuthProvider';
import {DEFAULT_CATEGORY_IDS, MIN_CATEGORIES} from './constants';
import {OnboardingDraft, STEP_KEYS, StepKey, StepValidity} from './types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const INITIAL_DRAFT: OnboardingDraft = {
  name: '',
  email: '',
  currency: 'INR',
  startingBalance: '',
  monthlyIncome: '',
  goal: null,
  categoryIds: DEFAULT_CATEGORY_IDS,
  monthlyBudget: '',
  monthlySavingsGoal: '',
};

export type OnboardingController = ReturnType<typeof useOnboarding>;

export type OnboardingOptions = {
  initialDraft?: Partial<OnboardingDraft>;
  /** OAuth sign-ups already have an account, so no password is collected. */
  passwordless?: boolean;
};

/**
 * Pull name, email, and avatar straight from the Supabase auth user metadata.
 * Google OAuth stores the display name as `full_name` and the photo as
 * `avatar_url` or `picture`.
 */
function draftFromAuthUser(
  user: {email?: string; user_metadata?: Record<string, unknown>} | null,
): Partial<OnboardingDraft> {
  if (!user) {
    return {};
  }
  const meta = user.user_metadata ?? {};
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');

  const name =
    str(meta.full_name) ||
    str(meta.name) ||
    str(meta.display_name) ||
    displayNameFromEmail(user.email);
  const email = user.email || str(meta.email);
  const avatarUrl = str(meta.avatar_url) || str(meta.picture) || undefined;

  return {name, email, avatarUrl};
}

function displayNameFromEmail(email?: string): string {
  if (!email) {
    return '';
  }
  const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!local) {
    return '';
  }
  return local.replace(/\b\w/g, letter => letter.toUpperCase());
}

export function useOnboarding(
  onComplete: (draft: OnboardingDraft) => void | Promise<void>,
  {initialDraft, passwordless = false}: OnboardingOptions = {},
) {
  // Read the auth user directly from context so we always have the latest
  // Google metadata, regardless of prop-drilling timing.
  const {user} = useAuth();

  const [draft, setDraft] = useState<OnboardingDraft>(() => {
    const base = {...INITIAL_DRAFT, ...initialDraft};
    if (passwordless && user) {
      // Merge Google metadata on top, but don't overwrite anything already
      // provided by initialDraft.
      const fromAuth = draftFromAuthUser(user);
      return {
        ...base,
        name: base.name || fromAuth.name || '',
        email: base.email || fromAuth.email || '',
        avatarUrl: base.avatarUrl || fromAuth.avatarUrl,
      };
    }
    return base;
  });

  // For OAuth (passwordless) users, name/email come from Google — skip basics.
  const firstStep = passwordless ? 1 : 0;
  const [stepIndex, setStepIndex] = useState(firstStep);
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
    if (!passwordless && (draft.password ?? '').length < 6) {
      next.password = 'Use at least 6 characters.';
    }
    if (draft.goal === null) {
      next.goal = 'Pick one so we know what to show you first.';
    }
    if (draft.categoryIds.length < MIN_CATEGORIES) {
      next.categoryIds = `Choose at least ${MIN_CATEGORIES} categories.`;
    }
    return next;
  }, [
    draft.categoryIds.length,
    draft.email,
    draft.goal,
    draft.name,
    draft.password,
    passwordless,
  ]);

  const validity = useMemo<Record<StepKey, StepValidity>>(
    () => ({
      basics: {
        canContinue: !errors.name && !errors.email && !errors.password,
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
    setStepIndex(index => Math.max(firstStep, index - 1));
  }, [firstStep]);

  const skip = useCallback(() => {
    if (isLastStep) {
      onComplete(draft);
      return;
    }
    advance();
  }, [advance, draft, isLastStep, onComplete]);

  return {
    draft,
    passwordless,
    update,
    toggleCategory,
    stepKey,
    stepIndex,
    visibleStepIndex: stepIndex - firstStep,
    stepCount: STEP_KEYS.length - firstStep,
    direction,
    progress: (stepIndex - firstStep + 1) / (STEP_KEYS.length - firstStep),
    canContinue: current.canContinue,
    skippable: current.skippable,
    isLastStep,
    errors: showErrors ? errors : {},
    canGoBack: stepIndex > firstStep,
    goNext,
    goBack,
    skip,
  };
}
