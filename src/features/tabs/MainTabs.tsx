import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Alert, Modal, StyleSheet, View} from 'react-native';

import {AppText} from '../../components/ui';
import {colors} from '../../theme';
import {ActivityScreen} from '../activity/ActivityScreen';
import {ActivityFilter} from '../activity/types';
import {AddActionSheet} from '../add/AddActionSheet';
import {AddTransactionScreen} from '../add/AddTransactionScreen';
import {SavedEvent, SavedToast} from '../add/SavedToast';
import {AddChoice, AddKind} from '../add/types';
import {ReceiptReviewScreen} from '../receipts/ReceiptReviewScreen';
import {useReceiptScanner} from '../receipts/useReceiptScanner';
import {useAuth} from '../auth/AuthProvider';
import {TutorialProvider} from '../tutorial/TutorialProvider';
import {TutorialStep} from '../tutorial/tutorialSteps';
import {BillAction, BillStatusSheet} from '../home/BillStatusSheet';
import {BudgetDetailsScreen} from '../home/BudgetDetailsScreen';
import {dayMonth, planProblem, shownLimit} from '../home/budgetCopy';
import {HomeScreen} from '../home/HomeScreen';
import {SavingsDetailsScreen} from '../home/SavingsDetailsScreen';
import {useHomeDashboard} from '../home/useHomeDashboard';
import {FloatingNavScrollProvider} from '../NavBar/FloatingNavScroll';
import {NavBar, TabId} from '../NavBar/NavBar';
import {TabStage} from '../NavBar/TabStage';
import {MonthStartReview} from '../monthStart/MonthStartReview';
import {recountedExtra} from '../monthStart/monthStart';
import {useMonthStart, writeRestartClose} from '../monthStart/useMonthStart';
import {BillsPaidQuestion} from '../onboarding/components/BillsPaidQuestion';
import {OnboardingFlow} from '../onboarding/OnboardingFlow';
import {currencyByCode} from '../onboarding/constants';
import {OnboardingDraft} from '../onboarding/types';
import {formatMoney} from '../../lib/formatMoney';
import {useToday} from '../../hooks/useToday';
import {
  CycleBill,
  billPaymentIds,
  clearBillMonth,
  cycleBills,
  dismissCarriedBill,
  dismissUnpaidFor,
  linkBillPayment,
  markBillNotPaid,
  markBillPaid,
  markBillPaidOutside,
  plannedBillTotal,
} from '../../lib/billMonths';
import {setActivePayday} from '../../lib/budgetCycle';
import {cycleRangeFor, validatePlan} from '../../lib/budgetEngine';
import {
  hasStarted,
  migrateLegacyBudget,
  pendingFlowFrom,
  saveBudgetFlow,
  startBudgetFlow,
  startNewAccountFlow,
} from '../../lib/budgetFlow';
import {
  BudgetFacts,
  budgetForCycle,
  hasBudget,
  keptExtraSavings,
} from '../../lib/budgetInputs';
import {addBudgetAdjustment, chooseMonthExtra, markMonthReviewed} from '../../lib/budgetMonths';
import {
  monthlyBudgetOf,
  monthlyTotalOf,
  withMonthlyTotal,
  withSavingsGoal,
} from '../../lib/budgetPlan';
import {categoryForSlug} from '../../lib/categoriesStore';
import {
  BillInput,
  EditableBill,
  editableBills,
  removeBill,
  saveBill,
} from '../../lib/bills';
import {SaveProfileOptions} from '../../lib/profileStore';
import {
  billPaidAnswerOf,
  entriesStartingNextCycle,
  pendingBillsFromUser,
  saveBillPaid,
  scheduledFromUser,
} from '../../lib/scheduledSetup';
import {TransactionRow, localDateISO} from '../../lib/transactionsStore';
import {firstLedgerDay} from '../home/homeReport';
import {useAutoTrack} from '../autotrack/AutoTrackProvider';
import {AutoTrackingScreen} from '../autotrack/AutoTrackingScreen';
import {snapshotForBudget, unsyncedSpendByDate} from '../autotrack/dailyAllowance';
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
  const [autoTrackOpen, setAutoTrackOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [savingsOpen, setSavingsOpen] = useState(false);
  // The bill whose sheet is open; kept while it closes.
  const [billSheet, setBillSheet] = useState<CycleBill | null>(null);
  const [billSheetOpen, setBillSheetOpen] = useState(false);
  // Money sheets on the budget and savings screens.
  const [moneySheet, setMoneySheet] = useState<'top_up' | 'move_to_budget' | 'move_to_savings' | null>(null);
  const [ledgerFocus, setLedgerFocus] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [savedEvent, setSavedEvent] = useState<SavedEvent | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Week key of the Home spending nudge closed during this session.
  const [dismissedNudgeKey, setDismissedNudgeKey] = useState<string | null>(null);
  const {user} = useAuth();
  const [tutorialStepId, setTutorialStepId] = useState<string | null>(null);
  const [tutorialRestart, setTutorialRestart] = useState(0);

  useEffect(() => {
    setProfileDraft(draft);
  }, [draft]);

  const currency = currencyByCode(profileDraft.currency);
  const payday = profileDraft.payday ?? null;
  // Set during render, before anything below reads it: the dashboard helpers
  // that are not handed the payday fall back to this one.
  setActivePayday(payday);
  const today = useToday();
  const pendingBills = useMemo(() => pendingBillsFromUser(user), [user]);
  const moneyPlan = useMemo(
    () => ({
      monthlyIncome: Number(profileDraft.monthlyIncome) || 0,
      // Income less savings unless the user set their own; bills come off it later.
      monthlyBudget: monthlyBudgetOf(profileDraft),
      monthlySavingsGoal: Number(profileDraft.monthlySavingsGoal) || 0,
      payday,
      pendingBills,
    }),
    [
      payday,
      pendingBills,
      profileDraft,
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
    ledgerAsOf,
    budgetData,
    reload,
    upsertLocal,
    removeLocal,
  } = useHomeDashboard(
    refreshNonce,
    Number(profileDraft.startingBalance) || 0,
    moneyPlan,
  );
  // The budget is edited as the month's total, bills and the savings goal
  // included (handbook D1); what it leaves to spend is worked out from it.
  const monthlyTotal = monthlyTotalOf(profileDraft);
  const savingsGoal = Number(profileDraft.monthlySavingsGoal) || 0;
  const income = Number(profileDraft.monthlyIncome) || 0;
  const budgetText = monthlyTotal > 0 ? String(monthlyTotal) : '';

  // Bills from sign-up not due again this month: paid already, or not this
  // month? Asked in both budget sheets; the answer shown while it saves.
  const laterBills = useMemo(
    () => entriesStartingNextCycle(scheduledFromUser(user), payday),
    [payday, user],
  );
  const [savingBillsAnswers, setSavingBillsAnswers] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setSavingBillsAnswers({});
  }, [laterBills]);
  const answerBillPaid = useCallback(
    (ref: string, paid: boolean) => {
      if (!user) {
        return;
      }
      setSavingBillsAnswers(current => ({...current, [ref]: paid}));
      saveBillPaid(user, ref, paid).catch(() => {
        setSavingBillsAnswers(current => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const {[ref]: _dropped, ...rest} = current;
          return rest;
        });
        Alert.alert('Could not save', 'Check your connection, then answer again.');
      });
    },
    [user],
  );

  // Monthly bills, edited from Profile. A ledger change reloads the dashboard;
  // one still waiting lives on the auth user, which updates by itself.
  const editable = useMemo(
    () => editableBills(transactions, scheduledFromUser(user)),
    [transactions, user],
  );
  const saveEditedBill = useCallback(
    async (bill: EditableBill | null, input: BillInput) => {
      if (!user) {
        return;
      }
      await saveBill(user, transactions, bill, input);
      setRefreshNonce(n => n + 1);
    },
    [transactions, user],
  );
  const removeEditedBill = useCallback(
    async (bill: EditableBill) => {
      if (!user) {
        return;
      }
      await removeBill(user, transactions, bill);
      // A bill that is gone no longer carries unpaid months forward.
      const key = bill.source === 'ledger' ? bill.key.slice('ledger:'.length) : bill.key;
      await dismissUnpaidFor([key], budgetData.billMonths, today).catch(() => {});
      setRefreshNonce(n => n + 1);
    },
    [budgetData.billMonths, today, transactions, user],
  );
  const billsQuestion =
    laterBills.length > 0 && monthlyTotal > 0 ? (
      <View style={styles.billsQuestion}>
        <BillsPaidQuestion
          bills={laterBills.map(entry => ({
            key: entry.ref,
            label: entry.description,
            amount: entry.amount,
          }))}
          firstDate={laterBills[0].date}
          answers={Object.fromEntries(
            laterBills.map(entry => [
              entry.ref,
              savingBillsAnswers[entry.ref] ?? billPaidAnswerOf(entry),
            ]),
          )}
          onAnswer={answerBillPaid}
          money={amount => formatMoney(amount, currency.symbol, {decimals: 0})}
        />
      </View>
    ) : null;

  const {setSnapshot, pendingTarget, consumeTarget} = useNotifications();
  const {
    setBudgetSnapshot,
    syncNonce,
    transactions: detectedPayments,
  } = useAutoTrack();
  // Detected payments the ledger above does not include yet still count toward
  // today's limit: unsaved ones, and ones saved after the ledger was read.
  const unsyncedSpend = useMemo(
    () => unsyncedSpendByDate(detectedPayments, ledgerAsOf),
    [detectedPayments, ledgerAsOf],
  );
  // The day tracking began: account creation, or an earlier backdated entry.
  // Insights treats periods before it as "no data" rather than zero spend.
  const trackingSince = useMemo(() => {
    const created = user?.created_at ? new Date(user.created_at) : null;
    const first = firstLedgerDay(transactions);
    const valid = created && !Number.isNaN(created.getTime()) ? created : null;
    const since = valid && first ? (first < valid ? first : valid) : (valid ?? first);
    return since ? localDateISO(since) : null;
  }, [transactions, user?.created_at]);
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openAfterHandoffRef = useRef<(open: () => void) => void>(() => {});
  const historyClosedAt = useRef(0);

  // Everything the rolling budget is worked out from (src/lib/budgetInputs.ts).
  const facts = useMemo<BudgetFacts>(
    () => ({
      total: monthlyTotal,
      savingsGoal,
      payday,
      transactions,
      pendingBills,
      billMonths: budgetData.billMonths,
      history: budgetData.history,
      flow: budgetData.flow ?? null,
      unsyncedSpend,
    }),
    [budgetData, monthlyTotal, payday, pendingBills, savingsGoal, transactions, unsyncedSpend],
  );
  const cycle = useMemo(() => cycleRangeFor(today, payday), [payday, today]);
  const cycleBudget = useMemo(
    () => (hasBudget(facts) ? budgetForCycle(facts, today) : null),
    [facts, today],
  );
  const bills = useMemo(
    () => cycleBudget?.bills ?? cycleBills(transactions, cycle, pendingBills, budgetData.billMonths),
    [budgetData.billMonths, cycle, cycleBudget, pendingBills, transactions],
  );
  const plannedBills = plannedBillTotal(bills);
  const linkedIds = useMemo(() => billPaymentIds(budgetData.billMonths), [budgetData.billMonths]);
  const keptExtra = useMemo(() => keptExtraSavings(budgetData.history), [budgetData.history]);

  // An account starts the rolling budget the first time it opens with it:
  // a new one with what onboarding asked, one that used Paisa before with
  // the move-over (handbook 5.3), counting this month's spending.
  useEffect(() => {
    const flow = budgetData.flow;
    if (!user || status !== 'ready' || flow === undefined || flow === null || hasStarted(flow)) {
      return;
    }
    const pending = pendingFlowFrom(user.user_metadata);
    const next = pending
      ? startNewAccountFlow(pending, today, payday)
      : migrateLegacyBudget(flow, today, payday);
    if (!next) {
      return;
    }
    saveBudgetFlow(user.id, next)
      .then(() => setRefreshNonce(n => n + 1))
      .catch(() => {});
  }, [budgetData.flow, payday, status, today, user]);

  // Budget alerts and reminders are decided from the same ledger the
  // dashboard shows, so every change here is re-checked there.
  const budgetState = cycleBudget?.state ?? null;
  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    setSnapshot({
      transactions,
      // Alerts judge day-to-day spending against what the cycle has for it.
      // Nothing to spend keeps a token paisa, so alerts stay on.
      budget:
        budgetState && budgetState.kind === 'active'
          ? {
              period: budgetState.cycle.start.slice(0, 7),
              spent: budgetState.spent,
              spendable: Math.max(0.01, budgetState.spendable),
            }
          : null,
      currencySymbol: currency.symbol,
    });
  }, [budgetState, currency.symbol, setSnapshot, status, transactions]);

  // The UPI spend guard runs from the same ledger and budget while Paisa is closed.
  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    setBudgetSnapshot(snapshotForBudget(facts, today, ledgerAsOf));
  }, [facts, ledgerAsOf, setBudgetSnapshot, status, today]);

  // What a typed budget would give: spendable and today's limit, as the engine works them out.
  const budgetPreview = (value: string) => {
    const typed = Number(value);
    if (!(typed > 0) || validatePlan(typed, plannedBills, savingsGoal).status === 'over') {
      return null;
    }
    const preview = budgetForCycle({...facts, total: typed}, today).state;
    const money = (amount: number) => formatMoney(amount, currency.symbol, {decimals: 0});
    const text =
      preview.kind === 'waiting' && preview.startsOn
        ? `${money(preview.spendable)} to spend from ${dayMonth(preview.startsOn)}.`
        : preview.spendable <= 0
          ? 'Bills and your savings goal take all of it, so the daily limit is 0.'
          : `${money(preview.spendable)} to spend this month · ${money(
              shownLimit(preview.dailyLimit),
            )} today for the ${preview.remainingDays} days left.`;
    return (
      <AppText variant="caption" color={colors.muted} style={styles.preview}>
        {text}
      </AppText>
    );
  };

  const onBillAction = useCallback(
    async (bill: CycleBill, action: BillAction) => {
      if (action.kind === 'editPayment') {
        setBudgetOpen(false);
        openAfterHandoffRef.current(() => {
          setEditRow(action.row);
          setAddKind('expense');
        });
        return;
      }
      switch (action.kind) {
        case 'markPaid': {
          const root = transactions.find(row => row.id === bill.billKey);
          const waiting = scheduledFromUser(user).find(entry => entry.ref === bill.billKey);
          const categoryId =
            root?.categoryId ??
            waiting?.categoryId ??
            categoryForSlug(categories, waiting?.slug ?? 'bills', 'expense')?.id ??
            null;
          await markBillPaid(bill, action.amount, today, categoryId);
          break;
        }
        case 'link':
          await linkBillPayment(bill, action.row, today);
          break;
        case 'paidOutside':
          await markBillPaidOutside(bill, today);
          break;
        case 'notPaid':
          await markBillNotPaid(bill, transactions);
          break;
        case 'dismiss':
          await dismissCarriedBill(bill, today);
          break;
        case 'undo':
          await clearBillMonth(bill);
          break;
      }
      setRefreshNonce(n => n + 1);
    },
    [categories, today, transactions, user],
  );

  // The first open of a new cycle: write the last one down, then the review
  // once; after a long absence the setup again instead (handbook 6.1, 5.6).
  const monthStart = useMonthStart({
    ready: status === 'ready' && budgetData.flow !== undefined,
    today,
    payday,
    facts,
    flow: budgetData.flow,
    history: budgetData.history,
    onChanged: () => setRefreshNonce(n => n + 1),
  });
  const [reviewClosed, setReviewClosed] = useState<string | null>(null);
  const [restartDone, setRestartDone] = useState(false);
  const restartOpen = monthStart.restart !== null && !restartDone;
  const reviewMonth = monthStart.review;
  const reviewOpen =
    !restartOpen && reviewMonth !== null && reviewMonth.cycleStart !== reviewClosed;
  // Marked the moment it shows, so it is never shown again, even if the app is closed on it.
  const reviewMarked = useRef<string | null>(null);
  useEffect(() => {
    if (reviewOpen && reviewMonth && reviewMarked.current !== reviewMonth.cycleStart) {
      reviewMarked.current = reviewMonth.cycleStart;
      markMonthReviewed(reviewMonth.cycleStart).catch(() => {});
    }
  }, [reviewMonth, reviewOpen]);

  const savePlanFields = useCallback(
    (updated: OnboardingDraft) => {
      setProfileDraft(updated);
      onProfileSave(updated, {keepCurrency: true});
      setRefreshNonce(n => n + 1);
    },
    [onProfileSave],
  );

  // Ends the restart: the last month used is written down first (from the
  // values it had), then the budget starts again from today.
  const restartPlan = monthStart.restart;
  const finishRestart = useCallback(
    async (completed: OnboardingDraft | null) => {
      if (!user) {
        return;
      }
      try {
        if (restartPlan) {
          await writeRestartClose(restartPlan);
        }
        const nextPayday = completed?.payday ?? payday;
        await saveBudgetFlow(
          user.id,
          startBudgetFlow(
            'restart',
            today,
            nextPayday,
            Number(completed?.alreadySpent) || 0,
            completed?.startNow === true,
          ),
        );
      } catch {
        Alert.alert('Could not save', 'Check your connection, then try again.');
        return;
      }
      setRestartDone(true);
      if (completed) {
        setProfileDraft(completed);
        await Promise.resolve(onProfileSave(completed, {keepCurrency: true})).catch(() => {});
      }
      setRefreshNonce(n => n + 1);
    },
    [onProfileSave, payday, restartPlan, today, user],
  );

  const moneyMoved = useCallback(
    async (kind: 'top_up' | 'move_to_budget' | 'move_to_savings', value: string) => {
      const amount = Number(value);
      if (!(amount > 0)) {
        return;
      }
      const label =
        kind === 'top_up'
          ? 'Extra money added'
          : kind === 'move_to_budget'
            ? 'From extra savings'
            : 'Back to savings';
      try {
        await addBudgetAdjustment(cycle.start, kind, amount, label);
        setRefreshNonce(n => n + 1);
      } catch (caught) {
        Alert.alert(
          'Could not save',
          caught instanceof Error ? caught.message : 'Check your connection, then try again.',
        );
      }
    },
    [cycle.start],
  );

  // Payments auto-tracking just saved are new rows to show.
  useEffect(() => {
    if (syncNonce > 0) {
      setRefreshNonce(value => value + 1);
    }
  }, [syncNonce]);

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
      autoTrackOpen ||
      budgetOpen ||
      budgetEditOpen ||
      savingsOpen ||
      addKind !== null ||
      notificationsOpen ||
      Date.now() - historyClosedAt.current < MODAL_HANDOFF_MS;
    setNotificationsOpen(false);
    setProfileOpen(false);
    setAutoTrackOpen(false);
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
    autoTrackOpen,
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

  // Lets the overlay that is closing finish dismissing before the next opens.
  const openAfterHandoff = useCallback((open: () => void) => {
    if (handoffTimer.current) {
      clearTimeout(handoffTimer.current);
    }
    handoffTimer.current = setTimeout(open, MODAL_HANDOFF_MS);
  }, []);
  openAfterHandoffRef.current = openAfterHandoff;

  const openComposer = useCallback((kind: AddKind) => {
    setSheetOpen(false);
    setEditRow(null);
    setAddKind(kind);
  }, []);

  const receiptScanner = useReceiptScanner();
  const onAddChoice = useCallback(
    (choice: AddChoice) => {
      if (choice === 'scan') {
        setSheetOpen(false);
        receiptScanner.start();
        return;
      }
      openComposer(choice);
    },
    [openComposer, receiptScanner],
  );

  const showSaved = useCallback(
    (row: TransactionRow, updated: boolean) => {
      const kindLabel = row.type === 'income' ? 'Income' : 'Expense';
      setSavedEvent(previous => ({
        key: (previous?.key ?? 0) + 1,
        title: updated ? `${kindLabel} updated` : `${kindLabel} added`,
        detail: formatMoney(
          row.type === 'income' ? row.amount : -row.amount,
          currency.symbol,
          {signed: true, decimals: Number.isInteger(row.amount) ? 0 : 2},
        ),
        tone: row.type === 'income' ? 'income' : 'expense',
      }));
      upsertLocal(row);
      setLedgerFocus(row.transactionDate);
      setRefreshNonce(value => value + 1);
    },
    [currency.symbol, upsertLocal],
  );

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

  // Tips cover the current screen only; the + menu closes so they can show.
  const onTutorialStep = useCallback((step: TutorialStep | null) => {
    setTutorialStepId(step?.id ?? null);
    if (step) {
      setSheetOpen(false);
    }
  }, []);
  // A screen's tips wait until nothing is open on top of it.
  const overlayOpen =
    sheetOpen ||
    addKind !== null ||
    receiptScanner.image !== null ||
    profileOpen ||
    autoTrackOpen ||
    budgetOpen ||
    budgetEditOpen ||
    savingsOpen ||
    notificationsOpen ||
    reviewOpen ||
    restartOpen;

  let page = null;
  if (tab === 'home') {
    page = (
      <HomeScreen
        name={profileDraft.name}
        avatarUrl={profileDraft.avatarUrl}
        currencySymbol={currency.symbol}
        profileProgress={
          profileCompleteness({...profileDraft, monthlyBudget: budgetText}).ratio
        }
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
        budget={budgetState}
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
        monthlyBudget={monthlyBudgetOf(profileDraft)}
        trackingSince={trackingSince}
      />
    );
  }

  return (
    <TutorialProvider
      userId={user?.id ?? null}
      userMetadata={user?.user_metadata}
      tab={tab}
      ready={status === 'ready'}
      blocked={overlayOpen}
      onStepChange={onTutorialStep}
      restartKey={tutorialRestart}>
      <FloatingNavScrollProvider
            resetKey={`${tutorialStepId ?? ''}:${tab}:${profileOpen}:${autoTrackOpen}:${budgetOpen}:${budgetEditOpen}:${savingsOpen}:${notificationsOpen}:${sheetOpen}:${addKind ?? ''}:${editRow?.id ?? ''}`}>
        <View style={styles.root} collapsable={false}>
          <TabStage tab={tab} style={styles.stage}>
            {page}
          </TabStage>

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
            onSelect={onAddChoice}
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
            onSaved={row => showSaved(row, Boolean(editRow))}
          />

          <ReceiptReviewScreen
            image={receiptScanner.image}
            currencySymbol={currency.symbol}
            transactions={transactions}
            onClose={receiptScanner.clear}
            onSaved={(row, merged) => {
              receiptScanner.clear();
              showSaved(row, merged);
            }}
          />

          {/* Budget Details — opens from the Budget card on the dashboard */}
          <BudgetDetailsScreen
            visible={budgetOpen}
            onClose={() => setBudgetOpen(false)}
            currencySymbol={currency.symbol}
            budget={budgetState}
            bills={bills}
            spent={report.spent ?? 0}
            slices={report.slices ?? []}
            range={report.range ?? 'month'}
            transactions={transactions}
            categories={categories}
            payday={payday}
            onBillPress={
              budgetData.history.available
                ? bill => {
                    setBillSheet(bill);
                    setBillSheetOpen(true);
                  }
                : undefined
            }
            onAddMoney={budgetData.history.available ? () => setMoneySheet('top_up') : undefined}
            onEditBudget={() => {
              setBudgetOpen(false);
              openAfterHandoff(() => setBudgetEditOpen(true));
            }}
            sheets={
              <>
                <BillStatusSheet
                  visible={billSheetOpen}
                  bill={billSheet}
                  cycle={cycleBudget?.cycle ?? cycle}
                  currencySymbol={currency.symbol}
                  transactions={transactions}
                  linkedIds={linkedIds}
                  onAction={onBillAction}
                  onClose={() => setBillSheetOpen(false)}
                />
                <MoneySheet
                  visible={moneySheet === 'top_up'}
                  title="Add money to this month"
                  label="Amount"
                  symbol={currency.symbol}
                  value=""
                  lead="Extra income or a gift for this month. It goes into what you can spend, so today's limit and the days after it rise. Next month starts from your usual budget."
                  validate={value => (value !== '' && !(Number(value) > 0) ? 'Enter an amount above zero.' : null)}
                  onDone={value => moneyMoved('top_up', value)}
                  onClose={() => setMoneySheet(null)}
                />
              </>
            }
          />

          <MoneySheet
            visible={budgetEditOpen}
            title={monthlyTotal > 0 ? 'Edit budget' : 'Add budget'}
            label="Monthly budget"
            symbol={currency.symbol}
            value={budgetText}
            lead={`Everything you have for the month, bills and your savings goal included. Your bills (${formatMoney(
              plannedBills,
              currency.symbol,
              {decimals: 0},
            )}) and goal (${formatMoney(savingsGoal, currency.symbol, {
              decimals: 0,
            })}) are set aside, and the rest becomes one daily limit. A change counts from today.`}
            suggestion={
              income > 0
                ? {
                    label: `Use your income ${formatMoney(income, currency.symbol, {decimals: 0})}`,
                    value: String(income),
                  }
                : undefined
            }
            validate={value => planProblem(value, plannedBills, savingsGoal, currency.symbol)}
            renderExtra={value => (
              <>
                {budgetPreview(value)}
                {billsQuestion}
              </>
            )}
            onDone={value => {
              if (value === budgetText) {
                return;
              }
              const updated = withMonthlyTotal(profileDraft, value);
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
            budget={budgetState}
            monthlySavingsGoal={savingsGoal}
            history={budgetData.history}
            keptExtra={keptExtra}
            range={report.range ?? 'month'}
            transactions={transactions}
            categories={categories}
            onMoveToBudget={
              budgetData.history.available && budgetState?.kind === 'active'
                ? () => setMoneySheet('move_to_budget')
                : undefined
            }
            onMoveToSavings={
              budgetData.history.available && budgetState?.kind === 'active'
                ? () => setMoneySheet('move_to_savings')
                : undefined
            }
            sheets={
              <MoneySheet
                visible={moneySheet === 'move_to_budget' || moneySheet === 'move_to_savings'}
                title={moneySheet === 'move_to_savings' ? 'Move to savings' : 'Move to budget'}
                label="Amount"
                symbol={currency.symbol}
                value=""
                lead={
                  moneySheet === 'move_to_savings'
                    ? `Up to ${formatMoney(Math.max(0, budgetState?.remaining ?? 0), currency.symbol, {
                        decimals: 0,
                      })} of this month's unspent money. Your daily limit goes down to match.`
                    : `Up to ${formatMoney(keptExtra, currency.symbol, {
                        decimals: 0,
                      })} of your kept extra savings, added to what you can spend this month.`
                }
                validate={value => {
                  const amount = Number(value);
                  if (value === '') {
                    return null;
                  }
                  const most =
                    moneySheet === 'move_to_savings'
                      ? Math.max(0, budgetState?.remaining ?? 0)
                      : keptExtra;
                  return amount > 0 && amount <= most + 0.004
                    ? null
                    : `Enter up to ${formatMoney(most, currency.symbol, {decimals: 0})}.`;
                }}
                onDone={value =>
                  moneyMoved(moneySheet === 'move_to_savings' ? 'move_to_savings' : 'move_to_budget', value)
                }
                onClose={() => setMoneySheet(null)}
              />
            }
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
            onOpenAutoTracking={() => {
              setProfileOpen(false);
              openAfterHandoff(() => setAutoTrackOpen(true));
            }}
            monthlyBills={plannedBills}
            billsQuestion={billsQuestion}
            bills={editable}
            onSaveBill={saveEditedBill}
            onRemoveBill={removeEditedBill}
            onReplayTutorial={() => {
              setProfileOpen(false);
              openAfterHandoff(() => setTutorialRestart(value => value + 1));
            }}
            onClose={() => setProfileOpen(false)}
          />

          <SavedToast event={savedEvent} />

          <MonthStartReview
            visible={reviewOpen}
            month={reviewMonth}
            currencySymbol={currency.symbol}
            budget={budgetState}
            bills={bills}
            editableBills={editable}
            monthlyTotal={monthlyTotal}
            savingsGoal={savingsGoal}
            plannedBills={plannedBills}
            income={income}
            recountExtra={() => (reviewMonth ? recountedExtra(facts, reviewMonth) : 0)}
            onChoose={async (choice, extra) => {
              if (!reviewMonth) {
                return;
              }
              await chooseMonthExtra(reviewMonth.cycleStart, choice, extra, cycle.start);
              setRefreshNonce(n => n + 1);
            }}
            onSaveTotal={value => savePlanFields(withMonthlyTotal(profileDraft, value))}
            onSaveGoal={value => savePlanFields(withSavingsGoal(profileDraft, value))}
            onSaveBill={saveEditedBill}
            onRemoveBill={removeEditedBill}
            onClose={() => setReviewClosed(reviewMonth?.cycleStart ?? null)}
          />

          <Modal
            visible={restartOpen}
            animationType="slide"
            statusBarTranslucent
            onRequestClose={() => finishRestart(null)}>
            <OnboardingFlow
              mode="restart"
              initialDraft={profileDraft}
              passwordless
              knownBills={editable.map(bill => ({key: bill.key, label: bill.label, amount: bill.amount}))}
              onComplete={completed => finishRestart(completed)}
              onDismiss={() => finishRestart(null)}
            />
          </Modal>

          <AutoTrackingScreen
            visible={autoTrackOpen}
            currencySymbol={currency.symbol}
            // Back returns to Profile, where the dashboard was opened from.
            onClose={() => {
              setAutoTrackOpen(false);
              openAfterHandoff(() => setProfileOpen(true));
            }}
            onOpenBudget={() => {
              setAutoTrackOpen(false);
              openAfterHandoff(() => setBudgetEditOpen(true));
            }}
          />
        </View>
      </FloatingNavScrollProvider>
    </TutorialProvider>
  );
}

const styles = StyleSheet.create({
  preview: {
    marginTop: 12,
  },
  billsQuestion: {
    marginTop: 16,
  },
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  stage: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
