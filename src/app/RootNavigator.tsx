import React, {useCallback, useState} from 'react';
import {StyleSheet} from 'react-native';

import {SlideSwap} from '../components/ui';
import {travel} from '../theme';
import {AuthChoiceScreen} from '../features/auth/AuthChoiceScreen';
import {LoginScreen} from '../features/auth/LoginScreen';
import {SplashScreen} from '../features/auth/SplashScreen';
import {FirstExpenseEmptyState} from '../features/expenses/FirstExpenseEmptyState';
import {OnboardingFlow} from '../features/onboarding/OnboardingFlow';
import {OnboardingDraft} from '../features/onboarding/types';
import {RouteName} from './routes';
import {useRouter} from './useRouter';

/** Auth is not wired up yet; these are the seams the backend will fill. */
function notImplemented() {}

export function RootNavigator() {
  const router = useRouter('splash');
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);

  const handleComplete = useCallback(
    (completed: OnboardingDraft) => {
      setDraft(completed);
      // Replace rather than push: setup is done, going back into it would
      // restart a flow the user has already finished.
      router.replace('home');
    },
    [router],
  );

  const renderRoute = useCallback(
    (name: string) => {
      switch (name as RouteName) {
        case 'splash':
          return <SplashScreen onGetStarted={() => router.push('authChoice')} />;

        case 'authChoice':
          return (
            <AuthChoiceScreen
              onCreateAccount={() => router.push('onboarding')}
              onSignIn={() => router.push('login')}
              onGoogle={notImplemented}
              onBack={router.pop}
            />
          );

        case 'login':
          return (
            <LoginScreen
              onSubmit={notImplemented}
              onCreateAccount={() => router.replace('onboarding')}
              onForgotPassword={notImplemented}
              onGoogle={notImplemented}
              onBack={router.pop}
            />
          );

        case 'onboarding':
          return <OnboardingFlow onComplete={handleComplete} />;

        case 'home':
          return draft ? (
            <FirstExpenseEmptyState
              draft={draft}
              onAddExpense={notImplemented}
            />
          ) : null;

        default:
          return null;
      }
    },
    [draft, handleComplete, router],
  );

  return (
    <SlideSwap
      swapKey={router.route}
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
