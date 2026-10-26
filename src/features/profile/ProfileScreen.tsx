import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  ArrowRight,
  CaretRight,
  Compass,
  Coins,
  CurrencyInr,
  DownloadSimple,
  FileCsv,
  Fingerprint,
  Flag,
  Lightning,
  PencilSimple,
  PiggyBank,
  SealCheck,
  SignOut,
  SquaresFour,
  Target,
  Trash,
  Wallet,
} from 'phosphor-react-native';

import {CameraGlyph, CheckGlyph} from '../../components/icons/Glyphs';
import {
  AppText,
  BackButton,
  Card,
  GradientView,
  Loader,
  PressableScale,
  ProgressRing,
  Screen,
  SectionTitle,
  SettingsGroup,
  SettingsRow,
  ToggleSwitch,
} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {exportTransactionsCsv} from '../../lib/exportCsv';
import {transactionsInMonth} from '../../lib/exportMonth';
import {SaveProfileOptions} from '../../lib/profileStore';
import {deleteAccount} from '../../lib/supabase/account';
import {
  loadTransactions,
  walletBalanceFrom,
} from '../../lib/transactionsStore';
import {
  colors,
  duration,
  easing,
  fonts,
  radii,
  shadows,
  spacing,
} from '../../theme';
import {budgetForDay, scaleMonthly, yearlyFromMonthly} from '../home/homeReport';
import {
  currencyByCode,
  MIN_CATEGORIES,
} from '../onboarding/constants';
import {GoalId, OnboardingDraft} from '../onboarding/types';
import {useAutoTrack} from '../autotrack/AutoTrackProvider';
import {autoTrackState} from '../autotrack/autoTrackFormat';
import {useBiometricLock} from '../security/BiometricLockProvider';
import {AvatarPickerModal} from './AvatarPickerModal';
import {useNotificationSettings} from './NotificationsSettingsSection';
import {ProfileGoalKey, profileCompleteness} from './profileCompleteness';
import {balanceFieldText, planProfileSave} from './profileSavePlan';
import {
  CategoriesSheet,
  GoalSheet,
  MoneySheet,
  NameSheet,
} from './ProfileSheets';

type ProfileScreenProps = {
  visible: boolean;
  draft: OnboardingDraft;
  onSave: (
    updated: OnboardingDraft,
    options?: SaveProfileOptions,
  ) => void;
  onSignOut?: () => void | Promise<void>;
  /** Opens the UPI auto-tracking dashboard. The row shows only on Android. */
  onOpenAutoTracking?: () => void;
  /** Closes Profile and plays the app tour again. */
  onReplayTutorial?: () => void;
  onClose: () => void;
};

type SheetKey =
  | 'name'
  | 'balance'
  | 'income'
  | 'budget'
  | 'savings'
  | 'categories'
  | 'goal';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOAST_DURATION_MS = 2200;
const APP_VERSION = 'v0.0.1 (Beta)';
const ICON_SIZE = 24;

const SHORT_GOAL: Record<GoalId, string> = {
  track: 'Track spending',
  save: 'Save more',
  split: 'Split bills',
};

const NUDGE: Record<ProfileGoalKey, {text: string; sheet: SheetKey}> = {
  income: {
    text: 'Add your monthly income so Paisa can plan what is left after your budget.',
    sheet: 'income',
  },
  budget: {
    text: 'Set a monthly budget so Paisa can pace your spending day by day.',
    sheet: 'budget',
  },
  savings: {
    text: 'Set a savings goal so Paisa can cheer you on every month.',
    sheet: 'savings',
  },
  categories: {
    text: `Pick at least ${MIN_CATEGORIES} categories to track your spending.`,
    sheet: 'categories',
  },
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'P';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatDerived(amount: number, symbol: string): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasCents = Math.abs(rounded % 1) > 0.001;
  return `${symbol}${rounded.toLocaleString('en-IN', {
    maximumFractionDigits: hasCents ? 2 : 0,
    minimumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

function SaveToast({visible}: {visible: boolean}) {
  const reducedMotion = useReducedMotion();
  const translateY = useRef(new Animated.Value(-64)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const move = reducedMotion ? 0 : visible ? 0 : -64;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: move,
        duration: visible ? duration.enter : duration.exit,
        easing: visible ? easing.out : easing.standard,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? duration.control : duration.exit,
        easing: visible ? easing.out : easing.standard,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, reducedMotion, translateY, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[toastStyles.container, {transform: [{translateY}], opacity}]}>
      <CheckGlyph color={colors.mint} size={14} />
      <AppText variant="bodyStrong">Changes saved</AppText>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 62,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    zIndex: 100,
    ...shadows.card,
  },
});

export function ProfileScreen({
  visible,
  draft,
  onSave,
  onSignOut,
  onOpenAutoTracking,
  onReplayTutorial,
  onClose,
}: ProfileScreenProps) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(draft.name);
  const [email, setEmail] = useState(draft.email);
  const [monthlyIncome, setMonthlyIncome] = useState(draft.monthlyIncome);
  const [monthlyBudget, setMonthlyBudget] = useState(draft.monthlyBudget);
  const [monthlySavingsGoal, setMonthlySavingsGoal] = useState(
    draft.monthlySavingsGoal,
  );
  const [currentBalance, setCurrentBalance] = useState('');
  const [currentBalanceDirty, setCurrentBalanceDirty] = useState(false);
  const computedBalance = useRef(0);
  const [goal, setGoal] = useState<GoalId | null>(draft.goal);
  const [categoryIds, setCategoryIds] = useState<string[]>(draft.categoryIds);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(draft.avatarUrl);
  /** Real transactions this month, or null until the ledger has loaded. */
  const [monthCount, setMonthCount] = useState<number | null>(null);

  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const biometricLock = useBiometricLock();
  const notificationSettings = useNotificationSettings();
  const autoTrack = useAutoTrack();
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [exporting, setExporting] = useState<'month' | 'all' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setToastVisible(true);
    toastTimer.current = setTimeout(() => {
      setToastVisible(false);
      toastTimer.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setName(draft.name);
    setEmail(draft.email);
    setMonthlyIncome(draft.monthlyIncome);
    setMonthlyBudget(draft.monthlyBudget);
    setMonthlySavingsGoal(draft.monthlySavingsGoal);
    setCurrentBalanceDirty(false);
    setGoal(draft.goal);
    setCategoryIds(draft.categoryIds);
    setAvatarUrl(draft.avatarUrl);
    setSheet(null);
  }, [draft, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    loadTransactions()
      .then(rows => {
        if (cancelled) {
          return;
        }
        const balance = walletBalanceFrom(rows);
        computedBalance.current = balance;
        setCurrentBalance(balanceFieldText(balance));
        setMonthCount(transactionsInMonth(rows, new Date()).length);
      })
      .catch(() => {
        if (!cancelled) {
          computedBalance.current = 0;
          setCurrentBalance('');
          setMonthCount(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const activeCurrency = useMemo(() => currencyByCode(draft.currency), [draft.currency]);
  const symbol = activeCurrency.symbol;
  const emailVerified = EMAIL_PATTERN.test(email.trim());

  const completeness = profileCompleteness(
    {monthlyIncome, monthlyBudget, monthlySavingsGoal, categoryIds},
    MIN_CATEGORIES,
  );
  const nudge = completeness.next ? NUDGE[completeness.next] : null;

  const dirty =
    name !== draft.name ||
    monthlyIncome !== draft.monthlyIncome ||
    monthlyBudget !== draft.monthlyBudget ||
    monthlySavingsGoal !== draft.monthlySavingsGoal ||
    goal !== draft.goal ||
    avatarUrl !== draft.avatarUrl ||
    currentBalanceDirty ||
    categoryIds.length !== draft.categoryIds.length ||
    categoryIds.some(id => !draft.categoryIds.includes(id));

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Name needed', 'Add your name before saving.');
      setSheet('name');
      return;
    }

    const plan = planProfileSave({
      draft: {
        name: name.trim(),
        email: email.trim(),
        currency: draft.currency,
        startingBalance: draft.startingBalance,
        monthlyIncome,
        monthlyBudget,
        monthlySavingsGoal,
        goal,
        categoryIds,
        avatarUrl,
      },
      original: draft,
      computedBalance: computedBalance.current,
      balanceText: currentBalance,
      balanceEdited: currentBalanceDirty,
    });

    onSave(plan.draft, plan.options);
    showToast();
  };

  const signOut = async () => {
    if (!onSignOut || signingOut) {
      return;
    }
    setSigningOut(true);
    try {
      await onSignOut();
    } catch {
      setSigningOut(false);
      Alert.alert('Could not sign out', 'Check your connection and try again.');
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in with the same email.', [
      {text: 'Stay', style: 'cancel'},
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: signOut,
      },
    ]);
  };

  const toggleBiometric = async (next: boolean) => {
    if (biometricBusy) {
      return;
    }
    setBiometricBusy(true);
    try {
      const result = await biometricLock.setEnabled(next);
      if (!result.ok && result.message) {
        Alert.alert('Biometric Lock', result.message);
      }
    } catch {
      Alert.alert('Biometric Lock', 'Could not change this setting. Try again.');
    } finally {
      setBiometricBusy(false);
    }
  };

  const runExport = async (scope: 'month' | 'all') => {
    if (exporting) {
      return;
    }
    setExporting(scope);
    try {
      const result = await exportTransactionsCsv(
        draft.currency,
        scope === 'month' ? {month: new Date()} : {},
      );
      if (result.rows === 0) {
        Alert.alert(
          'Nothing to export yet',
          scope === 'month'
            ? 'Add a transaction this month first, or export all transactions from App settings.'
            : 'Add a transaction first, then export your CSV.',
        );
      }
    } catch (caught) {
      Alert.alert(
        'Export failed',
        caught instanceof Error ? caught.message : 'Try again in a moment.',
      );
    } finally {
      setExporting(null);
    }
  };

  const runDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      Alert.alert('Account deleted', 'Your account and all its data are gone.');
    } catch (caught) {
      setDeleting(false);
      Alert.alert(
        'Could not delete account',
        caught instanceof Error ? caught.message : 'Try again in a moment.',
      );
    }
  };

  const confirmDelete = () => {
    if (deleting) {
      return;
    }
    Alert.alert(
      'Delete account?',
      'Your login, profile, categories, and every transaction will be permanently deleted. Export a CSV first if you want a copy.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'This cannot be undone',
              'Delete this account and all of its data now?',
              [
                {text: 'Keep account', style: 'cancel'},
                {
                  text: 'Delete forever',
                  style: 'destructive',
                  onPress: runDelete,
                },
              ],
            ),
        },
      ],
    );
  };

  const closeSheet = () => setSheet(null);

  const dailyHintFor = (budgetText: string): string | undefined => {
    const budgetNumber = Number(budgetText) || 0;
    const perDay =
      budgetNumber > 0 ? Math.round(budgetForDay(budgetNumber, new Date())) : 0;
    if (perDay <= 0) {
      return undefined;
    }
    const income = Number(monthlyIncome) || 0;
    const leftover = income > 0 && budgetNumber > 0 ? income - budgetNumber : 0;
    const savingsNumber = Number(monthlySavingsGoal) || 0;
    const perDayText = `${symbol}${perDay.toLocaleString('en-IN')}`;
    if (leftover === 0) {
      return `About ${perDayText} / day.`;
    }
    return leftover >= savingsNumber
      ? `About ${perDayText} / day · ${symbol}${leftover.toLocaleString('en-IN')} planned leftover.`
      : `About ${perDayText} / day · leftover is below the savings goal.`;
  };

  const autoTrackStatus = autoTrackState(autoTrack.supported, autoTrack.status);
  const autoTrackRowValue =
    autoTrackStatus === 'active'
      ? 'On'
      : autoTrackStatus === 'needs-permission'
        ? 'Set up'
        : undefined;

  const initials = initialsFrom(name);
  const monthName = new Date().toLocaleDateString('en-IN', {month: 'long'});
  const exportingMonth = exporting === 'month';
  const exportSubtitle = exportingMonth
    ? 'Preparing your file…'
    : monthCount === null
      ? 'Ready to share'
      : `${monthCount} ${monthCount === 1 ? 'transaction' : 'transactions'}, ready to share`;

  const balanceNumber = Number(currentBalance);
  const balanceValue =
    currentBalance !== '' && Number.isFinite(balanceNumber)
      ? formatDerived(balanceNumber, symbol)
      : undefined;
  const perMonth = (text: string) =>
    Number(text) > 0 ? `${formatDerived(Number(text), symbol)} a month` : 'Not set';

  const currencyIcon =
    activeCurrency.code === 'INR' ? (
      <CurrencyInr size={ICON_SIZE} color={colors.text} />
    ) : (
      <Coins size={ICON_SIZE} color={colors.text} />
    );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <Screen edges={['top']} style={styles.screen}>
        <View style={styles.header}>
          <BackButton onPress={onClose} />
          <AppText variant="title" style={styles.headerTitle}>
            Profile
          </AppText>
          <PressableScale
            onPress={handleSave}
            scaleTo={0.92}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
            accessibilityHint={dirty ? 'You have unsaved changes' : undefined}
            style={styles.saveHit}>
            <AppText
              variant="bodyStrong"
              color={dirty ? colors.lavender : colors.muted}
              align="right">
              Save
            </AppText>
          </PressableScale>
        </View>

        <SaveToast visible={toastVisible} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl},
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Profile card */}
          <GradientView
            gradient={[colors.glow, colors.surface]}
            angle={160}
            positions={[0, 0.7]}
            style={styles.profileCard}>
            <View style={styles.profileMain}>
              <View style={styles.ringWrap}>
                <ProgressRing
                  size={84}
                  stroke={4}
                  progress={completeness.ratio}
                  gradient="primary"
                  accessibilityLabel={`Profile setup, ${completeness.done} of ${completeness.total} goals set`}
                />
                <PressableScale
                  onPress={() => setAvatarOpen(true)}
                  scaleTo={0.94}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                  containerStyle={styles.avatarSlot}
                  style={styles.avatarPressable}>
                  {avatarUrl ? (
                    <Image
                      source={{uri: avatarUrl}}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.avatarInitials}>
                      <AppText
                        variant="title"
                        color={colors.lavender}
                        style={styles.initialsText}>
                        {initials}
                      </AppText>
                    </View>
                  )}
                </PressableScale>
                <View pointerEvents="none" style={styles.cameraBadge}>
                  <CameraGlyph color={colors.text} size={12} />
                </View>
              </View>

              <View style={styles.profileText}>
                <View style={styles.nameRow}>
                  <AppText
                    variant="heading"
                    numberOfLines={1}
                    style={styles.nameText}>
                    {name.trim() || 'Your name'}
                  </AppText>
                  <PressableScale
                    onPress={() => setSheet('name')}
                    scaleTo={0.9}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Edit name"
                    style={styles.editNameBtn}>
                    <PencilSimple size={14} color={colors.text} weight="bold" />
                  </PressableScale>
                </View>
                <View style={styles.emailRow}>
                  <AppText
                    variant="label"
                    color={colors.muted}
                    numberOfLines={1}
                    style={styles.emailText}>
                    {email.trim() || 'No email on this account'}
                  </AppText>
                  {emailVerified ? (
                    <View
                      accessible
                      accessibilityLabel="Email verified"
                      style={styles.verified}>
                      <SealCheck size={16} color={colors.mint} weight="fill" />
                    </View>
                  ) : null}
                </View>
                <AppText
                  variant="label"
                  color={colors.lavender}
                  style={styles.goalsText}>
                  {completeness.done} / {completeness.total} goals set
                </AppText>
              </View>
            </View>

            {nudge ? (
              <>
                <View style={styles.cardDivider} />
                <PressableScale
                  onPress={() => setSheet(nudge.sheet)}
                  scaleTo={0.99}
                  accessibilityRole="button"
                  accessibilityLabel={nudge.text}
                  accessibilityHint="Opens the setting"
                  style={styles.nudge}>
                  <AppText variant="label" style={styles.nudgeText}>
                    {nudge.text}
                  </AppText>
                  <View style={styles.nudgeArrow}>
                    <ArrowRight size={16} color={colors.lavender} />
                  </View>
                </PressableScale>
              </>
            ) : null}
          </GradientView>

          {/* Export banner */}
          <PressableScale
            onPress={() => runExport('month')}
            disabled={exporting !== null}
            scaleTo={0.985}
            accessibilityRole="button"
            accessibilityLabel={`Export ${monthName} as CSV. ${exportSubtitle}`}
            accessibilityState={{disabled: exporting !== null, busy: exportingMonth}}
            containerStyle={styles.bannerWrap}>
            <GradientView
              gradient={[colors.indigo, colors.violet, colors.lavender]}
              angle={100}
              positions={[0, 0.6, 1]}
              style={styles.banner}>
              <View style={styles.csvSquare}>
                <FileCsv size={26} color={colors.text} />
              </View>
              <View style={styles.bannerText}>
                <AppText variant="heading" color={colors.text} numberOfLines={1}>
                  Export {monthName} as CSV
                </AppText>
                <AppText variant="label" color={colors.text} numberOfLines={1}>
                  {exportSubtitle}
                </AppText>
              </View>
              {exportingMonth ? (
                <Loader size={28} />
              ) : (
                <CaretRight size={20} color={colors.text} weight="bold" />
              )}
            </GradientView>
          </PressableScale>

          {/* Your money */}
          <SectionTitle title="Your money" style={styles.sectionTitle} />
          <SettingsGroup>
            <SettingsRow
              icon={currencyIcon}
              label="Currency"
              value={`${activeCurrency.code} ${symbol}`}
              accessibilityLabel={`Currency, ${activeCurrency.label}, ${activeCurrency.code}. Fixed for this account`}
            />
            <SettingsRow
              icon={<Wallet size={ICON_SIZE} color={colors.text} />}
              label="Current balance"
              value={balanceValue}
              onPress={() => setSheet('balance')}
              accessibilityLabel={`Current balance, ${balanceValue ?? 'loading'}`}
            />
            <SettingsRow
              icon={<Coins size={ICON_SIZE} color={colors.text} />}
              label="Monthly income"
              value={Number(monthlyIncome) > 0 ? perMonth(monthlyIncome) : 'Not set'}
              onPress={() => setSheet('income')}
            />
            <SettingsRow
              icon={<Target size={ICON_SIZE} color={colors.text} />}
              label="Budget"
              value={perMonth(monthlyBudget)}
              onPress={() => setSheet('budget')}
            />
            <SettingsRow
              icon={<PiggyBank size={ICON_SIZE} color={colors.text} />}
              label="Savings goal"
              value={perMonth(monthlySavingsGoal)}
              onPress={() => setSheet('savings')}
            />
            <SettingsRow
              icon={<SquaresFour size={ICON_SIZE} color={colors.text} />}
              label="Categories"
              value={`${categoryIds.length} active`}
              onPress={() => setSheet('categories')}
            />
            <SettingsRow
              icon={<Flag size={ICON_SIZE} color={colors.text} />}
              label="Primary goal"
              value={goal ? SHORT_GOAL[goal] : 'Not set'}
              onPress={() => setSheet('goal')}
            />
          </SettingsGroup>

          {/* App settings */}
          <SectionTitle title="App settings" style={styles.sectionTitle} />
          <SettingsGroup>
            {notificationSettings.rows}
            <SettingsRow
              key="appLock"
              icon={<Fingerprint size={ICON_SIZE} color={colors.text} />}
              label="App lock"
              trailing={
                <ToggleSwitch
                  value={biometricLock.enabled}
                  onValueChange={toggleBiometric}
                  disabled={biometricBusy}
                  accessibilityLabel="App lock"
                />
              }
            />
            {autoTrack.supported && onOpenAutoTracking ? (
              <SettingsRow
                key="autoTrack"
                icon={<Lightning size={ICON_SIZE} color={colors.text} />}
                label="Auto-tracking"
                value={autoTrackRowValue}
                onPress={onOpenAutoTracking}
                accessibilityLabel="Auto-tracking"
                accessibilityHint="Opens UPI auto-tracking settings"
              />
            ) : null}
            {onReplayTutorial ? (
              <SettingsRow
                key="replayTour"
                icon={<Compass size={ICON_SIZE} color={colors.text} />}
                label="Replay app tour"
                onPress={onReplayTutorial}
                accessibilityLabel="Replay app tour"
                accessibilityHint="Shows the guided tour of Paisa again"
              />
            ) : null}
            <SettingsRow
              key="exportAll"
              icon={<DownloadSimple size={ICON_SIZE} color={colors.text} />}
              label="Export all transactions"
              value={exporting === 'all' ? 'Preparing…' : undefined}
              onPress={() => runExport('all')}
              accessibilityLabel="Export all transactions as CSV"
            />
            {onSignOut ? (
              <SettingsRow
                key="signOut"
                icon={<SignOut size={ICON_SIZE} color={colors.roseLight} />}
                label={signingOut ? 'Signing out…' : 'Sign out'}
                tone="danger"
                onPress={signingOut ? undefined : confirmSignOut}
                showCaret={false}
                accessibilityLabel="Sign out"
              />
            ) : null}
          </SettingsGroup>
          {notificationSettings.blocked ? (
            <AppText variant="caption" color={colors.muted} style={styles.footnote}>
              {notificationSettings.blockedNote}
            </AppText>
          ) : null}

          {/* Danger zone */}
          <SettingsGroup style={styles.dangerGroup}>
            <SettingsRow
              icon={<Trash size={ICON_SIZE} color={colors.roseLight} />}
              label={deleting ? 'Deleting…' : 'Delete account'}
              tone="danger"
              onPress={deleting ? undefined : confirmDelete}
              showCaret={false}
              accessibilityLabel="Delete account"
              accessibilityHint="Permanently deletes your account and every transaction"
            />
          </SettingsGroup>
          <AppText variant="caption" color={colors.muted} style={styles.footnote}>
            Deletes this account, its profile, and every transaction. This cannot
            be undone.
          </AppText>

          <AppText variant="label" color={colors.muted} align="center" style={styles.version}>
            Paisa · {APP_VERSION}
          </AppText>
        </ScrollView>

        {notificationSettings.sheets}

        <AvatarPickerModal
          visible={avatarOpen}
          currentAvatarUrl={avatarUrl}
          onSelectAvatar={setAvatarUrl}
          onClose={() => setAvatarOpen(false)}
        />

        <NameSheet
          visible={sheet === 'name'}
          value={name}
          onDone={setName}
          onClose={closeSheet}
        />
        <MoneySheet
          visible={sheet === 'balance'}
          title="Current balance"
          label="Current balance"
          symbol={symbol}
          value={currentBalance}
          allowDecimal
          helper="From your transactions. Edits are saved as an adjustment, not a rewrite."
          onDone={next => {
            setCurrentBalanceDirty(true);
            setCurrentBalance(next);
          }}
          onClose={closeSheet}
        />
        <MoneySheet
          visible={sheet === 'income'}
          title="Monthly income"
          label="Monthly income"
          symbol={symbol}
          value={monthlyIncome}
          lead="What you expect to add each month. Used to work out what is left after your budget."
          onDone={setMonthlyIncome}
          onClose={closeSheet}
        />
        <MoneySheet
          visible={sheet === 'budget'}
          title="Monthly budget"
          label="Monthly spending budget"
          symbol={symbol}
          value={monthlyBudget}
          renderExtra={draftText => {
            const hint = dailyHintFor(draftText);
            return hint ? (
              <AppText variant="caption" color={colors.muted} style={styles.sheetHint}>
                {hint}
              </AppText>
            ) : null;
          }}
          onDone={setMonthlyBudget}
          onClose={closeSheet}
        />
        <MoneySheet
          visible={sheet === 'savings'}
          title="Savings goal"
          label="Monthly savings goal"
          symbol={symbol}
          value={monthlySavingsGoal}
          helper="Only this monthly target is saved. Week and year follow from it."
          renderExtra={draftText => {
            const target = Number(draftText) || 0;
            if (target <= 0) {
              return null;
            }
            return (
              <Card style={styles.derivedCard} padding={0}>
                <View style={[styles.derivedRow, styles.derivedDivider]}>
                  <AppText variant="bodyStrong">Weekly pace</AppText>
                  <AppText variant="numeric">
                    {formatDerived(scaleMonthly(target, 'week', new Date()), symbol)}
                  </AppText>
                </View>
                <View style={styles.derivedRow}>
                  <AppText variant="bodyStrong">Yearly potential</AppText>
                  <AppText variant="numeric">
                    {formatDerived(yearlyFromMonthly(target), symbol)}
                  </AppText>
                </View>
              </Card>
            );
          }}
          onDone={setMonthlySavingsGoal}
          onClose={closeSheet}
        />
        <CategoriesSheet
          visible={sheet === 'categories'}
          selectedIds={categoryIds}
          onChange={setCategoryIds}
          onClose={closeSheet}
        />
        <GoalSheet
          visible={sheet === 'goal'}
          value={goal}
          onSelect={setGoal}
          onClose={closeSheet}
        />
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 14,
    zIndex: 10,
  },
  headerTitle: {
    flex: 1,
  },
  saveHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  profileCard: {
    borderRadius: radii.cardHero,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  profileMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 16,
  },
  ringWrap: {
    width: 84,
    height: 84,
  },
  avatarSlot: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 68,
    height: 68,
  },
  avatarPressable: {
    width: 68,
    height: 68,
    borderRadius: radii.pill,
  },
  avatarImage: {
    width: 68,
    height: 68,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
  },
  avatarInitials: {
    width: 68,
    height: 68,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontFamily: fonts.jakartaExtraBold,
    fontSize: 24,
    lineHeight: 30,
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.glow,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nameText: {
    flexShrink: 1,
    fontSize: 19,
    lineHeight: 25,
  },
  editNameBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emailText: {
    flexShrink: 1,
    fontSize: 14,
  },
  verified: {
    justifyContent: 'center',
  },
  goalsText: {
    fontFamily: fonts.jakartaSemiBold,
    fontSize: 14,
    paddingTop: 2,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginHorizontal: 18,
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 14,
  },
  nudgeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  nudgeArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerWrap: {
    marginTop: 16,
  },
  banner: {
    height: 92,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 14,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  csvSquare: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: {
    flex: 1,
  },
  sectionTitle: {
    paddingTop: 26,
    paddingBottom: 12,
  },
  footnote: {
    paddingHorizontal: 4,
    paddingTop: 10,
  },
  dangerGroup: {
    marginTop: 16,
  },
  version: {
    paddingTop: 22,
  },
  sheetHint: {
    marginTop: spacing.md,
  },
  derivedCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
  },
  derivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  derivedDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
});
