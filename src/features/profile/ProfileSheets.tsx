import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {CheckCircle} from 'phosphor-react-native/src/icons/CheckCircle';
import {X} from 'phosphor-react-native/src/icons/X';

import {
  AppText,
  GhostButton,
  PressableScale,
  PrimaryButton,
  TextField,
} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {
  BiometricSupport,
  LockMethod,
  PIN_LENGTH,
  biometricSupport,
} from '../../lib/biometricLock';
import {
  colors,
  duration,
  easing,
  layout,
  makeStyles,
  radii,
  spacing,
} from '../../theme';
import {PaydayGrid} from '../onboarding/components/PaydayGrid';
import {StagedLock} from '../security/BiometricLockProvider';
import {PinPad} from '../security/PinPad';
import {groupMoneyInput, sanitizeMoneyInput} from './moneyInput';

type SheetFrameProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Replaces the close button at the header's right edge. */
  trailing?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * DX bottom sheet: dark scrim, `surfaceRaised` panel with 28px top corners and
 * a grab handle. Tapping the scrim, the close button or the system back
 * gesture dismisses it.
 */
export function SheetFrame({
  visible,
  title,
  onClose,
  trailing,
  children,
}: SheetFrameProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const {height} = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: reducedMotion ? 0 : duration.enter,
        easing: easing.out,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? 0 : duration.exit,
      easing: easing.standard,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [visible, progress, reducedMotion]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [reducedMotion ? 0 : height * 0.5, 0],
  });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.scrim, {opacity: progress}]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
        />
      </Animated.View>
      <KeyboardAvoidingView
        behavior="padding"
        pointerEvents="box-none"
        style={styles.sheetHost}
      >
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight: height - insets.top - spacing.xl,
              transform: [{translateY}],
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <AppText
              variant="title"
              numberOfLines={1}
              style={styles.headerTitle}
            >
              {title}
            </AppText>
            {trailing ?? (
              <PressableScale
                onPress={onClose}
                scaleTo={0.92}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.closeButton}
              >
                <X size={18} color={colors.text} weight="bold" />
              </PressableScale>
            )}
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.sm,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type PaydaySheetProps = {
  visible: boolean;
  value: number | null;
  onSelect: (payday: number | null) => void;
  onClose: () => void;
};

/** Picks the day the budget month starts: payday, or the 1st for calendar months. */
export function PaydaySheet({
  visible,
  value,
  onSelect,
  onClose,
}: PaydaySheetProps) {
  const styles = useStyles();
  const pick = (payday: number | null) => {
    onSelect(payday);
    onClose();
  };
  return (
    <SheetFrame visible={visible} title="Pay cycle" onClose={onClose}>
      <AppText variant="body" color={colors.muted} style={styles.lead}>
        Your budget month runs from payday to the day before the next one. Home,
        the daily plan and budget alerts all follow it.
      </AppText>
      <PaydayGrid value={value} onSelect={pick} />
      {value !== null && value !== 1 ? (
        <GhostButton
          label="Use calendar months instead"
          onPress={() => pick(null)}
          style={styles.calendarReset}
        />
      ) : null}
    </SheetFrame>
  );
}

type AppLockSheetProps = {
  visible: boolean;
  method: LockMethod | null;
  /** Applies the choice; resolves with why it did not (scan failed, no sensor). */
  onChoose: (
    lock: StagedLock | null,
  ) => Promise<{ok: boolean; message?: string}>;
  onClose: () => void;
};

/** Pick how the app locks: fingerprint (scanned now), a PIN typed twice, or off. */
export function AppLockSheet({
  visible,
  method,
  onChoose,
  onClose,
}: AppLockSheetProps) {
  const styles = useStyles();
  const [phase, setPhase] = useState<'choose' | 'pin' | 'confirm'>('choose');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [support, setSupport] = useState<BiometricSupport | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setPhase('choose');
    setPin('');
    setFirstPin('');
    setMessage(null);
    biometricSupport()
      .then(setSupport)
      .catch(() =>
        setSupport({
          available: false,
          reason: 'Biometrics are not available here.',
        }),
      );
  }, [visible]);

  const choose = async (lock: StagedLock | null) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await onChoose(lock);
      if (result.ok) {
        onClose();
      } else {
        setMessage(result.message ?? 'That did not go through. Try again.');
        setPhase('choose');
      }
    } catch {
      setMessage('Could not change this setting. Try again.');
      setPhase('choose');
    } finally {
      setBusy(false);
    }
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
    } else if (next === firstPin) {
      choose({method: 'pin', pin: next});
    } else {
      setMessage("Those PINs don't match. Choose one again.");
      setFirstPin('');
      setPin('');
      setPhase('pin');
    }
  };

  const biometricLabel = support?.available ? support.label : 'Fingerprint';

  if (phase !== 'choose') {
    return (
      <SheetFrame
        visible={visible}
        title={phase === 'pin' ? 'Choose a 4-digit PIN' : 'Enter it again'}
        onClose={onClose}
      >
        <AppText variant="body" color={colors.muted} style={styles.lead}>
          {phase === 'pin'
            ? 'Only for Paisa, not your phone.'
            : 'Type the same PIN once more to confirm it.'}
        </AppText>
        <PinPad value={pin} onChange={enterPin} error={message !== null} />
        {message ? (
          <AppText
            variant="caption"
            color={colors.roseLight}
            align="center"
            style={styles.lockMessage}
          >
            {message}
          </AppText>
        ) : null}
        <GhostButton
          label="Back to lock options"
          onPress={() => setPhase('choose')}
          style={styles.calendarReset}
        />
      </SheetFrame>
    );
  }

  const options: {
    key: LockMethod | 'off';
    title: string;
    detail: string;
    disabled?: boolean;
    onPress: () => void;
  }[] = [
    {
      key: 'biometric',
      title: biometricLabel,
      detail:
        support && !support.available
          ? support.reason
          : method === 'biometric'
          ? 'On'
          : 'Scan to turn it on',
      disabled: !support?.available,
      onPress: () => choose({method: 'biometric'}),
    },
    {
      key: 'pin',
      title: '4-digit PIN',
      detail:
        method === 'pin'
          ? 'On · tap to pick a new PIN'
          : 'A PIN just for Paisa',
      onPress: () => {
        setMessage(null);
        setPhase('pin');
      },
    },
    {
      key: 'off',
      title: 'Off',
      detail: 'Paisa opens without asking',
      onPress: () => choose(null),
    },
  ];
  const current: LockMethod | 'off' = method ?? 'off';

  return (
    <SheetFrame visible={visible} title="App lock" onClose={onClose}>
      <AppText variant="body" color={colors.muted} style={styles.lead}>
        Choose how Paisa locks. It asks each time the app opens, and again after
        15 seconds away.
      </AppText>
      {options.map((option, index) => {
        const selected = option.key === current;
        return (
          <PressableScale
            key={option.key}
            onPress={option.onPress}
            disabled={option.disabled || busy}
            accessibilityRole="radio"
            accessibilityState={{
              checked: selected,
              disabled: option.disabled,
            }}
            accessibilityLabel={`${option.title}. ${option.detail}`}
            style={[
              styles.lockOption,
              index > 0 && styles.goalGap,
              selected && styles.lockOptionSelected,
              option.disabled && styles.lockOptionDisabled,
            ]}
          >
            <View style={styles.lockOptionText}>
              <AppText variant="heading">{option.title}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {option.detail}
              </AppText>
            </View>
            {selected ? (
              <CheckCircle size={22} color={colors.violet} weight="fill" />
            ) : null}
          </PressableScale>
        );
      })}
      {message ? (
        <AppText
          variant="caption"
          color={colors.roseLight}
          style={styles.lockMessage}
        >
          {message}
        </AppText>
      ) : null}
    </SheetFrame>
  );
}

type MoneySheetProps = {
  visible: boolean;
  title: string;
  /** Floating label on the field. */
  label: string;
  symbol: string;
  /** Raw digits (and optional `.`), no separators. */
  value: string;
  allowDecimal?: boolean;
  lead?: string;
  helper?: string;
  /** Extra content under the field, built from the in-progress value. */
  renderExtra?: (draft: string) => React.ReactNode;
  /** A value one tap puts in the field, such as a calculated amount; hidden while the field holds it. */
  suggestion?: {label: string; value: string};
  /** Why the typed amount cannot be saved; Done stays off while there is a reason. */
  validate?: (draft: string) => string | null;
  onDone: (value: string) => void;
  onClose: () => void;
};

/** One amount field in a sheet. Edits only land when the user taps Done. */
export function MoneySheet({
  visible,
  title,
  label,
  symbol,
  value,
  allowDecimal = false,
  lead,
  helper,
  renderExtra,
  suggestion,
  validate,
  onDone,
  onClose,
}: MoneySheetProps) {
  const styles = useStyles();
  const [draft, setDraft] = useState(value);
  const problem = validate ? validate(draft) : null;

  useEffect(() => {
    if (visible) {
      setDraft(value);
    }
    // Reset only when the sheet opens; typing must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <SheetFrame visible={visible} title={title} onClose={onClose}>
      {lead ? (
        <AppText variant="body" color={colors.muted} style={styles.lead}>
          {lead}
        </AppText>
      ) : null}
      <TextField
        label={label}
        prefix={symbol}
        helper={helper}
        value={groupMoneyInput(draft)}
        onChangeText={text => setDraft(sanitizeMoneyInput(text, allowDecimal))}
        keyboardType={allowDecimal ? 'decimal-pad' : 'number-pad'}
        placeholder="0"
        autoFocus
      />
      {renderExtra ? renderExtra(draft) : null}
      {problem ? (
        <AppText variant="caption" color={colors.roseLight} style={styles.suggestion}>
          {problem}
        </AppText>
      ) : null}
      {suggestion && suggestion.value !== draft ? (
        <GhostButton
          label={suggestion.label}
          tone="ink"
          style={styles.suggestion}
          onPress={() => setDraft(suggestion.value)}
        />
      ) : null}
      <PrimaryButton
        label="Done"
        style={styles.action}
        disabled={problem !== null}
        onPress={() => {
          onDone(draft);
          onClose();
        }}
      />
    </SheetFrame>
  );
}

type NameSheetProps = {
  visible: boolean;
  value: string;
  onDone: (value: string) => void;
  onClose: () => void;
};

export function NameSheet({visible, value, onDone, onClose}: NameSheetProps) {
  const styles = useStyles();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (visible) {
      setDraft(value);
      setError(undefined);
    }
    // Reset only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const commit = () => {
    if (!draft.trim()) {
      setError('Please enter your name.');
      return;
    }
    onDone(draft.trim());
    onClose();
  };

  return (
    <SheetFrame visible={visible} title="Your name" onClose={onClose}>
      <TextField
        label="Name"
        value={draft}
        error={error}
        onChangeText={text => {
          setDraft(text);
          if (error) {
            setError(undefined);
          }
        }}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="done"
        onSubmitEditing={commit}
        placeholder="e.g. Ananya Raghunathan"
        autoFocus
      />
      <PrimaryButton label="Done" style={styles.action} onPress={commit} />
    </SheetFrame>
  );
}

const useStyles = makeStyles(() => ({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheetHost: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.hairlineStrong,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding + spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  headerTitle: {
    flex: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.track,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding + spacing.xs,
    paddingTop: spacing.sm,
  },
  lead: {
    marginBottom: spacing.lg,
  },
  lockOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  lockOptionSelected: {
    borderColor: colors.violet,
    backgroundColor: colors.accentSoft,
  },
  lockOptionDisabled: {
    opacity: 0.55,
  },
  lockOptionText: {
    flex: 1,
    gap: 2,
  },
  lockMessage: {
    marginTop: spacing.md,
  },
  calendarReset: {
    marginTop: spacing.md,
    alignSelf: 'center',
  },
  goalGap: {
    marginTop: spacing.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  chipStatus: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  action: {
    marginTop: spacing.xl,
  },
  suggestion: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
}));
