import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {CameraGlyph, CheckGlyph, PencilGlyph} from '../../components/icons/Glyphs';
import {
  AppText,
  BackButton,
  PressableScale,
  SecondaryButton,
  TextField,
} from '../../components/ui';
import {colors, duration, easing, layout, radii, spacing} from '../../theme';
import {SaveProfileOptions, textToMoney} from '../../lib/profileStore';
import {
  loadTransactions,
  walletBalanceFrom,
} from '../../lib/transactionsStore';
import {
  CATEGORIES,
  MIN_CATEGORIES,
  currencyByCode,
} from '../onboarding/constants';
import {GoalId, OnboardingDraft} from '../onboarding/types';
import {AvatarPickerModal} from './AvatarPickerModal';
import {
  AiPreferencesSheet,
  CategoriesSheet,
  CurrencySheet,
  GoalSheet,
  NotificationsSheet,
} from './ProfileSheets';
import {SettingsRow} from './SettingsRow';
import {SettingsSection} from './SettingsSection';

type ProfileScreenProps = {
  visible: boolean;
  draft: OnboardingDraft;
  onSave: (
    updated: OnboardingDraft,
    options?: SaveProfileOptions,
  ) => void;
  onSignOut?: () => void | Promise<void>;
  onClose: () => void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PREVIEW_CATEGORY_COUNT = 4;
const TOAST_DURATION_MS = 2200;

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

// ---------------------------------------------------------------------------
// SaveToast — lightweight, native-driver animated banner
// ---------------------------------------------------------------------------
function SaveToast({visible}: {visible: boolean}) {
  const translateY = useRef(new Animated.Value(-64)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: duration.enter,
          easing: easing.out,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: duration.control,
          easing: easing.out,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -64,
          duration: duration.exit,
          easing: easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: duration.exit,
          easing: easing.standard,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        toastStyles.container,
        {transform: [{translateY}], opacity},
      ]}>
      <AppText variant="bodyStrong" color={colors.onInk}>
        Changes saved ✓
      </AppText>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: spacing.xxl,
    right: spacing.xxl,
    backgroundColor: colors.ink,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    zIndex: 100,
    // Subtle shadow for lift
    shadowColor: colors.ink,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
});

// ---------------------------------------------------------------------------
// ProfileScreen
// ---------------------------------------------------------------------------
export function ProfileScreen({
  visible,
  draft,
  onSave,
  onSignOut,
  onClose,
}: ProfileScreenProps) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(draft.name);
  const [email, setEmail] = useState(draft.email);
  const [currency, setCurrency] = useState(draft.currency);
  const [monthlyIncome, setMonthlyIncome] = useState(draft.monthlyIncome);
  const [monthlyBudget, setMonthlyBudget] = useState(draft.monthlyBudget);
  const [monthlySavingsGoal, setMonthlySavingsGoal] = useState(
    draft.monthlySavingsGoal,
  );
  const [startingBalance, setStartingBalance] = useState(draft.startingBalance);
  const [currentBalance, setCurrentBalance] = useState('');
  const [currentBalanceDirty, setCurrentBalanceDirty] = useState(false);
  const computedBalance = useRef(0);
  const [goal, setGoal] = useState<GoalId | null>(draft.goal);
  const [categoryIds, setCategoryIds] = useState<string[]>(draft.categoryIds);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(draft.avatarUrl);
  const [nameError, setNameError] = useState<string | undefined>();
  const [nameEditing, setNameEditing] = useState(false);
  const [categoryError, setCategoryError] = useState<string | undefined>();

  const [avatarOpen, setAvatarOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const [notifyPrefs, setNotifyPrefs] = useState({
    spend: true,
    monthly: true,
    ai: false,
  });
  const [autoCategorize, setAutoCategorize] = useState(true);
  const [aiTone, setAiTone] = useState<'short' | 'detailed'>('short');
  const [biometric, setBiometric] = useState(false);

  // Toast state
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
    setCurrency(draft.currency);
    setMonthlyIncome(draft.monthlyIncome);
    setMonthlyBudget(draft.monthlyBudget);
    setMonthlySavingsGoal(draft.monthlySavingsGoal);
    setStartingBalance(draft.startingBalance);
    setCurrentBalanceDirty(false);
    setGoal(draft.goal);
    setCategoryIds(draft.categoryIds);
    setAvatarUrl(draft.avatarUrl);
    setNameError(undefined);
    setCategoryError(undefined);
    setNameEditing(false);
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
        setCurrentBalance(balance === 0 ? '' : String(Math.round(balance)));
      })
      .catch(() => {
        if (!cancelled) {
          computedBalance.current = 0;
          setCurrentBalance('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const activeCurrency = useMemo(() => currencyByCode(currency), [currency]);
  const budgetNumber = Number(monthlyBudget) || 0;
  const perDay = budgetNumber > 0 ? Math.round(budgetNumber / 30) : 0;
  const incomeNumber = Number(monthlyIncome) || 0;
  const savingsNumber = Number(monthlySavingsGoal) || 0;
  const leftover = incomeNumber > 0 && budgetNumber > 0 ? incomeNumber - budgetNumber : 0;
  const emailVerified = EMAIL_PATTERN.test(email.trim());

  const goalLabel =
    goal === 'track'
      ? 'Track spending'
      : goal === 'save'
        ? 'Save more'
        : goal === 'split'
          ? 'Split bills'
          : undefined;

  const previewCategories = useMemo(() => {
    const selected = CATEGORIES.filter(item => categoryIds.includes(item.id));
    return {
      shown: selected.slice(0, PREVIEW_CATEGORY_COUNT),
      extra: Math.max(0, selected.length - PREVIEW_CATEGORY_COUNT),
    };
  }, [categoryIds]);

  // Notification subtitle: e.g. "2 of 3 enabled"
  const notifSubtitle = useMemo(() => {
    const enabledCount = Object.values(notifyPrefs).filter(Boolean).length;
    const total = Object.keys(notifyPrefs).length;
    return `${enabledCount} of ${total} enabled`;
  }, [notifyPrefs]);

  // AI subtitle: e.g. "Short replies · Auto-sort on"
  const aiSubtitle = useMemo(() => {
    const tonePart = aiTone === 'short' ? 'Short replies' : 'Detailed replies';
    const sortPart = autoCategorize ? 'Auto-sort on' : 'Auto-sort off';
    return `${tonePart} · ${sortPart}`;
  }, [aiTone, autoCategorize]);

  const handleSave = () => {
    if (!name.trim()) {
      setNameError('Please enter your name.');
      Alert.alert('Name needed', 'Add your name before saving.');
      return;
    }
    if (categoryIds.length < MIN_CATEGORIES) {
      setCategoryError(`Choose at least ${MIN_CATEGORIES} categories.`);
      Alert.alert(
        'Categories',
        `Keep at least ${MIN_CATEGORIES} tracked categories.`,
      );
      return;
    }

    const startingDelta =
      (textToMoney(startingBalance) ?? 0) -
      (textToMoney(draft.startingBalance) ?? 0);
    const typedCurrent = textToMoney(currentBalance);
    const targetWalletBalance = currentBalanceDirty
      ? typedCurrent
      : (typedCurrent ?? computedBalance.current) + startingDelta;

    onSave(
      {
        name: name.trim(),
        email: email.trim(),
        currency,
        startingBalance,
        monthlyIncome,
        monthlyBudget,
        monthlySavingsGoal,
        goal,
        categoryIds,
        avatarUrl,
      },
      {targetWalletBalance},
    );
    showToast();
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in with the same email.', [
      {text: 'Stay', style: 'cancel'},
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => onSignOut?.(),
      },
    ]);
  };

  const exportData = () => {
    Alert.alert(
      'Export Data',
      'A CSV of this profile is ready to wire. Transactions will join the export once they sync.',
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete account?',
      'This cannot be undone. Your login and profile will be removed from this device.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Account',
              'Server-side deletion is prepared here. Sign out for now, then finish removal from Supabase Auth.',
            );
          },
        },
      ],
    );
  };

  const initials = initialsFrom(name);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <View style={[styles.root, {paddingTop: insets.top || spacing.md}]}>
        <StatusBar barStyle="dark-content" />

        {/* Top bar */}
        <View style={styles.topBar}>
          <BackButton onPress={onClose} />
          <AppText variant="heading" style={styles.topBarTitle}>
            Profile & Settings
          </AppText>
          <PressableScale
            onPress={handleSave}
            scaleTo={0.92}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
            style={styles.saveHeaderBtn}>
            <AppText variant="bodyStrong" color={colors.accentPress}>
              Save
            </AppText>
          </PressableScale>
        </View>

        {/* Save toast — absolutely positioned below top bar */}
        <SaveToast visible={toastVisible} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              {paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl},
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>

            {/* ── Profile header ─────────────────────────────────────── */}
            <View style={styles.avatarCard}>
              <PressableScale
                onPress={() => setAvatarOpen(true)}
                scaleTo={0.94}
                accessibilityRole="button"
                accessibilityLabel="Change profile photo"
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
                      variant="heading"
                      color={colors.ink}
                      style={styles.initialsText}>
                      {initials}
                    </AppText>
                  </View>
                )}
                <View style={styles.cameraBadge}>
                  <CameraGlyph color={colors.onInk} size={13} />
                </View>
              </PressableScale>

              <AppText
                variant="heading"
                style={styles.heroName}
                numberOfLines={1}>
                {name.trim() || 'Your Name'}
              </AppText>
              <AppText
                variant="caption"
                color={colors.inkMuted}
                numberOfLines={1}
                style={styles.heroEmail}>
                {email.trim() || 'No email on this account'}
              </AppText>
            </View>

            {/* ── Personal Details ────────────────────────────────────── */}
            <SettingsSection title="Personal Details">
              <View style={styles.fieldBlock}>
                <TextField
                  label="Name"
                  placeholder="e.g. Ananya Raghunathan"
                  value={name}
                  onChangeText={val => {
                    setName(val);
                    if (nameError) {
                      setNameError(undefined);
                    }
                  }}
                  autoCapitalize="words"
                  autoComplete="name"
                  textContentType="name"
                  error={nameError}
                  editable={nameEditing}
                  trailing={
                    <PressableScale
                      onPress={() => {
                        if (nameEditing) {
                          if (!name.trim()) {
                            setNameError('Please enter your name.');
                            return;
                          }
                          setNameEditing(false);
                          return;
                        }
                        setNameEditing(true);
                      }}
                      scaleTo={0.9}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={
                        nameEditing ? 'Done editing name' : 'Edit name'
                      }
                      style={styles.editNameBtn}>
                      {nameEditing ? (
                        <CheckGlyph color={colors.positive} size={14} />
                      ) : (
                        <PencilGlyph color={colors.inkMuted} size={16} />
                      )}
                    </PressableScale>
                  }
                />
              </View>
              {/* Email: read-only display row */}
              <View style={[styles.emailRow, styles.emailDivider]}>
                <View style={styles.emailCopy}>
                  <AppText
                    variant="caption"
                    color={colors.inkMuted}
                    style={styles.emailLabel}>
                    Email
                  </AppText>
                  <AppText variant="body" numberOfLines={1}>
                    {email.trim() || 'Not available'}
                  </AppText>
                </View>
                {emailVerified ? (
                  <View style={styles.verified}>
                    <AppText
                      variant="caption"
                      color={colors.positive}
                      style={styles.verifiedText}>
                      Verified
                    </AppText>
                  </View>
                ) : (
                  <AppText variant="caption" color={colors.inkMuted}>
                    Read-only
                  </AppText>
                )}
              </View>
            </SettingsSection>

            {/* ── Preferences ─────────────────────────────────────────── */}
            <SettingsSection title="Preferences">
              <SettingsRow
                label="Primary Currency"
                subtitle={activeCurrency.label}
                value={`${activeCurrency.symbol} ${activeCurrency.code}`}
                kind="nav"
                onPress={() => setCurrencyOpen(true)}
              />
              <SettingsRow
                label="Notifications"
                subtitle={notifSubtitle}
                kind="nav"
                onPress={() => setNotificationsOpen(true)}
              />
              <SettingsRow
                label="AI Preferences"
                subtitle={aiSubtitle}
                kind="nav"
                last
                onPress={() => setAiOpen(true)}
              />
            </SettingsSection>

            {/* ── Financial Profile ───────────────────────────────────── */}
            <SettingsSection title="Financial Profile">
              <View style={styles.fieldBlock}>
                <TextField
                  label="Starting balance"
                  placeholder="Not set"
                  prefix={activeCurrency.symbol}
                  value={startingBalance}
                  onChangeText={val =>
                    setStartingBalance(val.replace(/[^0-9]/g, ''))
                  }
                  keyboardType="number-pad"
                  helper="Opening amount. Changing this posts an adjustment if current balance is left as-is."
                />
              </View>
              <View style={[styles.fieldBlock, styles.fieldFollow]}>
                <TextField
                  label="Current balance"
                  placeholder="0"
                  prefix={activeCurrency.symbol}
                  value={currentBalance}
                  onChangeText={val => {
                    setCurrentBalanceDirty(true);
                    setCurrentBalance(val.replace(/[^0-9]/g, ''));
                  }}
                  keyboardType="number-pad"
                  helper="From your transactions. Edits are saved as an adjustment, not a rewrite."
                />
              </View>
              <View style={[styles.fieldBlock, styles.fieldFollow]}>
                <TextField
                  label="Monthly income"
                  placeholder="Not set"
                  prefix={activeCurrency.symbol}
                  value={monthlyIncome}
                  onChangeText={val =>
                    setMonthlyIncome(val.replace(/[^0-9]/g, ''))
                  }
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.fieldBlock, styles.fieldFollow]}>
                <TextField
                  label="Monthly spending budget"
                  placeholder="Not set"
                  prefix={activeCurrency.symbol}
                  value={monthlyBudget}
                  onChangeText={val =>
                    setMonthlyBudget(val.replace(/[^0-9]/g, ''))
                  }
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.fieldBlock, styles.fieldFollow]}>
                <TextField
                  label="Monthly savings goal"
                  placeholder="Not set"
                  prefix={activeCurrency.symbol}
                  value={monthlySavingsGoal}
                  onChangeText={val =>
                    setMonthlySavingsGoal(val.replace(/[^0-9]/g, ''))
                  }
                  keyboardType="number-pad"
                />
              </View>
              {perDay > 0 ? (
                <AppText
                  variant="caption"
                  color={colors.inkMuted}
                  style={styles.dailyHint}>
                  About {activeCurrency.symbol}
                  {perDay.toLocaleString('en-IN')} / day
                  {leftover !== 0
                    ? leftover >= savingsNumber
                      ? ` · ${activeCurrency.symbol}${leftover.toLocaleString('en-IN')} planned leftover`
                      : ` · leftover is below the savings goal`
                    : ''}
                  .
                </AppText>
              ) : (
                <View style={styles.dailySpacer} />
              )}
            </SettingsSection>

            {/* ── Insights ────────────────────────────────────────────── */}
            <SettingsSection title="Insights">
              <SettingsRow
                label="Primary Goal"
                value={goalLabel}
                placeholder="Not set"
                kind="nav"
                onPress={() => setGoalOpen(true)}
              />
              {/* Tracked categories */}
              <View style={styles.categoryBlock}>
                <View style={styles.categoryHeader}>
                  <AppText variant="body">Tracked Categories</AppText>
                  <AppText
                    variant="caption"
                    color={colors.inkMuted}
                    style={styles.categoryCount}>
                    {categoryIds.length} active
                  </AppText>
                </View>
                <View style={styles.previewRow}>
                  {previewCategories.shown.map(item => (
                    <View key={item.id} style={styles.previewChip}>
                      <View
                        style={[styles.previewDot, {backgroundColor: item.color}]}
                      />
                      <AppText variant="caption" color={colors.inkSecondary}>
                        {item.label}
                      </AppText>
                    </View>
                  ))}
                  {previewCategories.extra > 0 ? (
                    <View style={styles.previewChip}>
                      <AppText variant="caption" color={colors.inkMuted}>
                        +{previewCategories.extra} more
                      </AppText>
                    </View>
                  ) : null}
                </View>
                {categoryError ? (
                  <AppText
                    variant="caption"
                    color={colors.danger}
                    style={styles.categoryError}>
                    {categoryError}
                  </AppText>
                ) : null}
              </View>
              <SettingsRow
                label="Manage Categories"
                kind="nav"
                last
                onPress={() => setCategoriesOpen(true)}
              />
            </SettingsSection>

            {/* ── Security & Data ─────────────────────────────────────── */}
            <SettingsSection title="Security & Data">
              <SettingsRow
                label="Export Data"
                subtitle="CSV of expenses"
                kind="nav"
                onPress={exportData}
              />
              <SettingsRow
                label="Biometric Lock"
                last
                kind="toggle"
                accessory={
                  <Switch
                    value={biometric}
                    onValueChange={setBiometric}
                    trackColor={{false: colors.canvasSunk, true: colors.accent}}
                    thumbColor={colors.surface}
                    accessibilityLabel={`Biometric Lock, ${biometric ? 'on' : 'off'}`}
                  />
                }
              />
            </SettingsSection>

            {/* ── About ───────────────────────────────────────────────── */}
            <SettingsSection title="About">
              <SettingsRow
                label="App Version"
                value="v0.0.1 (Beta)"
                kind="info"
                last
              />
            </SettingsSection>

            {/* ── Sign out — secondary, not dominant ──────────────────── */}
            {onSignOut ? (
              <View style={styles.signOutWrapper}>
                <SecondaryButton
                  label="Sign out"
                  onPress={confirmSignOut}
                />
              </View>
            ) : null}

            {/* ── Danger Zone — visually separated ────────────────────── */}
            <SettingsSection
              title="Danger Zone"
              danger
              footer="Deletes this account and its profile. This cannot be undone.">
              <SettingsRow
                label="Delete Account"
                last
                destructive
                kind="nav"
                onPress={confirmDelete}
              />
            </SettingsSection>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── Sub-screens & pickers ──────────────────────────────────── */}
        <AvatarPickerModal
          visible={avatarOpen}
          currentAvatarUrl={avatarUrl}
          onSelectAvatar={setAvatarUrl}
          onClose={() => setAvatarOpen(false)}
        />
        <CurrencySheet
          visible={currencyOpen}
          value={currency}
          onSelect={setCurrency}
          onClose={() => setCurrencyOpen(false)}
        />
        <GoalSheet
          visible={goalOpen}
          value={goal}
          onSelect={setGoal}
          onClose={() => setGoalOpen(false)}
        />
        <CategoriesSheet
          visible={categoriesOpen}
          selectedIds={categoryIds}
          onChange={ids => {
            setCategoryIds(ids);
            setCategoryError(undefined);
          }}
          onClose={() => setCategoriesOpen(false)}
        />
        <NotificationsSheet
          visible={notificationsOpen}
          values={notifyPrefs}
          onChange={(id, value) =>
            setNotifyPrefs(current => ({...current, [id]: value}))
          }
          onClose={() => setNotificationsOpen(false)}
        />
        <AiPreferencesSheet
          visible={aiOpen}
          autoCategorize={autoCategorize}
          onAutoCategorize={setAutoCategorize}
          tone={aiTone}
          onTone={setAiTone}
          onClose={() => setAiOpen(false)}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    borderBottomWidth: layout.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  topBarTitle: {
    letterSpacing: -0.4,
  },
  saveHeaderBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
  },

  // Profile header
  avatarCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarPressable: {
    width: 88,
    height: 88,
    borderRadius: radii.pill,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSunk,
  },
  avatarInitials: {
    width: 88,
    height: 88,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.hairlineStrong,
  },
  initialsText: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  heroName: {
    marginTop: spacing.md,
    letterSpacing: -0.5,
  },
  heroEmail: {
    marginTop: 4,
    letterSpacing: 0.1,
  },

  // Personal details
  fieldBlock: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  editNameBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldFollow: {
    paddingTop: spacing.sm,
    borderTopWidth: layout.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  emailDivider: {
    borderTopWidth: layout.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  emailCopy: {
    flex: 1,
    marginRight: spacing.md,
  },
  emailLabel: {
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  verified: {
    backgroundColor: '#E7F4EC',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  verifiedText: {
    fontWeight: '600',
  },

  // Financial profile
  dailyHint: {
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  dailySpacer: {
    height: spacing.sm,
  },

  // Insights / categories
  categoryBlock: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: layout.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryCount: {
    marginLeft: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.chip,
    backgroundColor: colors.canvasSunk,
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    marginRight: spacing.xs,
  },
  categoryError: {
    marginTop: spacing.sm,
  },

  // Sign out
  signOutWrapper: {
    marginBottom: spacing.lg,
  },
});
