import React, {useCallback, useEffect, useRef} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewInstance,
  StyleSheet,
} from 'react-native';

import {Screen, SlideSwap} from '../../components/ui';
import {spacing} from '../../theme';
import {OnboardingFooter} from './components/OnboardingFooter';
import {OnboardingHeader} from './components/OnboardingHeader';
import {BasicInfoStep} from './steps/BasicInfoStep';
import {BudgetStep} from './steps/BudgetStep';
import {CategoriesStep} from './steps/CategoriesStep';
import {CurrencyIncomeStep} from './steps/CurrencyIncomeStep';
import {GoalStep} from './steps/GoalStep';
import {OnboardingDraft, StepKey} from './types';
import {useOnboarding} from './useOnboarding';

type OnboardingFlowProps = {
  onComplete: (draft: OnboardingDraft) => void;
};

export function OnboardingFlow({onComplete}: OnboardingFlowProps) {
  const flow = useOnboarding(onComplete);
  const scrollRef = useRef<ScrollViewInstance>(null);

  // A new step always starts at the top; carrying the previous scroll offset
  // over would hide the heading the transition just brought in.
  useEffect(() => {
    scrollRef.current?.scrollTo({y: 0, animated: false});
  }, [flow.stepKey]);

  const renderStep = useCallback(
    (key: string) => {
      switch (key as StepKey) {
        case 'basics':
          return (
            <BasicInfoStep
              draft={flow.draft}
              errors={flow.errors}
              onChange={flow.update}
            />
          );
        case 'money':
          return <CurrencyIncomeStep draft={flow.draft} onChange={flow.update} />;
        case 'goal':
          return (
            <GoalStep
              value={flow.draft.goal}
              error={flow.errors.goal}
              onSelect={goal => flow.update('goal', goal)}
            />
          );
        case 'categories':
          return (
            <CategoriesStep
              selectedIds={flow.draft.categoryIds}
              error={flow.errors.categoryIds}
              onToggle={flow.toggleCategory}
            />
          );
        case 'budget':
          return <BudgetStep draft={flow.draft} onChange={flow.update} />;
        default:
          return null;
      }
    },
    [flow],
  );

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <OnboardingHeader
          stepIndex={flow.stepIndex}
          stepCount={flow.stepCount}
          progress={flow.progress}
          canGoBack={flow.canGoBack}
          onBack={flow.goBack}
        />

        <ScrollView
          ref={scrollRef}
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          <SlideSwap
            swapKey={flow.stepKey}
            direction={flow.direction}
            fill={false}
            render={renderStep}
          />
        </ScrollView>

        <OnboardingFooter
          primaryLabel={flow.isLastStep ? 'Finish setup' : 'Continue'}
          onPrimary={flow.goNext}
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
