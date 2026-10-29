import {useCallback, useMemo, useState} from 'react';

import {isAutoTrackSupported} from '../../lib/autotrack/nativeUpiDetector';
import {emailRegistered} from '../../lib/emailRegistered';
import {firstMissedRule} from '../../lib/passwordRules';
import {useAuth} from '../auth/AuthProvider';
import {DEFAULT_CATEGORY_IDS} from './constants';
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
  payday: null,
  logSalary: true,
  bills: [],
  appLock: null,
  autoTrackNotes: true,
  autoTrackBlocking: true,
};

export type OnboardingController = ReturnType<typeof useOnboarding>;

export type OnboardingOptions = {
  /**
   * 'upgrade' catches an existing account up on the steps added since it
   * signed up (payday, bills, budget, lock), starting with what is new.
   */
  mode?: 'signup' | 'upgrade';
  /** Upgrade only: the account already has a lock, so that step is left out. */
  skipLock?: boolean;
  /** Upgrade only: "Not now" on the first screen leaves the flow. */
  onDismiss?: () => void;
  /** Whether an account already uses an email; null when unknown. Tests swap it. */
  checkEmail?: (email: string) => Promise<boolean | null>;
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
  {
    initialDraft,
    passwordless = false,
    checkEmail = emailRegistered,
    mode = 'signup',
    skipLock = false,
    onDismiss,
  }: OnboardingOptions = {},
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

  const upgrade = mode === 'upgrade';
  // For OAuth (passwordless) users, name/email come from Google — skip basics.
  const firstStep = !upgrade && passwordless ? 1 : 0;
  const [steps] = useState<readonly StepKey[]>(() => {
    if (upgrade) {
      const added: StepKey[] = ['whatsnew', 'payday', 'bills', 'budget', 'lock', 'done'];
      return skipLock ? added.filter(key => key !== 'lock') : added;
    }
    // Auto-tracking is Android only, so its step exists only there.
    return STEP_KEYS.filter(
      key => key !== 'whatsnew' && (key !== 'autotrack' || isAutoTrackSupported()),
    );
  });
  const [stepIndex, setStepIndex] = useState(firstStep);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [showErrors, setShowErrors] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  // Emails the server said are taken, so editing back to one shows it again.
  const [takenEmails, setTakenEmails] = useState<string[]>([]);

  const stepKey = steps[stepIndex];

  const update = useCallback(<K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => {
    setDraft(current => ({...current, [key]: value}));
  }, []);

  const errors = useMemo(() => {
    const next: Partial<Record<keyof OnboardingDraft, string>> = {};
    if (!draft.name.trim()) {
      next.name = 'We need something to call you.';
    }
    if (!EMAIL_PATTERN.test(draft.email.trim())) {
      next.email = 'That email address looks incomplete.';
    } else if (takenEmails.includes(draft.email.trim().toLowerCase())) {
      next.email = 'An account already uses this email. Go back and sign in instead.';
    }
    const missed = passwordless ? null : firstMissedRule(draft.password ?? '');
    if (missed) {
      next.password = `Password needs ${missed.label.toLowerCase()}.`;
    }
    if (!passwordless && (draft.confirmPassword ?? '') !== (draft.password ?? '')) {
      next.confirmPassword = "Passwords don't match.";
    }
    const bills = draft.bills ?? [];
    if (bills.some(bill => !(Number(bill.amount) > 0))) {
      next.bills = 'Add an amount for every bill, or remove it.';
    } else if (bills.some(bill => bill.day === null)) {
      next.bills = 'Pick the due date for every bill.';
    } else if (bills.some(bill => !bill.label.trim())) {
      next.bills = 'Give every bill a name.';
    }
    return next;
  }, [
    draft.bills,
    draft.confirmPassword,
    draft.email,
    draft.name,
    draft.password,
    passwordless,
    takenEmails,
  ]);

  const validity = useMemo<Record<StepKey, StepValidity>>(
    () => ({
      whatsnew: {canContinue: true, skippable: true},
      basics: {
        canContinue:
          !errors.name &&
          !errors.email &&
          !errors.password &&
          !errors.confirmPassword,
        skippable: false,
      },
      money: {canContinue: true, skippable: true},
      payday: {canContinue: true, skippable: true},
      bills: {canContinue: !errors.bills, skippable: true},
      budget: {canContinue: true, skippable: true},
      autotrack: {canContinue: true, skippable: true},
      lock: {canContinue: true, skippable: !draft.appLock},
      done: {canContinue: true, skippable: false},
    }),
    [draft.appLock, errors],
  );

  const current = validity[stepKey];
  const isLastStep = stepIndex === steps.length - 1;

  // The OAuth setup check treats a profile without a goal as unfinished (the
  // sign-up trigger creates the row empty), so finishing always saves one.
  const finish = useCallback(() => {
    onComplete({...draft, goal: draft.goal ?? 'track'});
  }, [draft, onComplete]);

  const advance = useCallback(() => {
    setDirection(1);
    setShowErrors(false);
    setStepIndex(index => {
      if (index >= steps.length - 1) {
        return index;
      }
      return index + 1;
    });
  }, [steps.length]);

  const goNext = useCallback(async () => {
    if (checkingEmail) {
      return;
    }
    if (!current.canContinue) {
      setShowErrors(true);
      return;
    }
    // Ask before the rest of the steps, not after: someone with an account
    // should hear it now. Unknown (offline, RPC missing) lets them carry on.
    if (stepKey === 'basics' && !passwordless) {
      const email = draft.email.trim().toLowerCase();
      setCheckingEmail(true);
      const taken = await checkEmail(email);
      setCheckingEmail(false);
      if (taken === true) {
        setTakenEmails(list => (list.includes(email) ? list : [...list, email]));
        setShowErrors(true);
        return;
      }
    }
    if (isLastStep) {
      finish();
      return;
    }
    advance();
  }, [
    advance,
    checkEmail,
    checkingEmail,
    current.canContinue,
    draft.email,
    finish,
    isLastStep,
    passwordless,
    stepKey,
  ]);

  const goBack = useCallback(() => {
    setDirection(-1);
    setShowErrors(false);
    setStepIndex(index => Math.max(firstStep, index - 1));
  }, [firstStep]);

  const skip = useCallback(() => {
    if (stepKey === 'whatsnew' && onDismiss) {
      onDismiss();
      return;
    }
    // Skipping drops what was half set up, so it is not saved by accident.
    if (stepKey === 'bills') {
      setDraft(prev => ({...prev, bills: []}));
    } else if (stepKey === 'lock') {
      setDraft(prev => ({...prev, appLock: null, appLockPin: undefined}));
    }
    if (isLastStep) {
      finish();
      return;
    }
    advance();
  }, [advance, finish, isLastStep, onDismiss, stepKey]);

  return {
    draft,
    passwordless,
    update,
    stepKey,
    stepIndex,
    visibleStepIndex: stepIndex - firstStep,
    stepCount: steps.length - firstStep,
    direction,
    progress: (stepIndex - firstStep + 1) / (steps.length - firstStep),
    canContinue: current.canContinue,
    skippable: current.skippable,
    isLastStep,
    errors: showErrors ? errors : {},
    canGoBack: stepIndex > firstStep,
    /** The email check is running; the primary button shows it. */
    busy: checkingEmail,
    goNext,
    goBack,
    skip,
  };
}
