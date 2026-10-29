import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, StyleSheet} from 'react-native';

import {SlideSwap} from '../components/ui';
import {useAuth} from '../features/auth/AuthProvider';
import {AuthChoiceScreen} from '../features/auth/AuthChoiceScreen';
import {useAutoTrack} from '../features/autotrack/AutoTrackProvider';
import {LoginScreen} from '../features/auth/LoginScreen';
import {SplashScreen} from '../features/auth/SplashScreen';
import {OnboardingFlow} from '../features/onboarding/OnboardingFlow';
import {OnboardingDraft} from '../features/onboarding/types';
import {useBiometricLock} from '../features/security/BiometricLockProvider';
import {MainTabs} from '../features/tabs/MainTabs';
import {
  draftFromUser,
  loadProfile,
  profilePayload,
  saveProfile,
  SaveProfileOptions,
} from '../lib/profileStore';
import {
  addScheduledSetup,
  applyScheduledSetup,
  markSetupCurrent,
  saveScheduledSetup,
  scheduleFromDraft,
  setupIsCurrent,
} from '../lib/scheduledSetup';
import {travel} from '../theme';
import {RouteName} from './routes';
import {
  HOME_KEY,
  LOADING_KEY,
  SETUP_KEY,
  UPGRADE_KEY,
  swapKeyFor,
} from './swapKey';
import {useRouter} from './useRouter';

export function RootNavigator() {
  const router = useRouter('splash');
  const {
    ready,
    session,
    user,
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    resetPassword,
    verifyResetCode,
    updateRecoveredPassword,
    cancelPasswordReset,
  } = useAuth();
  const {supported: autoTrackSupported, stagePrefs} = useAutoTrack();
  const {stageEnabled: stageAppLock, enabled: appLockOn} = useBiometricLock();

  // The onboarding toggles belong to the account, which may not exist yet:
  // staged, they replace the defaults when this user's prefs first load.
  const stageAccountPrefs = useCallback(
    (completed: OnboardingDraft) => {
      if (autoTrackSupported) {
        stagePrefs({
          notesEnabled: completed.autoTrackNotes ?? true,
          blockingEnabled: completed.autoTrackBlocking ?? true,
        });
      }
      if (completed.appLock === 'pin' && completed.appLockPin) {
        stageAppLock({method: 'pin', pin: completed.appLockPin});
      } else if (completed.appLock === 'biometric') {
        stageAppLock({method: 'biometric'});
      }
    },
    [autoTrackSupported, stageAppLock, stagePrefs],
  );
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  // An account from before payday, bills and app lock: asked those once.
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const hadUser = useRef(false);
  const googleBusy = useRef(false);

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!user) {
      hadUser.current = false;
      setDraft(null);
      setNeedsSetup(false);
      setNeedsUpgrade(false);
      setProfileReady(true);
      router.reset('splash');
      return;
    }

    hadUser.current = true;

    // Salary and bills picked at sign-up start once their first date comes.
    applyScheduledSetup(user).catch(() => {});

    let cancelled = false;
    setProfileReady(false);
    loadProfile(user.id).then(stored => {
      if (cancelled) {
        return;
      }
      // Email sign-ups finish onboarding before the account exists; OAuth
      // sign-ups get an account first and still owe a profile.
      // A profile row can exist but be incomplete (e.g. from a previous
      // failed attempt) — check that the required `goal` field was set.
      const provider = user.app_metadata?.provider;
      const profileIncomplete = !stored || !stored.goal;
      const owesSetup = profileIncomplete && !!provider && provider !== 'email';
      setNeedsSetup(owesSetup);
      // Someone still in first-time setup gets the new steps there.
      setNeedsUpgrade(!owesSetup && !setupIsCurrent(user));
      setDraft(draftFromUser(user, stored));
      setProfileReady(true);
    });

    return () => {
      cancelled = true;
    };
    // router.reset is stable; include only session identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user?.id]);

  const handleComplete = useCallback(
    async (completed: OnboardingDraft) => {
      stageAccountPrefs(completed);
      const password = completed.password ?? '';
      const result = await signUp(
        completed.email,
        password,
        profilePayload(completed),
      );
      if (result.error) {
        Alert.alert('Could not create account', result.error);
        return;
      }
      if (result.needsEmailConfirm) {
        Alert.alert(
          'Confirm your email',
          'We sent a link to finish setting up this account. Sign in after you confirm.',
        );
        router.reset('login');
        return;
      }
      if (result.userId) {
        try {
          await saveProfile(result.userId, completed);
        } catch {
          Alert.alert(
            'Account created',
            'Signed in, but the profiles table is missing in Supabase. Run the SQL in supabase/migrations, then save your profile again.',
          );
        }
      }
      setDraft({...completed, appLockPin: undefined});
    },
    [router, signUp, stageAccountPrefs],
  );

  const handleSignIn = useCallback(
    async (email: string, password: string) => {
      const {error} = await signIn(email, password);
      return error;
    },
    [signIn],
  );

  const handleForgot = useCallback(
    async (email: string) => {
      const {error} = await resetPassword(email);
      return error;
    },
    [resetPassword],
  );

  const handleVerifyResetCode = useCallback(
    async (email: string, code: string) => {
      const {error} = await verifyResetCode(email, code);
      return error;
    },
    [verifyResetCode],
  );

  const handleUpdatePassword = useCallback(
    async (newPassword: string) => {
      const {error} = await updateRecoveredPassword(newPassword);
      return error;
    },
    [updateRecoveredPassword],
  );

  const handleGoogle = useCallback(async () => {
    if (googleBusy.current) {
      return;
    }
    googleBusy.current = true;
    const {error} = await signInWithGoogle();
    googleBusy.current = false;
    if (error) {
      Alert.alert('Google sign-in failed', error);
    }
  }, [signInWithGoogle]);

  const handleOAuthSetup = useCallback(
    async (completed: OnboardingDraft) => {
      if (!user?.id) {
        return;
      }
      stageAccountPrefs(completed);
      try {
        await saveProfile(user.id, completed);
        await saveScheduledSetup(scheduleFromDraft(completed));
        await markSetupCurrent();
      } catch {
        Alert.alert(
          'Could not save to Supabase',
          'Your setup is on this device. Check your connection, then save your profile again from Profile.',
        );
      }
      setDraft({...completed, appLockPin: undefined});
      setNeedsSetup(false);
    },
    [stageAccountPrefs, user?.id],
  );

  // The catch-up flow saves into the existing account: payday and budget on
  // the profile, bills and salary added to what is scheduled, the lock as set.
  const handleUpgrade = useCallback(
    async (completed: OnboardingDraft) => {
      if (!user) {
        return;
      }
      if (completed.appLock === 'pin' && completed.appLockPin) {
        stageAppLock({method: 'pin', pin: completed.appLockPin});
      } else if (completed.appLock === 'biometric') {
        stageAppLock({method: 'biometric'});
      }
      try {
        await saveProfile(user.id, completed);
        await addScheduledSetup(user, scheduleFromDraft(completed));
        await markSetupCurrent();
      } catch {
        Alert.alert(
          'Could not save to Supabase',
          'Some of this setup may not be saved. Check your connection, then set it again from Profile.',
        );
      }
      setDraft({...completed, appLockPin: undefined});
      setNeedsUpgrade(false);
    },
    [stageAppLock, user],
  );

  const dismissUpgrade = useCallback(() => {
    setNeedsUpgrade(false);
    markSetupCurrent().catch(() => {});
  }, []);

  const handleProfileSave = useCallback(
    async (updated: OnboardingDraft, options?: SaveProfileOptions) => {
      setDraft(updated);
      if (!user?.id) {
        return;
      }
      try {
        await saveProfile(user.id, updated, options);
      } catch {
        Alert.alert(
          'Could not save to Supabase',
          'Your changes are on this device. Create the public.profiles table in the SQL Editor, then tap Save again.',
        );
      }
    },
    [user?.id],
  );

  // Each swap layer draws the screen its key names, so the screen sliding out
  // stays itself instead of turning into the one sliding in.
  const renderRoute = useCallback(
    (name: string) => {
      switch (name) {
        case LOADING_KEY:
          return <SplashScreen ready={false} onGetStarted={() => {}} />;
        case UPGRADE_KEY:
          return draft ? (
            <OnboardingFlow
              mode="upgrade"
              initialDraft={draft}
              passwordless
              skipLock={appLockOn}
              onComplete={handleUpgrade}
              onDismiss={dismissUpgrade}
            />
          ) : null;
        case SETUP_KEY:
          return draft ? (
            <OnboardingFlow
              initialDraft={draft}
              passwordless
              onComplete={handleOAuthSetup}
            />
          ) : null;
        case HOME_KEY:
          return draft ? (
            <MainTabs
              draft={draft}
              onProfileSave={handleProfileSave}
              onSignOut={signOut}
            />
          ) : null;
      }

      switch (name as RouteName) {
        case 'splash':
          return (
            <SplashScreen
              ready
              onGetStarted={() => router.push('authChoice')}
            />
          );

        case 'authChoice':
          return (
            <AuthChoiceScreen
              onCreateAccount={() => router.push('onboarding')}
              onSignIn={() => router.push('login')}
              onGoogle={handleGoogle}
              onBack={router.pop}
            />
          );

        case 'login':
          return (
            <LoginScreen
              onSubmit={handleSignIn}
              onCreateAccount={() => router.replace('onboarding')}
              onForgotPassword={handleForgot}
              onVerifyResetCode={handleVerifyResetCode}
              onUpdatePassword={handleUpdatePassword}
              onCancelReset={cancelPasswordReset}
              onGoogle={handleGoogle}
              onBack={router.pop}
            />
          );

        case 'onboarding':
          return <OnboardingFlow onComplete={handleComplete} />;

        default:
          return (
            <SplashScreen
              ready
              onGetStarted={() => router.push('authChoice')}
            />
          );
      }
    },
    [
      appLockOn,
      dismissUpgrade,
      draft,
      handleComplete,
      handleUpgrade,
      handleForgot,
      handleVerifyResetCode,
      handleUpdatePassword,
      cancelPasswordReset,
      handleGoogle,
      handleOAuthSetup,
      handleProfileSave,
      handleSignIn,
      router,
      signOut,
    ],
  );

  return (
    <SlideSwap
      swapKey={swapKeyFor({
        ready,
        signedIn: Boolean(session),
        profileReady,
        hasDraft: Boolean(draft),
        needsSetup,
        needsUpgrade,
        route: router.route,
      })}
      direction={router.direction}
      distance={travel.screen}
      render={renderRoute}
      style={styles.fill}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
