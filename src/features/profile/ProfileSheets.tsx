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
import {X} from 'phosphor-react-native';

import {
  AppText,
  Chip,
  PressableScale,
  PrimaryButton,
  SelectCard,
  TextField,
} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {
  colors,
  duration,
  easing,
  layout,
  radii,
  spacing,
} from '../../theme';
import {CATEGORIES, GOALS, MIN_CATEGORIES} from '../onboarding/constants';
import {GoalId} from '../onboarding/types';
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
      onRequestClose={onClose}>
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
        style={styles.sheetHost}>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight: height - insets.top - spacing.xl,
              transform: [{translateY}],
            },
          ]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <AppText variant="title" numberOfLines={1} style={styles.headerTitle}>
              {title}
            </AppText>
            {trailing ?? (
              <PressableScale
                onPress={onClose}
                scaleTo={0.92}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.closeButton}>
                <X size={18} color={colors.text} weight="bold" />
              </PressableScale>
            )}
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              {paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.sm},
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type GoalSheetProps = {
  visible: boolean;
  value: GoalId | null;
  onSelect: (goal: GoalId) => void;
  onClose: () => void;
};

export function GoalSheet({visible, value, onSelect, onClose}: GoalSheetProps) {
  return (
    <SheetFrame visible={visible} title="Primary goal" onClose={onClose}>
      <AppText variant="body" color={colors.muted} style={styles.lead}>
        This decides which insights lead your dashboard.
      </AppText>
      {GOALS.map((item, index) => (
        <View key={item.id} style={index > 0 ? styles.goalGap : undefined}>
          <SelectCard
            title={item.title}
            description={item.description}
            accent={item.accent}
            selected={value === item.id}
            onSelect={() => {
              onSelect(item.id);
              onClose();
            }}
          />
        </View>
      ))}
    </SheetFrame>
  );
}

type CategoriesSheetProps = {
  visible: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
};

export function CategoriesSheet({
  visible,
  selectedIds,
  onChange,
  onClose,
}: CategoriesSheetProps) {
  const [draftIds, setDraftIds] = useState(selectedIds);

  useEffect(() => {
    if (visible) {
      setDraftIds(selectedIds);
    }
  }, [selectedIds, visible]);

  const toggle = (id: string) => {
    setDraftIds(current =>
      current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id],
    );
  };

  const tooFew = draftIds.length < MIN_CATEGORIES;

  return (
    <SheetFrame visible={visible} title="Tracked categories" onClose={onClose}>
      <AppText variant="body" color={colors.muted} style={styles.lead}>
        Used for expenses. Choose at least {MIN_CATEGORIES}.
      </AppText>
      <View style={styles.chipWrap}>
        {CATEGORIES.map(category => (
          <Chip
            key={category.id}
            label={category.label}
            dotColor={category.color}
            selected={draftIds.includes(category.id)}
            onToggle={() => toggle(category.id)}
          />
        ))}
      </View>
      <AppText
        variant="caption"
        color={tooFew ? colors.roseLight : colors.muted}
        style={styles.chipStatus}>
        {tooFew
          ? `Choose at least ${MIN_CATEGORIES} categories.`
          : `${draftIds.length} categories active.`}
      </AppText>
      <PrimaryButton
        label="Done"
        disabled={tooFew}
        onPress={() => {
          onChange(draftIds);
          onClose();
        }}
      />
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
  onDone,
  onClose,
}: MoneySheetProps) {
  const [draft, setDraft] = useState(value);

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
      <PrimaryButton
        label="Done"
        style={styles.action}
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

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
});
