import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {AppState, Modal, StatusBar, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {LockIcon} from '../../components/icons/FeatherIcons';
import {GhostButton, PrimaryButton, Text} from '../../components/ui';
import {
  authenticate,
  biometricSupport,
  loadBiometricPref,
  saveBiometricPref,
} from '../../lib/biometricLock';
import {colors, fonts} from '../../theme';
import {useAuth} from '../auth/AuthProvider';

// Leaving for the share sheet or a quick app switch should not re-prompt.
const RELOCK_AFTER_MS = 15_000;

type ToggleResult = {ok: true} | {ok: false; message?: string};

type BiometricLockValue = {
  enabled: boolean;
  setEnabled: (next: boolean) => Promise<ToggleResult>;
};

const BiometricLockContext = createContext<BiometricLockValue | null>(null);

export function BiometricLockProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {user, signOut} = useAuth();
  const userId = user?.id ?? null;
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const enabledRef = useRef(false);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    enabledRef.current = false;
    setEnabledState(false);
    setLocked(false);
    if (!userId) {
      return;
    }
    let cancelled = false;
    loadBiometricPref(userId).then(stored => {
      if (cancelled) {
        return;
      }
      enabledRef.current = stored;
      setEnabledState(stored);
      setLocked(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background') {
        backgroundedAt.current = Date.now();
        return;
      }
      if (state === 'active' && backgroundedAt.current !== null) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (enabledRef.current && away >= RELOCK_AFTER_MS) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  const setEnabled = useCallback(
    async (next: boolean): Promise<ToggleResult> => {
      if (!userId) {
        return {ok: false, message: 'Sign in to change this setting.'};
      }
      if (next) {
        const support = await biometricSupport();
        if (!support.available) {
          return {ok: false, message: support.reason};
        }
      }
      const passed = await authenticate(
        next ? 'Confirm to turn on Biometric Lock' : 'Confirm to turn off Biometric Lock',
      );
      if (!passed) {
        return {ok: false};
      }
      await saveBiometricPref(userId, next);
      enabledRef.current = next;
      setEnabledState(next);
      return {ok: true};
    },
    [userId],
  );

  const value = useMemo(() => ({enabled, setEnabled}), [enabled, setEnabled]);

  return (
    <BiometricLockContext.Provider value={value}>
      {children}
      <LockScreen
        visible={locked && !!userId}
        onUnlocked={() => setLocked(false)}
        onSignOut={signOut}
      />
    </BiometricLockContext.Provider>
  );
}

export function useBiometricLock() {
  const value = useContext(BiometricLockContext);
  if (!value) {
    throw new Error('useBiometricLock must be used inside BiometricLockProvider');
  }
  return value;
}

function LockScreen({
  visible,
  onUnlocked,
  onSignOut,
}: {
  visible: boolean;
  onUnlocked: () => void;
  onSignOut: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const unlock = useCallback(async () => {
    if (busy) {
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
  }, [busy, onUnlocked]);

  useEffect(() => {
    if (visible) {
      setFailed(false);
      unlock();
    }
    // Prompt once each time the lock appears; retries are user-initiated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {}}>
      <StatusBar barStyle="dark-content" />
      <View
        style={[
          styles.root,
          {paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24},
        ]}>
        <View style={styles.center}>
          <View style={styles.badge}>
            <LockIcon color={colors.ink} size={28} />
          </View>
          <Text
            fontFamily={fonts.outfitBold}
            fontSize={24}
            lineHeight={30}
            fontWeight="700"
            letterSpacing={-0.6}
            color={colors.ink}
            textAlign="center">
            Paisa is locked
          </Text>
          <Text
            fontFamily={fonts.interMedium}
            fontSize={14}
            lineHeight={20}
            fontWeight="500"
            color={colors.inkSecondary}
            textAlign="center">
            {failed
              ? 'Not recognised. Try again to see your money.'
              : 'Unlock with your fingerprint, face, or device PIN.'}
          </Text>
        </View>
        <View style={styles.actions}>
          <PrimaryButton
            label={busy ? 'Waiting…' : 'Unlock'}
            onPress={unlock}
            disabled={busy}
          />
          <GhostButton label="Sign out instead" onPress={() => onSignOut()} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actions: {
    gap: 4,
  },
});
