import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {useAuth} from '../auth/AuthProvider';
import {CategoryRow, loadCategories} from '../../lib/categoriesStore';
import {saveDueRecurring} from '../../lib/recurring';
import {applyScheduledSetup} from '../../lib/scheduledSetup';
import {
  TransactionRow,
  loadTransactions,
  needsOpeningSeed,
  removeLedgerRow,
  seedOpeningBalance,
  upsertLedgerRow,
} from '../../lib/transactionsStore';
import {
  EMPTY_MONEY_PLAN,
  HomeRange,
  HomeReport,
  MoneyPlan,
  buildHomeReport,
} from './homeReport';

type DashboardStatus = 'loading' | 'ready' | 'error';

export function useHomeDashboard(
  refreshNonce: number,
  openingAmount = 0,
  plan: MoneyPlan = EMPTY_MONEY_PLAN,
) {
  const {user} = useAuth();
  const [range, setRange] = useState<HomeRange>('month');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [status, setStatus] = useState<DashboardStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // When the fetch behind `transactions` started; 0 until the first load.
  const [ledgerAsOf, setLedgerAsOf] = useState(0);
  // Reloads overlap (every auto-track sync starts one), so only the latest
  // may apply its result.
  const latestRequest = useRef(0);
  // Bumped by local edits: a reload that started before one would undo it.
  const localEdits = useRef(0);
  const reloadRef = useRef<() => Promise<void>>(async () => {});

  const upsertLocal = useCallback((row: TransactionRow) => {
    localEdits.current += 1;
    setTransactions(current => upsertLedgerRow(current, row));
    setUpdatedAt(new Date());
    setStatus('ready');
    setError(null);
  }, []);

  const removeLocal = useCallback((id: string) => {
    localEdits.current += 1;
    setTransactions(current => removeLedgerRow(current, id));
    setUpdatedAt(new Date());
  }, []);

  const reload = useCallback(async () => {
    const request = ++latestRequest.current;
    if (!user) {
      setCategories([]);
      setTransactions([]);
      setStatus('ready');
      setRefreshing(false);
      return;
    }

    const editsAtStart = localEdits.current;
    let editedMeanwhile = false;
    setRefreshing(true);
    setError(null);
    let fetchStartedAt = Date.now();
    try {
      // Bills and salary picked at sign-up whose first date has come become
      // ledger rows (their monthly copies follow below) on every refresh, not
      // only at launch.
      try {
        await applyScheduledSetup(user);
      } catch {
        // Tried again on the next reload.
      }
      fetchStartedAt = Date.now();
      const [nextCategories, loaded] = await Promise.all([
        loadCategories(),
        loadTransactions(),
      ]);
      let nextTransactions = loaded;
      // Only touches the opening balance when it is missing or out of place.
      if (openingAmount > 0 && needsOpeningSeed(loaded)) {
        await seedOpeningBalance(openingAmount);
        fetchStartedAt = Date.now();
        nextTransactions = await loadTransactions();
      }
      // Monthly repeats that came due since the last visit become real rows.
      // A failure here must not hide the ledger that did load.
      try {
        if ((await saveDueRecurring(nextTransactions, user.id)) > 0) {
          fetchStartedAt = Date.now();
          nextTransactions = await loadTransactions();
        }
      } catch {
        // Tried again on the next reload.
      }
      // A newer reload started meanwhile: its ledger wins.
      if (request !== latestRequest.current) {
        return;
      }
      // An edit made meanwhile is not in this ledger: fetch again instead.
      if (localEdits.current !== editsAtStart) {
        editedMeanwhile = true;
        return;
      }
      setCategories(nextCategories);
      setTransactions(nextTransactions);
      setLedgerAsOf(fetchStartedAt);
      setUpdatedAt(new Date());
      setStatus('ready');
    } catch (caught) {
      if (request !== latestRequest.current) {
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not load your dashboard.',
      );
      setStatus('error');
    } finally {
      if (request === latestRequest.current && !editedMeanwhile) {
        setRefreshing(false);
      }
    }
    if (editedMeanwhile) {
      await reloadRef.current();
    }
  }, [openingAmount, user]);
  reloadRef.current = reload;

  useEffect(() => {
    reload();
  }, [reload, refreshNonce]);

  const report = useMemo<HomeReport>(
    () => buildHomeReport(transactions, categories, range, new Date(), plan),
    [categories, plan, range, transactions],
  );

  return {
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
    reload,
    upsertLocal,
    removeLocal,
  };
}
