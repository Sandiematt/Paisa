import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import {currencyByCode, MIN_CATEGORIES} from '../onboarding/constants';
import {OnboardingDraft} from '../onboarding/types';
import {SaveProfileOptions} from '../../lib/profileStore';
import {TransactionRow} from '../../lib/transactionsStore';
import {InsightsScreen} from '../insights/InsightsScreen';
import {NotificationHistorySheet} from '../notifications/NotificationHistorySheet';
import {useNotifications} from '../notifications/NotificationsProvider';
import {ProfileScreen} from '../profile/ProfileScreen';
import {MoneySheet} from '../profile/ProfileSheets';
import {profileCompleteness} from '../profile/profileCompleteness';

// Lets a closing modal finish dismissing before the next one is presented.
const MODAL_HANDOFF_MS = 350;

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
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [savingsOpen, setSavingsOpen] = useState(false);
  const [ledgerFocus, setLedgerFocus] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Week key of the Home spending nudge closed during this session.
  const [dismissedNudgeKey, setDismissedNudgeKey] = useState<string | null>(null);

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

  const {setSnapshot, pendingTarget, consumeTarget} = useNotifications();
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyClosedAt = useRef(0);

  // Budget alerts and reminders are decided from the same ledger the
  // dashboard shows, so every change here is re-checked there.
  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    setSnapshot({
      transactions,
      monthlyBudget: moneyPlan.monthlyBudget,
      currencySymbol: currency.symbol,
    });
  }, [
    currency.symbol,
    moneyPlan.monthlyBudget,
    setSnapshot,
    status,
    transactions,
  ]);

  useEffect(
    () => () => {
      setSnapshot(null);
      if (handoffTimer.current) {
        clearTimeout(handoffTimer.current);
      }
    },
    [setSnapshot],
  );

  // A tapped notification (or history row) lands on the screen it is about.
  useEffect(() => {
    if (!pendingTarget) {
      return;
    }
    const target = pendingTarget;
    consumeTarget();

    // Already composing a new expense: keep the user's input.
    if (target === 'expense' && addKind !== null && editRow === null) {
      return;
    }

    // The history sheet closes itself when a row is tapped, so give it the
    // same dismiss time as an overlay that is still on screen.
    const overlayOpen =
      profileOpen ||
      budgetOpen ||
      budgetEditOpen ||
      savingsOpen ||
      addKind !== null ||
      notificationsOpen ||
      Date.now() - historyClosedAt.current < MODAL_HANDOFF_MS;
    setNotificationsOpen(false);
    setProfileOpen(false);
    setBudgetOpen(false);
    setBudgetEditOpen(false);
    setSavingsOpen(false);
    setSheetOpen(false);
    setAddKind(null);
    setEditRow(null);

    const open = () => {
      if (target === 'expense') {
        setAddKind('expense');
        return;
      }
      // Alerts are about the month, so show the month.
      setTab('home');
      setRange('month');
      if (target === 'budget') {
        setBudgetOpen(true);
      } else {
        setSavingsOpen(true);
      }
    };

    if (handoffTimer.current) {
      clearTimeout(handoffTimer.current);
    }
    if (overlayOpen) {
      handoffTimer.current = setTimeout(open, MODAL_HANDOFF_MS);
    } else {
      open();
    }
  }, [
    addKind,
    budgetEditOpen,
    budgetOpen,
    consumeTarget,
    editRow,
    notificationsOpen,
    pendingTarget,
    profileOpen,
    savingsOpen,
    setRange,
  ]);

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
        avatarUrl={profileDraft.avatarUrl}
        currencySymbol={currency.symbol}
        profileProgress={profileCompleteness(profileDraft, MIN_CATEGORIES).ratio}
        onBudgetPress={() => setBudgetOpen(true)}
        onSavingsPress={() => setSavingsOpen(true)}
        onEditBudgetPress={() => setBudgetEditOpen(true)}
        onProfilePress={() => setProfileOpen(true)}
        onNotificationsPress={() => setNotificationsOpen(true)}
        onSeeAllPress={() => {
          setSheetOpen(false);
          setTab('activity');
        }}
        report={report}
        transactions={transactions}
        categories={categories}
        dismissedNudgeKey={dismissedNudgeKey}
        onDismissNudge={setDismissedNudgeKey}
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
        loading={status === 'loading'}
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
  } else {
    page = (
      <InsightsScreen
        currencySymbol={currency.symbol}
        monthlyBudget={moneyPlan.monthlyBudget}
      />
    );
  }

  return (
    <FloatingNavScrollProvider
          resetKey={`${tab}:${profileOpen}:${budgetOpen}:${budgetEditOpen}:${savingsOpen}:${notificationsOpen}:${sheetOpen}:${addKind ?? ''}:${editRow?.id ?? ''}`}>
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
          transactions={transactions}
          categories={categories}
        />

        <MoneySheet
          visible={budgetEditOpen}
          title={moneyPlan.monthlyBudget > 0 ? 'Edit budget' : 'Add budget'}
          label="Monthly spending budget"
          symbol={currency.symbol}
          value={profileDraft.monthlyBudget}
          lead="The most you plan to spend each month. Week and day limits follow from it."
          onDone={value => {
            if (value === profileDraft.monthlyBudget) {
              return;
            }
            const updated = {...profileDraft, monthlyBudget: value};
            setProfileDraft(updated);
            onProfileSave(updated, {keepCurrency: true});
            setRefreshNonce(n => n + 1);
          }}
          onClose={() => setBudgetEditOpen(false)}
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
          savingsState={report.savingsState ?? {kind: 'no-income'}}
          range={report.range ?? 'month'}
          transactions={transactions}
          categories={categories}
        />

        <NotificationHistorySheet
          visible={notificationsOpen}
          onClose={() => {
            historyClosedAt.current = Date.now();
            setNotificationsOpen(false);
          }}
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
