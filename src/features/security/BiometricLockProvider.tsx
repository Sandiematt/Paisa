import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {AppState, Modal, StatusBar, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {Lock} from 'phosphor-react-native/src/icons/Lock';

import {
  AppText,
  GhostButton,
  GradientIconSquare,
  PrimaryButton,
} from '../../components/ui';
import {
  LockMethod,
  PIN_LENGTH,
  PinRecord,
  authenticate,
  biometricSupport,
  loadLockMethod,
  loadPinRecord,
  makePinRecord,
  pinMatches,
  saveLock,
} from '../../lib/biometricLock';
import {
  colors,
  linearGradient,
  makeStyles,
  spacing,
  useTheme,
} from '../../theme';
import {useAuth} from '../auth/AuthProvider';
import {PinPad} from './PinPad';

// Leaving for the share sheet or a quick app switch should not re-prompt.
const RELOCK_AFTER_MS = 15_000;

type ToggleResult = {ok: true} | {ok: false; message?: string};

/** A lock set up during onboarding: a confirmed fingerprint scan, or a new PIN. */
export type StagedLock = {method: 'biometric'} | {method: 'pin'; pin: string};

type BiometricLockValue = {
  enabled: boolean;
  /** How the app locks while enabled. */
  method: LockMethod | null;
  /**
   * Switches the lock from settings: a fingerprint is confirmed with a scan,
   * a PIN is the one just typed twice, null turns the lock off.
   */
  setLock: (lock: StagedLock | null) => Promise<ToggleResult>;
  /**
   * Turns the lock on without asking again, for a choice already confirmed
   * during onboarding. Before sign-up finishes there is no user yet, so the
   * choice waits and applies to the next account that loads.
   */
  stageEnabled: (lock: StagedLock) => void;
};

const BiometricLockContext = createContext<BiometricLockValue | null>(null);

export function BiometricLockProvider({
  children,
  suspended = false,
}: {
  children: React.ReactNode;
  /** Hold the lock screen (and its prompt) back, e.g. while the launch splash plays. */
  suspended?: boolean;
}) {
  const {user, signOut} = useAuth();
  const userId = user?.id ?? null;
  const [method, setMethodState] = useState<LockMethod | null>(null);
  const [locked, setLocked] = useState(false);
  // True until this account's lock choice has loaded: until then nobody
  // knows whether the app may show, so it stays covered.
  const [checking, setChecking] = useState(false);
  // Covers the app while it is in the background, so coming back never
  // shows money before deciding whether to lock.
  const [covered, setCovered] = useState(false);
  const enabledRef = useRef(false);
  const staged = useRef<StagedLock | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const enabled = method !== null;

  const setMethod = useCallback((next: LockMethod | null) => {
    enabledRef.current = next !== null;
    setMethodState(next);
  }, []);

  const adopt = useCallback(
    (id: string, lock: StagedLock) => {
      setMethod(lock.method);
      setLocked(false);
      saveLock(
        id,
        lock.method === 'pin'
          ? {method: 'pin', record: makePinRecord(lock.pin)}
          : {method: 'biometric'},
      ).catch(() => {});
    },
    [setMethod],
  );

  useEffect(() => {
    setMethod(null);
    setLocked(false);
    setCovered(false);
    if (!userId) {
      setChecking(false);
      return;
    }
    if (staged.current) {
      const lock = staged.current;
      staged.current = null;
      setChecking(false);
      adopt(userId, lock);
      return;
    }
    let cancelled = false;
    setChecking(true);
    loadLockMethod(userId).then(stored => {
      if (cancelled) {
        return;
      }
      setMethod(stored);
      setLocked(stored !== null);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [adopt, setMethod, userId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
        if (enabledRef.current) {
          setCovered(true);
        }
        return;
      }
      if (state === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (enabledRef.current && away >= RELOCK_AFTER_MS) {
          setLocked(true);
        }
        setCovered(false);
      }
    });
    return () => sub.remove();
  }, []);

  const setLock = useCallback(
    async (lock: StagedLock | null): Promise<ToggleResult> => {
      if (!userId) {
        return {ok: false, message: 'Sign in to change this setting.'};
      }
      if (lock?.method === 'biometric') {
        const support = await biometricSupport();
        if (!support.available) {
          return {ok: false, message: support.reason};
        }
        if (!(await authenticate('Scan to lock Paisa'))) {
          return {ok: false};
        }
        await saveLock(userId, {method: 'biometric'});
      } else if (lock?.method === 'pin') {
        await saveLock(userId, {
          method: 'pin',
          record: makePinRecord(lock.pin),
        });
      } else {
        await saveLock(userId, null);
      }
      setMethod(lock?.method ?? null);
      return {ok: true};
    },
    [setMethod, userId],
  );

  const stageEnabled = useCallback(
    (lock: StagedLock) => {
      if (userId) {
        adopt(userId, lock);
      } else {
        staged.current = lock;
      }
    },
    [adopt, userId],
  );

  const value = useMemo(
    () => ({enabled, method, setLock, stageEnabled}),
    [enabled, method, setLock, stageEnabled],
  );

  return (
    <BiometricLockContext.Provider value={value}>
      {children}
      <LockScreen
        visible={(locked || checking || covered) && !!userId && !suspended}
        prompt={locked}
        method={method}
        userId={userId}
        onUnlocked={() => setLocked(false)}
        onSignOut={signOut}
      />
    </BiometricLockContext.Provider>
  );
}

export function useBiometricLock() {
  const value = useContext(BiometricLockContext);
  if (!value) {
    throw new Error(
      'useBiometricLock must be used inside BiometricLockProvider',
    );
  }
  return value;
}

function LockScreen({
  visible,
  prompt,
  method,
  userId,
  onUnlocked,
  onSignOut,
}: {
  visible: boolean;
  /** False while it only covers the app (loading, or in the background). */
  prompt: boolean;
  method: LockMethod | null;
  userId: string | null;
  onUnlocked: () => void;
  onSignOut: () => Promise<void>;
}) {
  const styles = useStyles();
  const {scheme} = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pin, setPin] = useState('');
  const pinRecord = useRef<PinRecord | null>(null);
  const usesPin = method === 'pin';

  useEffect(() => {
    if (visible && usesPin && userId) {
      loadPinRecord(userId).then(record => {
        pinRecord.current = record;
      });
    }
  }, [usesPin, userId, visible]);

  const enterPin = useCallback(
    (next: string) => {
      setFailed(false);
      setPin(next);
      if (next.length < PIN_LENGTH) {
        return;
      }
      const record = pinRecord.current;
      if (record && pinMatches(record, next)) {
        setPin('');
        onUnlocked();
      } else {
        setFailed(true);
        setPin('');
      }
    },
    [onUnlocked],
  );

  const unlock = useCallback(async () => {
    if (busy || usesPin) {
      return;
    }
    setBusy(true);
    try {
      const passed = await authenticate('Unlock Paisa');
      if (passed) {
        setFailed(false);
        onUnlocked();
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [busy, onUnlocked, usesPin]);

  useEffect(() => {
    if (visible && prompt) {
      setFailed(false);
      setPin('');
      unlock();
    }
    // Prompt once each time the lock appears (or a cover turns into the
    // lock); retries are user-initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, prompt]);

  return (
    <Modal
      visible={visible}
      // No fade: during one, the money behind would still show through.
      animationType="none"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <StatusBar
        barStyle={scheme === 'light' ? 'dark-content' : 'light-content'}
      />
      <View
        style={[
          styles.root,
          {paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24},
        ]}
      >
        <View pointerEvents="none" style={styles.glow} />
        <View style={styles.center}>
          <GradientIconSquare size={72} glow style={styles.badge}>
            <Lock size={32} color={colors.onAccent} weight="fill" />
          </GradientIconSquare>
          {prompt ? (
            <>
              <AppText variant="title" align="center" style={styles.title}>
                Paisa is locked
              </AppText>
              <AppText
                variant="body"
                color={failed ? colors.roseLight : colors.muted}
                align="center"
                accessibilityLiveRegion="polite"
              >
                {usesPin
                  ? failed
                    ? 'Wrong PIN. Try again.'
                    : 'Enter your Paisa PIN.'
                  : failed
                  ? 'Not recognised. Try again to see your money.'
                  : 'Unlock with your fingerprint, face, or device PIN.'}
              </AppText>
              {usesPin ? (
                <View style={styles.pin}>
                  <PinPad value={pin} onChange={enterPin} error={failed} />
                </View>
              ) : null}
            </>
          ) : null}
        </View>
        {prompt ? (
          <View style={styles.actions}>
            {usesPin ? null : (
              <PrimaryButton
                label={busy ? 'Waiting…' : 'Unlock'}
                onPress={unlock}
                disabled={busy}
              />
            )}
            <GhostButton label="Sign out instead" onPress={() => onSignOut()} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    flex: 1,
    backgroundColor: colors.ground,
    paddingHorizontal: spacing.xxl,
    justifyContent: 'space-between',
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
    backgroundImage: linearGradient([colors.glow, colors.ground], 180),
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  badge: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
  },
  actions: {
    gap: spacing.xs,
  },
  pin: {
    marginTop: spacing.xxl,
    alignSelf: 'stretch',
  },
}));
