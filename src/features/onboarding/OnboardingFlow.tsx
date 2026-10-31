import React, {useCallback, useEffect, useRef} from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  ScrollViewInstance,
  StyleSheet,
  View,
  ViewInstance,
} from 'react-native';

import {Screen, SlideSwap} from '../../components/ui';
import {spacing} from '../../theme';
import {OnboardingFooter} from './components/OnboardingFooter';
import {OnboardingHeader} from './components/OnboardingHeader';
import {AutoTrackStep} from './steps/AutoTrackStep';
import {BasicInfoStep} from './steps/BasicInfoStep';
import {BillsStep} from './steps/BillsStep';
import {BudgetStep} from './steps/BudgetStep';
import {CurrencyIncomeStep} from './steps/CurrencyIncomeStep';
import {DoneStep} from './steps/DoneStep';
import {LockStep} from './steps/LockStep';
import {PaydayStep} from './steps/PaydayStep';
import {WhatsNewStep} from './steps/WhatsNewStep';
import {OnboardingDraft, StepKey} from './types';
import {OnboardingOptions, useOnboarding} from './useOnboarding';

type OnboardingFlowProps = OnboardingOptions & {
  onComplete: (draft: OnboardingDraft) => void | Promise<void>;
};

export function OnboardingFlow({
  onComplete,
  initialDraft,
  passwordless,
  mode,
  skipLock,
  onDismiss,
  upgradeFrom,
  knownBills,
  today,
}: OnboardingFlowProps) {
  const flow = useOnboarding(onComplete, {
    initialDraft,
    passwordless,
    mode,
    skipLock,
    onDismiss,
    upgradeFrom,
    knownBills,
    today,
  });
  const scrollRef = useRef<ScrollViewInstance>(null);
  const viewportRef = useRef<ViewInstance>(null);
  const scrollY = useRef(0);

  // Brings a block a step just added into view, such as a new bill's fields,
  // which otherwise land below the fold with nothing to say they appeared.
  const reveal = useCallback((target: ViewInstance) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.measureInWindow((_vx, top, _vw, height) => {
      target.measureInWindow((_tx, y, _tw, targetHeight) => {
        const above = y < top;
        const below = y + targetHeight > top + height;
        if (!above && !below) {
          return;
        }
        scrollRef.current?.scrollTo({
          y: Math.max(0, scrollY.current + (y - top) - spacing.lg),
          animated: true,
        });
      });
    });
  }, []);

  // A new step always starts at the top; carrying the previous scroll offset
  // over would hide the heading the transition just brought in.
  useEffect(() => {
    scrollRef.current?.scrollTo({y: 0, animated: false});
  }, [flow.stepKey]);

  const renderStep = useCallback(
    (key: string) => {
      switch (key as StepKey) {
        case 'whatsnew':
          return <WhatsNewStep restart={flow.mode === 'restart'} />;
        case 'basics':
          return (
            <BasicInfoStep
              draft={flow.draft}
              errors={flow.errors}
              onChange={flow.update}
              passwordless={flow.passwordless}
            />
          );
        case 'money':
          return <CurrencyIncomeStep draft={flow.draft} onChange={flow.update} />;
        case 'payday':
          return <PaydayStep draft={flow.draft} onChange={flow.update} />;
        case 'bills':
          return (
            <BillsStep
              draft={flow.draft}
              errors={flow.errors}
              onChange={flow.update}
              onReveal={reveal}
            />
          );
        case 'budget':
          return (
            <BudgetStep
              draft={flow.draft}
              errors={flow.errors}
              onChange={flow.update}
              today={flow.today}
              knownBills={flow.knownBills}
              // Accounts moving over already have this month's spending logged.
              asksAlreadySpent={flow.mode !== 'upgrade'}
            />
          );
        case 'autotrack':
          return <AutoTrackStep draft={flow.draft} onChange={flow.update} />;
        case 'lock':
          return <LockStep draft={flow.draft} onChange={flow.update} />;
        case 'done':
          return <DoneStep draft={flow.draft} today={flow.today} knownBills={flow.knownBills} />;
        default:
          return null;
      }
    },
    [flow, reveal],
  );

  return (
    <Screen glow={280}>
      {/* Android too: the app is edge-to-edge, so adjustResize no longer
          shrinks the window and the keyboard would cover the fields. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <OnboardingHeader
          stepIndex={flow.visibleStepIndex}
          stepCount={flow.stepCount}
          progress={flow.progress}
          canGoBack={flow.canGoBack}
          onBack={flow.goBack}
        />

        <View ref={viewportRef} style={styles.fill} collapsable={false}>
          <ScrollView
            ref={scrollRef}
            style={styles.fill}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={event => {
              scrollY.current = event.nativeEvent.contentOffset.y;
            }}>
            <SlideSwap
              swapKey={flow.stepKey}
              direction={flow.direction}
              fill={false}
              render={renderStep}
            />
          </ScrollView>
        </View>

        <OnboardingFooter
          primaryLabel={
            flow.isLastStep
              ? mode === 'upgrade' || mode === 'restart'
                ? 'Back to Paisa'
                : 'Start using Paisa'
              : flow.stepKey === 'whatsnew'
                ? 'Got it'
                : 'Continue'
          }
          skipLabel={
            flow.stepKey === 'whatsnew' ? (mode === 'restart' ? 'Keep last values' : 'Not now') : undefined
          }
          onPrimary={flow.goNext}
          loading={flow.busy}
          skippable={flow.skippable}
          onSkip={flow.skip}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.section,
  },
});
