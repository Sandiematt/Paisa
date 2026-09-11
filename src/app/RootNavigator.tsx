import React, {useCallback, useEffect, useState} from 'react';
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
  const {ready, session, user, signIn, signUp, signOut, resetPassword} =
    useAuth();
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!user) {
      setDraft(null);
      setProfileReady(true);
      router.reset('splash');
      return;
    }

    let cancelled = false;
    setProfileReady(false);
    loadProfile(user.id).then(stored => {
      if (cancelled) {
        return;
      }
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

  const handleGoogle = useCallback(() => {
    Alert.alert(
      'Google coming next',
      'Email and password are connected. Google sign-in needs a provider set up in Supabase.',
    );
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

  const renderRoute = useCallback(
    (name: string) => {
      if (!ready || (session && !profileReady)) {
        return <SplashScreen ready={false} onGetStarted={() => {}} />;
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
      handleGoogle,
      handleProfileSave,
      handleSignIn,
      profileReady,
      ready,
      router,
      session,
      signOut,
    ],
  );

  return (
    <SlideSwap
      swapKey={session && draft ? 'home' : router.route}
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
