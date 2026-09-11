import {useCallback, useEffect, useMemo, useState} from 'react';

import {useAuth} from '../auth/AuthProvider';
import {CategoryRow, loadCategories} from '../../lib/categoriesStore';
import {
  TransactionRow,
  loadTransactions,
  seedOpeningBalance,
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

  const reload = useCallback(async () => {
    if (!user) {
      setCategories([]);
      setTransactions([]);
      setStatus('ready');
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    setError(null);
    try {
      if (openingAmount > 0) {
        await seedOpeningBalance(openingAmount);
      }
      const [nextCategories, nextTransactions] = await Promise.all([
        loadCategories(),
        loadTransactions(),
      ]);
      setCategories(nextCategories);
      setTransactions(nextTransactions);
      setUpdatedAt(new Date());
      setStatus('ready');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not load your dashboard.',
      );
      setStatus('error');
    } finally {
      setRefreshing(false);
    }
  }, [openingAmount, user]);

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
    reload,
  };
}
