import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, StyleSheet} from 'react-native';

import {SlideSwap} from '../components/ui';
import {useAuth} from '../features/auth/AuthProvider';
import {AuthChoiceScreen} from '../features/auth/AuthChoiceScreen';
import {LoginScreen} from '../features/auth/LoginScreen';
import {SplashScreen} from '../features/auth/SplashScreen';
import {OnboardingFlow} from '../features/onboarding/OnboardingFlow';
import {OnboardingDraft} from '../features/onboarding/types';
import {MainTabs} from '../features/tabs/MainTabs';
import {
  draftFromUser,
  loadProfile,
  profilePayload,
  saveProfile,
  SaveProfileOptions,
} from '../lib/profileStore';
import {travel} from '../theme';
import {RouteName} from './routes';
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
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
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
      setProfileReady(true);
      router.reset('splash');
      return;
    }

    hadUser.current = true;

    let cancelled = false;
    setProfileReady(false);
    loadProfile(user.id).then(stored => {
      if (cancelled) {
        return;
      }
      // Email sign-ups finish onboarding before the account exists; OAuth
      // sign-ups get an account first and still owe a profile.
      const provider = user.app_metadata?.provider;
      setNeedsSetup(!stored && !!provider && provider !== 'email');
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
      setDraft(completed);
    },
    [router, signUp],
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
      try {
        await saveProfile(user.id, completed);
      } catch {
        Alert.alert(
          'Could not save to Supabase',
          'Your setup is on this device. Check your connection, then save your profile again from Profile.',
        );
      }
      setDraft(completed);
      setNeedsSetup(false);
    },
    [user?.id],
  );

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

  const renderRoute = useCallback(
    (name: string) => {
      const waitingOnAuth = !ready || (session && !profileReady);
      if (waitingOnAuth) {
        return (
          <SplashScreen
            ready={false}
            onGetStarted={() => {}}
          />
        );
      }

      if (session && draft && needsSetup) {
        return (
          <OnboardingFlow
            initialDraft={draft}
            passwordless
            onComplete={handleOAuthSetup}
          />
        );
      }

      if (session && draft) {
        return (
          <MainTabs
            draft={draft}
            onProfileSave={handleProfileSave}
            onSignOut={signOut}
          />
        );
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
      draft,
      handleComplete,
      handleForgot,
      handleVerifyResetCode,
      handleUpdatePassword,
      cancelPasswordReset,
      handleGoogle,
      handleOAuthSetup,
      handleProfileSave,
      handleSignIn,
      needsSetup,
      profileReady,
      ready,
      router,
      session,
      signOut,
    ],
  );

  return (
    <SlideSwap
      swapKey={
        session && draft ? (needsSetup ? 'setup' : 'home') : router.route
      }
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
