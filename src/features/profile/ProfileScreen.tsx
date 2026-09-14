import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import {Text} from '@tamagui/core';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  BoltIcon,
  ChevronLeftIcon,
  DollarSignIcon,
  DownloadIcon,
  LockIcon,
  LogOutIcon,
  TargetIcon,
} from '../../components/icons/FeatherIcons';
import {
  BellGlyph,
  CameraGlyph,
  CheckGlyph,
  PencilGlyph,
  TrashGlyph,
} from '../../components/icons/Glyphs';
import {GlassPanel, PressableScale, Screen} from '../../components/ui';
import {SaveProfileOptions, textToMoney} from '../../lib/profileStore';
import {
  loadTransactions,
  walletBalanceFrom,
} from '../../lib/transactionsStore';
import {colors, duration, easing, fonts, radii, shadows} from '../../theme';
import {
  CATEGORIES,
  MIN_CATEGORIES,
  currencyByCode,
} from '../onboarding/constants';
import {scaleMonthly} from '../home/homeReport';
import {GoalId, OnboardingDraft} from '../onboarding/types';
import {AvatarPickerModal} from './AvatarPickerModal';
import {ProfileAmbient} from './ProfileAmbient';
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

const INK = '#22201B';
const MUTED = '#6F634E';
const ICON = '#6F6553';
const SAVE = '#C99A3F';
const CHIP = '#00000008';
const HAIR = '#00000012';
const DIVIDER = '#00000010';
const PREFIX = '#8A7D63';
const VERIFIED = '#4A7A4A';
const DANGER = '#B8484A';

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

function groupDigits(raw: string): string {
  if (!raw) {
    return '';
  }
  return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
      style={[toastStyles.container, {transform: [{translateY}], opacity}]}>
      <Text
        fontFamily={fonts.interSemi}
        fontSize={15}
        lineHeight={20}
        fontWeight="600"
        color={colors.onInk}>
        Changes saved ✓
      </Text>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 62,
    left: 20,
    right: 20,
    backgroundColor: colors.ink,
    borderRadius: radii.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 100,
    ...shadows.card,
  },
});

function GlassBack({onPress}: {onPress: () => void}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.92}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={styles.backFace}>
      <GlassPanel
        radius={20}
        intensity="md"
        overlayColor="rgba(255,255,255,0.8)"
        style={styles.backGlass}
        contentStyle={styles.backInner}>
        <ChevronLeftIcon color={INK} size={20} />
      </GlassPanel>
    </PressableScale>
  );
}

function FieldLabel({children}: {children: string}) {
  return (
    <Text
      fontFamily={fonts.interMedium}
      fontSize={12}
      lineHeight={16}
      fontWeight="500"
      color={MUTED}>
      {children}
    </Text>
  );
}

function HelperText({children}: {children: string}) {
  return (
    <Text
      fontFamily={fonts.interMedium}
      fontSize={11}
      lineHeight={15}
      fontWeight="500"
      color={MUTED}>
      {children}
    </Text>
  );
}

function MoneyField({
  label,
  symbol,
  value,
  onChangeText,
  helper,
}: {
  label: string;
  symbol: string;
  value: string;
  onChangeText: (next: string) => void;
  helper?: string;
}) {
  return (
    <View style={styles.fieldStack}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.inputShell}>
        <Text
          fontFamily={fonts.interMedium}
          fontSize={15}
          lineHeight={20}
          color={PREFIX}
          style={styles.prefix}>
          {symbol}
        </Text>
        <TextInput
          value={groupDigits(value)}
          onChangeText={text => onChangeText(text.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={MUTED}
          style={styles.moneyInput}
        />
      </View>
      {helper ? <HelperText>{helper}</HelperText> : null}
    </View>
  );
}

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
    setMonthlyBudget(draft.monthlyBudget);
    setMonthlySavingsGoal(draft.monthlySavingsGoal);
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
  const savingsNumber = Number(monthlySavingsGoal) || 0;
  const leftover =
    Number(draft.monthlyIncome) > 0 && budgetNumber > 0
      ? Number(draft.monthlyIncome) - budgetNumber
      : 0;
  const weeklyPace = scaleMonthly(savingsNumber, 'week', new Date());
  const yearlyPotential = scaleMonthly(savingsNumber, 'year', new Date());
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

  const notifSubtitle = useMemo(() => {
    const enabledCount = Object.values(notifyPrefs).filter(Boolean).length;
    const total = Object.keys(notifyPrefs).length;
    return `${enabledCount} of ${total} enabled`;
  }, [notifyPrefs]);

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

    const typedCurrent = textToMoney(currentBalance);
    const targetWalletBalance = currentBalanceDirty
      ? typedCurrent
      : typedCurrent ?? computedBalance.current;

    onSave(
      {
        name: name.trim(),
        email: email.trim(),
        currency,
        startingBalance: draft.startingBalance,
        monthlyIncome: draft.monthlyIncome,
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
  const dailyHint =
    perDay > 0
      ? leftover !== 0
        ? leftover >= savingsNumber
          ? `About ${activeCurrency.symbol}${perDay.toLocaleString('en-IN')} / day · ${activeCurrency.symbol}${leftover.toLocaleString('en-IN')} planned leftover.`
          : `About ${activeCurrency.symbol}${perDay.toLocaleString('en-IN')} / day · leftover is below the savings goal.`
        : `About ${activeCurrency.symbol}${perDay.toLocaleString('en-IN')} / day.`
      : undefined;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <Screen edges={['top']} backdrop={<ProfileAmbient />} style={styles.screen}>
        <View style={styles.header}>
          <GlassBack onPress={onClose} />
          <Text
            fontFamily={fonts.outfitBold}
            fontSize={18}
            lineHeight={24}
            fontWeight="700"
            letterSpacing={-0.45}
            color={INK}
            style={styles.headerTitle}>
            Profile & Settings
          </Text>
          <PressableScale
            onPress={handleSave}
            scaleTo={0.92}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
            style={styles.saveHit}>
            <Text
              fontFamily={fonts.interSemi}
              fontSize={15}
              lineHeight={20}
              fontWeight="600"
              color={SAVE}
              textAlign="right">
              Save
            </Text>
          </PressableScale>
        </View>

        <SaveToast visible={toastVisible} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              {paddingBottom: Math.max(insets.bottom, 32) + 24},
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <GlassPanel
              radius={radii.cardHero}
              intensity="xl"
              overlayColor={colors.glass}
              style={shadows.card}
              contentStyle={styles.identityInner}>
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
                    <Text
                      fontFamily={fonts.outfitBold}
                      fontSize={26}
                      lineHeight={32}
                      fontWeight="700"
                      letterSpacing={-0.65}
                      color="#B58A3C">
                      {initials}
                    </Text>
                  </View>
                )}
                <View style={styles.cameraBadge}>
                  <CameraGlyph color="#FFFFFF" size={12} />
                </View>
              </PressableScale>
              <Text
                fontFamily={fonts.outfitBold}
                fontSize={19}
                lineHeight={24}
                fontWeight="700"
                letterSpacing={-0.475}
                color={INK}
                numberOfLines={1}
                style={styles.heroName}>
                {name.trim() || 'Your Name'}
              </Text>
              <Text
                fontFamily={fonts.interMedium}
                fontSize={13}
                lineHeight={18}
                fontWeight="500"
                color={MUTED}
                numberOfLines={1}>
                {email.trim() || 'No email on this account'}
              </Text>
            </GlassPanel>

            <SettingsSection title="Personal Details" padded>
              <View style={styles.fieldStack}>
                <FieldLabel>Name</FieldLabel>
                <View style={styles.inputShell}>
                  <TextInput
                    value={name}
                    onChangeText={val => {
                      setName(val);
                      if (nameError) {
                        setNameError(undefined);
                      }
                    }}
                    editable={nameEditing}
                    autoCapitalize="words"
                    autoComplete="name"
                    textContentType="name"
                    placeholder="e.g. Ananya Raghunathan"
                    placeholderTextColor={MUTED}
                    style={styles.nameInput}
                  />
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
                      <PencilGlyph color={ICON} size={14} />
                    )}
                  </PressableScale>
                </View>
                {nameError ? (
                  <Text
                    fontFamily={fonts.interMedium}
                    fontSize={11}
                    color={DANGER}>
                    {nameError}
                  </Text>
                ) : null}
              </View>

              <View style={styles.hairline} />

              <View style={styles.emailBlock}>
                <View style={styles.emailLabelRow}>
                  <Text
                    fontFamily={fonts.interMedium}
                    fontSize={12}
                    lineHeight={16}
                    fontWeight="500"
                    letterSpacing={1.2}
                    color={MUTED}
                    textTransform="uppercase">
                    Email
                  </Text>
                  {emailVerified ? (
                    <View style={styles.verified}>
                      <CheckGlyph color={VERIFIED} size={12} />
                      <Text
                        fontFamily={fonts.interSemi}
                        fontSize={11}
                        lineHeight={14}
                        fontWeight="600"
                        color={VERIFIED}>
                        Verified
                      </Text>
                    </View>
                  ) : (
                    <Text
                      fontFamily={fonts.interMedium}
                      fontSize={11}
                      color={MUTED}>
                      Read-only
                    </Text>
                  )}
                </View>
                <Text
                  fontFamily={fonts.interMedium}
                  fontSize={15}
                  lineHeight={20}
                  fontWeight="500"
                  color={INK}
                  numberOfLines={1}>
                  {email.trim() || 'Not available'}
                </Text>
              </View>
            </SettingsSection>

            <SettingsSection title="Preferences">
              <SettingsRow
                icon={<DollarSignIcon color={ICON} size={16} />}
                label="Primary Currency"
                subtitle={activeCurrency.label}
                value={`${activeCurrency.symbol} ${activeCurrency.code}`}
                kind="nav"
                onPress={() => setCurrencyOpen(true)}
              />
              <SettingsRow
                icon={<BellGlyph color={ICON} size={16} />}
                label="Notifications"
                subtitle={notifSubtitle}
                kind="nav"
                onPress={() => setNotificationsOpen(true)}
              />
              <SettingsRow
                icon={<BoltIcon color={ICON} size={16} />}
                label="AI Preferences"
                subtitle={aiSubtitle}
                kind="nav"
                last
                onPress={() => setAiOpen(true)}
              />
            </SettingsSection>

            <SettingsSection title="Financial Profile" padded>
              <MoneyField
                label="Current balance"
                symbol={activeCurrency.symbol}
                value={currentBalance}
                onChangeText={val => {
                  setCurrentBalanceDirty(true);
                  setCurrentBalance(val);
                }}
                helper="From your transactions. Edits are saved as an adjustment, not a rewrite."
              />
              <View style={styles.hairline} />
              <MoneyField
                label="Monthly spending budget"
                symbol={activeCurrency.symbol}
                value={monthlyBudget}
                onChangeText={setMonthlyBudget}
              />
              <MoneyField
                label="Monthly savings goal"
                symbol={activeCurrency.symbol}
                value={monthlySavingsGoal}
                onChangeText={setMonthlySavingsGoal}
                helper="Only this monthly target is saved. Week and year follow from it."
              />
              {savingsNumber > 0 ? (
                <>
                  <View style={styles.hairline} />
                  <View style={styles.derivedRow}>
                    <Text
                      fontFamily={fonts.interSemi}
                      fontSize={15}
                      lineHeight={20}
                      fontWeight="600"
                      color={INK}>
                      Weekly pace
                    </Text>
                    <Text
                      fontFamily={fonts.outfitBold}
                      fontSize={15}
                      lineHeight={20}
                      fontWeight="700"
                      color={INK}>
                      {formatDerived(weeklyPace, activeCurrency.symbol)}
                    </Text>
                  </View>
                  <View style={styles.derivedRow}>
                    <Text
                      fontFamily={fonts.interSemi}
                      fontSize={15}
                      lineHeight={20}
                      fontWeight="600"
                      color={INK}>
                      Yearly potential
                    </Text>
                    <Text
                      fontFamily={fonts.outfitBold}
                      fontSize={15}
                      lineHeight={20}
                      fontWeight="700"
                      color={INK}>
                      {formatDerived(yearlyPotential, activeCurrency.symbol)}
                    </Text>
                  </View>
                </>
              ) : null}
              {dailyHint ? <HelperText>{dailyHint}</HelperText> : null}
            </SettingsSection>

            <SettingsSection title="Insights">
              <SettingsRow
                icon={<TargetIcon color={ICON} size={16} />}
                label="Primary Goal"
                value={goalLabel}
                placeholder="Not set"
                kind="nav"
                onPress={() => setGoalOpen(true)}
              />
              <View style={styles.categoryBlock}>
                <View style={styles.categoryHeader}>
                  <Text
                    fontFamily={fonts.interSemi}
                    fontSize={15}
                    lineHeight={20}
                    fontWeight="600"
                    color={INK}>
                    Tracked Categories
                  </Text>
                  <Text
                    fontFamily={fonts.interMedium}
                    fontSize={12}
                    lineHeight={16}
                    color={MUTED}>
                    {categoryIds.length} active
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  {previewCategories.shown.map(item => (
                    <View key={item.id} style={styles.previewChip}>
                      <View
                        style={[styles.previewDot, {backgroundColor: item.color}]}
                      />
                      <Text
                        fontFamily={fonts.interMedium}
                        fontSize={12}
                        lineHeight={16}
                        fontWeight="500"
                        color="#4A4235">
                        {item.label}
                      </Text>
                    </View>
                  ))}
                  {previewCategories.extra > 0 ? (
                    <View style={styles.previewChip}>
                      <Text
                        fontFamily={fonts.interMedium}
                        fontSize={12}
                        color={MUTED}>
                        +{previewCategories.extra} more
                      </Text>
                    </View>
                  ) : null}
                </View>
                {categoryError ? (
                  <Text
                    fontFamily={fonts.interMedium}
                    fontSize={11}
                    color={DANGER}>
                    {categoryError}
                  </Text>
                ) : null}
              </View>
              <SettingsRow
                label="Manage Categories"
                kind="nav"
                last
                onPress={() => setCategoriesOpen(true)}
              />
            </SettingsSection>

            <SettingsSection title="Security & Data">
              <SettingsRow
                icon={<DownloadIcon color={ICON} size={16} />}
                label="Export Data"
                subtitle="CSV of expenses"
                kind="nav"
                onPress={exportData}
              />
              <SettingsRow
                icon={<LockIcon color={ICON} size={16} />}
                label="Biometric Lock"
                last
                kind="toggle"
                accessory={
                  <Switch
                    value={biometric}
                    onValueChange={setBiometric}
                    trackColor={{false: 'rgba(0,0,0,0.08)', true: colors.accent}}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor="rgba(0,0,0,0.08)"
                    accessibilityLabel={`Biometric Lock, ${biometric ? 'on' : 'off'}`}
                  />
                }
              />
            </SettingsSection>

            <View style={styles.group}>
              <SettingsSection title="About">
                <SettingsRow
                  label="App Version"
                  value="v0.0.1 (Beta)"
                  kind="info"
                  last
                />
              </SettingsSection>
              {onSignOut ? (
                <PressableScale
                  onPress={confirmSignOut}
                  scaleTo={0.98}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  containerStyle={styles.signOutWrap}
                  style={styles.signOutShadow}>
                  <GlassPanel
                    radius={radii.pill}
                    intensity="md"
                    overlayColor="rgba(255,255,255,0.8)"
                    style={styles.signOutGlass}
                    contentStyle={styles.signOutInner}>
                    <LogOutIcon color={INK} size={16} />
                    <Text
                      fontFamily={fonts.outfitBold}
                      fontSize={15}
                      lineHeight={20}
                      fontWeight="700"
                      color={INK}>
                      Sign out
                    </Text>
                  </GlassPanel>
                </PressableScale>
              ) : null}
            </View>

            <SettingsSection
              title="Danger Zone"
              danger
              footer="Deletes this account and its profile. This cannot be undone.">
              <SettingsRow
                icon={<TrashGlyph color={DANGER} size={16} />}
                label="Delete Account"
                last
                destructive
                kind="nav"
                onPress={confirmDelete}
              />
            </SettingsSection>
          </ScrollView>
        </KeyboardAvoidingView>

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
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flex: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  backFace: {
    width: 40,
    height: 40,
    ...shadows.avatar,
  },
  backGlass: {
    width: 40,
    height: 40,
  },
  backInner: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveHit: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 22,
  },
  identityInner: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  avatarPressable: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#F3E3C3',
  },
  avatarInitials: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#F3E3C3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#00000010',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F6F0E4',
  },
  heroName: {
    marginTop: 12,
  },
  fieldStack: {
    gap: 8,
  },
  inputShell: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: HAIR,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  prefix: {
    marginRight: 6,
  },
  moneyInput: {
    flex: 1,
    padding: 0,
    fontFamily: fonts.outfitBold,
    fontSize: 16,
    fontWeight: '700',
    color: INK,
  },
  nameInput: {
    flex: 1,
    padding: 0,
    fontFamily: fonts.interMedium,
    fontSize: 15,
    fontWeight: '500',
    color: INK,
  },
  editNameBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CHIP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: DIVIDER,
  },
  emailBlock: {
    gap: 6,
  },
  emailLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5A8A5A1F',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  derivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBlock: {
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingRight: 12,
    paddingLeft: 10,
    borderRadius: 999,
    backgroundColor: CHIP,
    gap: 6,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  group: {
    gap: 10,
  },
  signOutWrap: {
    width: '100%',
  },
  signOutShadow: {
    width: '100%',
    ...shadows.cardSoft,
  },
  signOutGlass: {
    width: '100%',
  },
  signOutInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
});
