import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {ActivityScreen} from '../activity/ActivityScreen';
import {ActivityFilter} from '../activity/types';
import {AddActionSheet} from '../add/AddActionSheet';
import {AddTransactionScreen} from '../add/AddTransactionScreen';
import {AddKind} from '../add/types';
import {BudgetDetailsScreen} from '../home/BudgetDetailsScreen';
import {HomeScreen} from '../home/HomeScreen';
import {SavingsDetailsScreen} from '../home/SavingsDetailsScreen';
import {useHomeDashboard} from '../home/useHomeDashboard';
import {FloatingNavScrollProvider} from '../NavBar/FloatingNavScroll';
import {NavBar, TabId} from '../NavBar/NavBar';
import {currencyByCode} from '../onboarding/constants';
import {OnboardingDraft} from '../onboarding/types';
import {SaveProfileOptions} from '../../lib/profileStore';
import {TransactionRow} from '../../lib/transactionsStore';
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
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind | null>(null);
  const [editRow, setEditRow] = useState<TransactionRow | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [savingsOpen, setSavingsOpen] = useState(false);
  const [ledgerFocus, setLedgerFocus] = useState<string | null>(null);
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
  const {
    range,
    setRange,
    report,
    categories,
    transactions,
    status,
    refreshing,
    error,
    updatedAt,
    reload,
    upsertLocal,
    removeLocal,
  } = useHomeDashboard(
    refreshNonce,
    Number(profileDraft.startingBalance) || 0,
    moneyPlan,
  );

  const openComposer = useCallback((kind: AddKind) => {
    setSheetOpen(false);
    setEditRow(null);
    setAddKind(kind);
  }, []);

  const onAddPress = useCallback(() => {
    if (sheetOpen) {
      setSheetOpen(false);
      return;
    }
    if (tab === 'activity' && activityFilter === 'expenses') {
      openComposer('expense');
      return;
    }
    if (tab === 'activity' && activityFilter === 'income') {
      openComposer('income');
      return;
    }
    setSheetOpen(true);
  }, [activityFilter, openComposer, sheetOpen, tab]);

  let page = null;
  if (tab === 'home') {
    page = (
      <HomeScreen
        name={profileDraft.name}
        currencySymbol={currency.symbol}
        avatarUrl={profileDraft.avatarUrl}
        onProfilePress={() => setProfileOpen(true)}
        onBudgetPress={() => setBudgetOpen(true)}
        onSavingsPress={() => setSavingsOpen(true)}
        report={report}
        status={status}
        refreshing={refreshing}
        error={error}
        updatedAt={updatedAt}
        reload={reload}
        range={range}
        setRange={setRange}
      />
    );
  } else if (tab === 'activity') {
    page = (
      <ActivityScreen
        currencySymbol={currency.symbol}
        filter={activityFilter}
        onFilterChange={setActivityFilter}
        transactions={transactions}
        categories={categories}
        refreshing={refreshing}
        reload={reload}
        onUpsert={upsertLocal}
        onRemove={removeLocal}
        onEdit={row => {
          setEditRow(row);
          setAddKind(row.type);
        }}
        focusDate={ledgerFocus}
      />
    );
  } else if (tab === 'insights') {
    page = (
      <InsightsScreen
        currencySymbol={currency.symbol}
        name={profileDraft.name}
        avatarUrl={profileDraft.avatarUrl}
        onProfilePress={() => setProfileOpen(true)}
      />
    );
  } else {
    page = (
      <PaisaAIScreen
        currencySymbol={currency.symbol}
        monthlyBudget={moneyPlan.monthlyBudget}
        monthlySpent={report.monthlySpent}
        remainingBudget={report.monthlyRemainingBudget}
        transactions={transactions}
        categories={categories}
        draft={profileDraft}
        onSave={updated => {
          setProfileDraft(updated);
          void onProfileSave(updated);
        }}
        onDetailsPress={() => setTab('insights')}
        onActivityPress={() => setTab('activity')}
        onTransactionAdded={row => {
          upsertLocal(row);
          setLedgerFocus(row.transactionDate);
          setRefreshNonce(value => value + 1);
        }}
      />
    );
  }

  return (
    <FloatingNavScrollProvider
          resetKey={`${tab}:${profileOpen}:${budgetOpen}:${savingsOpen}:${sheetOpen}:${addKind ?? ''}:${editRow?.id ?? ''}`}>
      <View style={styles.root} collapsable={false}>
        <View style={styles.stage} collapsable={false}>
          {page}
        </View>

        <NavBar
          activeTab={tab}
          onTabPress={next => {
            setSheetOpen(false);
            setTab(next);
          }}
          onAddPress={onAddPress}
          addOpen={sheetOpen && addKind === null}
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
          existing={editRow}
          onClose={() => {
            setAddKind(null);
            setEditRow(null);
          }}
          onSaved={row => {
            upsertLocal(row);
            setLedgerFocus(row.transactionDate);
            setRefreshNonce(value => value + 1);
          }}
        />

        {/* Budget Details — opens from the Budget card on the dashboard */}
        <BudgetDetailsScreen
          visible={budgetOpen}
          onClose={() => setBudgetOpen(false)}
          currencySymbol={currency.symbol}
          budget={report.budget ?? moneyPlan.monthlyBudget}
          spent={report.spent ?? 0}
          remainingBudget={
            report.remainingBudget ?? moneyPlan.monthlyBudget
          }
          spendRatio={report.spendRatio ?? 0}
          overBudget={report.overBudget ?? false}
          slices={report.slices ?? []}
          range={report.range ?? 'month'}
        />

        <SavingsDetailsScreen
          visible={savingsOpen}
          onClose={() => setSavingsOpen(false)}
          currencySymbol={currency.symbol}
          monthlySavingsGoal={
            report.monthlySavingsGoal ?? moneyPlan.monthlySavingsGoal
          }
          periodSavingsTarget={report.periodSavingsTarget ?? 0}
          actualSavings={report.actualSavings ?? 0}
          savingsVsTarget={report.savingsVsTarget ?? 0}
          savingsUsesPlannedIncome={
            report.savingsUsesPlannedIncome ?? false
          }
          range={report.range ?? 'month'}
        />

        <ProfileScreen
          visible={profileOpen}
          draft={profileDraft}
          onSave={(updated, options) => {
            setProfileDraft(updated);
            onProfileSave(updated, options);
            setRefreshNonce(value => value + 1);
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
    backgroundColor: 'transparent',
  },
  stage: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
