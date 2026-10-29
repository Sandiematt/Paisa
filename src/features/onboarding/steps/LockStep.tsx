import React, {useCallback, useEffect, useState} from 'react';
import {View} from 'react-native';
import {CaretRight, CheckCircle, Fingerprint, Password} from 'phosphor-react-native';

import {
  AppText,
  GhostButton,
  GradientIconSquare,
  PressableScale,
  Stagger,
} from '../../../components/ui';
import {
  BiometricSupport,
  PIN_LENGTH,
  authenticate,
  biometricSupport,
} from '../../../lib/biometricLock';
import {colors, makeStyles, radii, spacing} from '../../../theme';
import {PinPad} from '../../security/PinPad';
import {STEP_TITLES} from '../constants';
import {StepLayout} from '../components/StepLayout';
import {OnboardingDraft} from '../types';

type LockStepProps = {
  draft: OnboardingDraft;
  onChange: <K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => void;
};

type Phase = 'choose' | 'pin' | 'confirm';

/**
 * Sets the lock up right here. A fingerprint is confirmed with a real scan;
 * a PIN is typed twice. The account does not exist yet, so the choice rides
 * on the draft and the lock provider adopts it once sign-up finishes.
 */
export function LockStep({draft, onChange}: LockStepProps) {
  const styles = useStyles();
  const copy = STEP_TITLES.lock;
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const lock = draft.appLock ?? null;

  useEffect(() => {
    let cancelled = false;
    biometricSupport()
      .then(result => {
        if (!cancelled) {
          setSupport(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSupport({available: false, reason: 'Biometrics are not available here.'});
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scanFingerprint = useCallback(async () => {
    if (scanning || !support?.available) {
      return;
    }
    setScanning(true);
    setMessage(null);
    try {
      if (await authenticate('Scan to lock Paisa')) {
        onChange('appLockPin', undefined);
        onChange('appLock', 'biometric');
      } else {
        setMessage('That scan did not go through. Try again, or use a PIN.');
      }
    } catch {
      setMessage('That scan did not go through. Try again, or use a PIN.');
    } finally {
      setScanning(false);
    }
  }, [onChange, scanning, support]);

  const startPin = () => {
    setMessage(null);
    setFirstPin('');
    setPin('');
    setPhase('pin');
  };

  const enterPin = (next: string) => {
    setMessage(null);
    setPin(next);
    if (next.length < PIN_LENGTH) {
      return;
    }
    if (phase === 'pin') {
      setFirstPin(next);
      setPin('');
      setPhase('confirm');
      return;
    }
    if (next === firstPin) {
      onChange('appLockPin', next);
      onChange('appLock', 'pin');
      setPhase('choose');
    } else {
      setMessage("Those PINs don't match. Choose one again.");
      setFirstPin('');
      setPin('');
      setPhase('pin');
    }
  };

  const reset = () => {
    onChange('appLock', null);
    onChange('appLockPin', undefined);
    setPhase('choose');
  };

  const biometricLabel = support?.available ? support.label : 'Fingerprint';

  if (lock) {
    return (
      <StepLayout title={copy.title} subtitle={copy.subtitle}>
        <Stagger index={1}>
          <View style={styles.done}>
            <GradientIconSquare size={56} gradient="savings">
              <CheckCircle size={28} color={colors.onAccent} weight="fill" />
            </GradientIconSquare>
            <AppText variant="heading" align="center">
              {lock === 'pin' ? 'PIN lock is on' : `${biometricLabel} lock is on`}
            </AppText>
            <AppText variant="body" color={colors.muted} align="center">
              {lock === 'pin'
                ? 'Paisa will ask for your 4-digit PIN each time it opens.'
                : `Paisa will ask for your ${biometricLabel.toLowerCase()} each time it opens.`}
            </AppText>
            <GhostButton label="Change how it locks" onPress={reset} />
          </View>
        </Stagger>
      </StepLayout>
    );
  }

  if (phase !== 'choose') {
    return (
      <StepLayout
        title={phase === 'pin' ? 'Choose a 4-digit PIN' : 'Enter it again'}
        subtitle={
          phase === 'pin'
            ? 'Only for Paisa, not your phone. Pick something you will remember.'
            : 'Type the same PIN once more to confirm it.'
        }>
        <Stagger index={1}>
          <PinPad value={pin} onChange={enterPin} error={message !== null} />
          {message ? (
            <AppText
              variant="caption"
              color={colors.roseLight}
              align="center"
              style={styles.message}>
              {message}
            </AppText>
          ) : null}
          <GhostButton
            label="Back to lock options"
            onPress={() => setPhase('choose')}
            style={styles.back}
          />
        </Stagger>
      </StepLayout>
    );
  }

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1} style={styles.options}>
        <LockOption
          icon={<Fingerprint size={24} color={colors.onAccent} weight="bold" />}
          title={biometricLabel}
          detail={
            support === null
              ? 'Checking this phone…'
              : support.available
                ? scanning
                  ? 'Waiting for your scan…'
                  : 'Scan now to turn it on'
                : support.reason
          }
          disabled={!support?.available || scanning}
          onPress={scanFingerprint}
        />
        <LockOption
          icon={<Password size={24} color={colors.onAccent} weight="bold" />}
          title="4-digit PIN"
          detail="A PIN just for Paisa, typed on a keypad"
          onPress={startPin}
        />
      </Stagger>
      {message ? (
        <AppText variant="caption" color={colors.roseLight} style={styles.message}>
          {message}
        </AppText>
      ) : null}
      <AppText variant="caption" color={colors.muted} style={styles.note}>
        Locks again after 15 seconds away. Change or turn it off any time in Profile.
      </AppText>
    </StepLayout>
  );
}

function LockOption({
  icon,
  title,
  detail,
  disabled = false,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      accessibilityLabel={`${title}. ${detail}`}
      style={[styles.option, disabled && styles.optionDisabled]}>
      <GradientIconSquare size={48} gradient={disabled ? 'savings' : 'fab'}>
        {icon}
      </GradientIconSquare>
      <View style={styles.optionText}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="caption" color={colors.muted}>
          {detail}
        </AppText>
      </View>
      {disabled ? null : <CaretRight size={18} color={colors.muted} weight="bold" />}
    </PressableScale>
  );
}

const useStyles = makeStyles(() => ({
  options: {
    gap: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  optionDisabled: {
    opacity: 0.55,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  message: {
    marginTop: spacing.lg,
  },
  note: {
    marginTop: spacing.xl,
    marginLeft: spacing.xs,
  },
  back: {
    marginTop: spacing.lg,
    alignSelf: 'center',
  },
  done: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
}));
