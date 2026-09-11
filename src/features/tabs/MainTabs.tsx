import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {ActivityScreen} from '../activity/ActivityScreen';
import {AddActionSheet} from '../add/AddActionSheet';
import {AddTransactionScreen} from '../add/AddTransactionScreen';
import {AddKind} from '../add/types';
import {HomeScreen} from '../home/HomeScreen';
import {FloatingNavScrollProvider} from '../NavBar/FloatingNavScroll';
import {NavBar, TabId} from '../NavBar/NavBar';
import {currencyByCode} from '../onboarding/constants';
import {OnboardingDraft} from '../onboarding/types';
import {SaveProfileOptions} from '../../lib/profileStore';
import {InsightsScreen} from '../insights/InsightsScreen';
import {PaisaAIScreen} from '../paisaAI/PaisaAIScreen';
import {ProfileScreen} from '../profile/ProfileScreen';

type MainTabsProps = {
  draft: OnboardingDraft;
  onProfileSave: (
    updated: OnboardingDraft,
    options?: SaveProfileOptions,
  ) => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
};

export function MainTabs({draft, onProfileSave, onSignOut}: MainTabsProps) {
  const [profileDraft, setProfileDraft] = useState<OnboardingDraft>(draft);
  const [tab, setTab] = useState<TabId>('home');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    setProfileDraft(draft);
  }, [draft]);

  const currency = currencyByCode(profileDraft.currency);
  const moneyPlan = useMemo(
    () => ({
      monthlyIncome: Number(profileDraft.monthlyIncome) || 0,
      monthlyBudget: Number(profileDraft.monthlyBudget) || 0,
      monthlySavingsGoal: Number(profileDraft.monthlySavingsGoal) || 0,
    }),
    [
      profileDraft.monthlyBudget,
      profileDraft.monthlyIncome,
      profileDraft.monthlySavingsGoal,
    ],
  );

  const openComposer = useCallback((kind: AddKind) => {
    setSheetOpen(false);
    setAddKind(kind);
  }, []);

  let page = null;
  if (tab === 'home') {
    page = (
      <HomeScreen
        name={profileDraft.name}
        currencySymbol={currency.symbol}
        avatarUrl={profileDraft.avatarUrl}
        onProfilePress={() => setProfileOpen(true)}
        refreshNonce={refreshNonce}
        openingAmount={Number(profileDraft.startingBalance) || 0}
        plan={moneyPlan}
      />
    );
  } else if (tab === 'activity') {
    page = <ActivityScreen currencySymbol={currency.symbol} />;
  } else if (tab === 'insights') {
    page = <InsightsScreen currencySymbol={currency.symbol} />;
  } else {
    page = <PaisaAIScreen currencySymbol={currency.symbol} />;
  }

  return (
    <FloatingNavScrollProvider
      resetKey={`${tab}:${profileOpen}:${sheetOpen}:${addKind ?? ''}`}>
      <View style={styles.root} collapsable={false}>
        <View style={styles.stage} collapsable={false}>
          {page}
        </View>

        <NavBar
          activeTab={tab}
          onTabPress={setTab}
          onAddPress={() => setSheetOpen(true)}
        />

        <AddActionSheet
          visible={sheetOpen && addKind === null}
          onClose={() => setSheetOpen(false)}
          onSelect={openComposer}
        />

        <AddTransactionScreen
          visible={addKind !== null}
          initialKind={addKind ?? 'expense'}
          currencySymbol={currency.symbol}
          categoryIds={profileDraft.categoryIds}
          onClose={() => setAddKind(null)}
          onSaved={() => setRefreshNonce(value => value + 1)}
        />

        <ProfileScreen
          visible={profileOpen}
          draft={profileDraft}
          onSave={(updated, options) => {
            setProfileDraft(updated);
            onProfileSave(updated, options);
            setRefreshNonce(value => value + 1);
            setProfileOpen(false);
          }}
          onSignOut={onSignOut}
          onClose={() => setProfileOpen(false)}
        />
      </View>
    </FloatingNavScrollProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  stage: {
    flex: 1,
  },
});
