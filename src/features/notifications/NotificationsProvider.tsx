import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {AppState} from 'react-native';

import {
  budgetPeriodKey,
  planBudgetAlert,
  pruneHandledKeys,
} from '../../lib/notifications/budgetAlerts';
import {
  addToHistory,
  markAllItemsRead,
  markItemRead,
  unreadCountOf,
} from '../../lib/notifications/history';
import {
  loadHandledKeys,
  loadNotificationHistory,
  loadNotificationPrefs,
  markPermissionAsked,
  saveHandledKeys,
  saveNotificationHistory,
  saveNotificationPrefs,
  wasPermissionAsked,
} from '../../lib/notifications/notificationStorage';
import {
  NotificationTap,
  PermissionState,
  ReceivedNotification,
  cancelReminders,
  configureNotifications,
  getPermissionState,
  launchTap,
  onNotificationReceived,
  onNotificationTap,
  presentNotification,
  presentedNotifications,
  replaceReminders,
  requestPermissionState,
} from '../../lib/notifications/notificationService';
import {planReminders} from '../../lib/notifications/reminders';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationItem,
  NotificationPrefs,
  NotificationTarget,
} from '../../lib/notifications/types';
import {TransactionRow} from '../../lib/transactionsStore';
import {useAuth} from '../auth/AuthProvider';

/** What the app knows about spending; the provider decides what to notify. */
export type NotificationSnapshot = {
  transactions: TransactionRow[];
  /**
   * This budget cycle, from the rolling budget (src/lib/budgetEngine.ts):
   * day-to-day spending so far against what the cycle has for it. Null with
   * no running budget (none set, waiting to start, or needing a fix).
   */
  budget: {
    /** Month the cycle starts in, `YYYY-MM`: one set of alerts per cycle. */
    period: string;
    spent: number;
    spendable: number;
  } | null;
  currencySymbol: string;
};

type NotificationsValue = {
  prefs: NotificationPrefs;
  updatePrefs: (patch: Partial<NotificationPrefs>) => void;
  items: NotificationItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Marks the item read and asks the main screens to open its target. */
  openItem: (item: NotificationItem) => void;
  permission: PermissionState;
  /** Prompts if the OS has not been asked yet; resolves to the new state. */
  ensurePermission: () => Promise<PermissionState>;
  setSnapshot: (snapshot: NotificationSnapshot | null) => void;
  pendingTarget: NotificationTarget | null;
  consumeTarget: () => void;
};

const NotificationsContext = createContext<NotificationsValue | null>(null);

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {user} = useAuth();
  const userId = user?.id ?? null;

  const [prefs, setPrefsState] = useState(DEFAULT_NOTIFICATION_PREFS);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [snapshot, setSnapshot] = useState<NotificationSnapshot | null>(null);
  const [pendingTarget, setPendingTarget] =
    useState<NotificationTarget | null>(null);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const userRef = useRef<string | null>(userId);
  userRef.current = userId;
  const prefsRef = useRef(prefs);
  const itemsRef = useRef<NotificationItem[]>([]);
  const handledRef = useRef<Record<string, string>>({});
  const tapsSeen = useRef(new Set<string>());
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Checks touch storage and the OS, so they run one at a time in order; the
  // last one queued always reflects the newest state.
  const enqueue = useCallback((task: () => Promise<void>) => {
    queue.current = queue.current.then(task).catch(() => {});
  }, []);

  const commitItems = useCallback((next: NotificationItem[]) => {
    const owner = userRef.current;
    if (!owner || next === itemsRef.current) {
      return;
    }
    itemsRef.current = next;
    setItems(next);
    saveNotificationHistory(owner, next).catch(() => {});
  }, []);

  const recordReceived = useCallback(
    (received: ReceivedNotification) => {
      commitItems(
        addToHistory(itemsRef.current, {
          id: received.id,
          kind: received.kind,
          title: received.title,
          body: received.body,
          createdAt: received.deliveredAt,
          read: false,
          target: received.target,
        }),
      );
    },
    [commitItems],
  );

  const markRead = useCallback(
    (id: string) => commitItems(markItemRead(itemsRef.current, id)),
    [commitItems],
  );

  const markAllRead = useCallback(
    () => commitItems(markAllItemsRead(itemsRef.current)),
    [commitItems],
  );

  const openItem = useCallback(
    (item: NotificationItem) => {
      markRead(item.id);
      setPendingTarget(item.target);
    },
    [markRead],
  );

  const handleTap = useCallback(
    (tap: NotificationTap) => {
      if (tapsSeen.current.has(tap.tapKey)) {
        return;
      }
      tapsSeen.current.add(tap.tapKey);
      // A banner left over from another account must not steer this one.
      if (!userRef.current || tap.userId !== userRef.current) {
        return;
      }
      recordReceived(tap);
      markRead(tap.id);
      setPendingTarget(tap.target);
    },
    [markRead, recordReceived],
  );

  // Load this user's preferences and history; clear everything on sign-out.
  useEffect(() => {
    let cancelled = false;
    setHydratedFor(null);
    itemsRef.current = [];
    handledRef.current = {};
    setItems([]);
    setPrefsState(DEFAULT_NOTIFICATION_PREFS);
    prefsRef.current = DEFAULT_NOTIFICATION_PREFS;
    setPendingTarget(null);
    setSnapshot(null);

    if (!userId) {
      enqueue(cancelReminders);
      return;
    }

    (async () => {
      try {
        await configureNotifications();
        const [storedPrefs, history, handled, state, asked] =
          await Promise.all([
            loadNotificationPrefs(userId),
            loadNotificationHistory(userId),
            loadHandledKeys(userId),
            getPermissionState(),
            wasPermissionAsked(),
          ]);
        if (cancelled) {
          return;
        }
        prefsRef.current = storedPrefs;
        itemsRef.current = history;
        handledRef.current = handled;
        setPrefsState(storedPrefs);
        setItems(history);
        setPermission(state);
        setHydratedFor(userId);

        const wantsAny =
          storedPrefs.budgetExceeded ||
          storedPrefs.budgetWarning ||
          storedPrefs.expenseReminder;
        if (state === 'undetermined' && !asked && wantsAny) {
          await markPermissionAsked();
          const next = await requestPermissionState();
          if (!cancelled) {
            setPermission(next);
          }
        }
      } catch {
        // Notifications are an extra; never block the app on them.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enqueue, userId]);

  // Coming back to the app may follow a new day, a month rollover, or a
  // permission change made in system settings.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        getPermissionState().then(setPermission);
        setTick(value => value + 1);
      }
    });
    return () => subscription.remove();
  }, []);

  // Deliveries and taps, once history is loaded so they land in the right list.
  useEffect(() => {
    if (!userId || hydratedFor !== userId) {
      return;
    }
    const offReceived = onNotificationReceived(received => {
      if (received.userId === userRef.current) {
        recordReceived(received);
      }
    });
    const offTap = onNotificationTap(handleTap);
    launchTap().then(tap => {
      if (tap) {
        handleTap(tap);
      }
    });
    return () => {
      offReceived();
      offTap();
    };
  }, [handleTap, hydratedFor, recordReceived, userId]);

  // The core pass: adopt anything delivered while closed, raise budget alerts,
  // and rebuild the reminder queue. Safe to repeat; every step is idempotent.
  useEffect(() => {
    if (!userId || hydratedFor !== userId) {
      return;
    }
    const owner = userId;
    const now = new Date();

    enqueue(async () => {
      if (userRef.current !== owner) {
        return;
      }

      for (const delivered of await presentedNotifications()) {
        if (delivered.userId === owner) {
          recordReceived(delivered);
        }
      }

      if (snapshot?.budget) {
        const plan = planBudgetAlert({
          userId: owner,
          now,
          spent: snapshot.budget.spent,
          budget: snapshot.budget.spendable,
          period: snapshot.budget.period,
          currencySymbol: snapshot.currencySymbol,
          prefs,
          handled: new Set(Object.keys(handledRef.current)),
        });

        if (plan.consume.length > 0) {
          // Claim the keys before showing anything: a crash or a concurrent
          // pass must never be able to show the same alert twice.
          const stamp = now.toISOString();
          const claimed = {...handledRef.current};
          for (const key of plan.consume) {
            claimed[key] = stamp;
          }
          const keepFrom = budgetPeriodKey(
            new Date(now.getFullYear(), now.getMonth() - 2, 1),
          );
          handledRef.current = pruneHandledKeys(claimed, keepFrom);
          await saveHandledKeys(owner, handledRef.current);

          if (plan.fire && userRef.current === owner) {
            recordReceived({
              id: plan.fire.id,
              userId: owner,
              kind: plan.fire.kind,
              target: 'budget',
              title: plan.fire.title,
              body: plan.fire.body,
              deliveredAt: stamp,
            });
            if (permission === 'granted') {
              await presentNotification({userId: owner, ...plan.fire});
            }
          }
        }
      }

      if (!prefs.expenseReminder || permission !== 'granted') {
        await cancelReminders();
      } else if (snapshot) {
        await replaceReminders(
          owner,
          planReminders({
            now,
            minutes: prefs.reminderMinutes,
            transactions: snapshot.transactions,
          }),
        );
      }
    });
  }, [
    enqueue,
    hydratedFor,
    permission,
    prefs,
    recordReceived,
    snapshot,
    tick,
    userId,
  ]);

  const updatePrefs = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      const owner = userRef.current;
      if (!owner) {
        return;
      }
      const next = {...prefsRef.current, ...patch};
      prefsRef.current = next;
      setPrefsState(next);
      saveNotificationPrefs(owner, next).catch(() => {});
    },
    [],
  );

  const ensurePermission = useCallback(async () => {
    let state = await getPermissionState();
    if (state === 'undetermined') {
      await markPermissionAsked();
      state = await requestPermissionState();
    }
    setPermission(state);
    return state;
  }, []);

  const consumeTarget = useCallback(() => setPendingTarget(null), []);

  const value = useMemo<NotificationsValue>(
    () => ({
      prefs,
      updatePrefs,
      items,
      unreadCount: unreadCountOf(items),
      markRead,
      markAllRead,
      openItem,
      permission,
      ensurePermission,
      setSnapshot,
      pendingTarget,
      consumeTarget,
    }),
    [
      consumeTarget,
      ensurePermission,
      items,
      markAllRead,
      markRead,
      openItem,
      pendingTarget,
      permission,
      prefs,
      updatePrefs,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) {
    throw new Error(
      'useNotifications must be used inside NotificationsProvider',
    );
  }
  return value;
}
