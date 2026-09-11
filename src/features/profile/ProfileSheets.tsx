import React, {useEffect, useState} from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  AppText,
  BackButton,
  Chip,
  PressableScale,
  SelectCard,
  TogglePill,
} from '../../components/ui';
import {colors, layout, radii, spacing} from '../../theme';
import {
  CATEGORIES,
  CURRENCIES,
  GOALS,
  MIN_CATEGORIES,
} from '../onboarding/constants';
import {GoalId} from '../onboarding/types';
import {SettingsRow} from './SettingsRow';
import {SettingsSection} from './SettingsSection';

type SheetFrameProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

function SheetFrame({visible, title, onClose, children}: SheetFrameProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={[styles.root, {paddingTop: insets.top || spacing.md}]}>
        <View style={styles.header}>
          <BackButton onPress={onClose} />
          <AppText variant="heading" style={styles.headerTitle}>
            {title}
          </AppText>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {paddingBottom: Math.max(insets.bottom, spacing.xxl)},
          ]}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

type CurrencySheetProps = {
  visible: boolean;
  value: string;
  onSelect: (code: string) => void;
  onClose: () => void;
};

export function CurrencySheet({
  visible,
  value,
  onSelect,
  onClose,
}: CurrencySheetProps) {
  return (
    <SheetFrame visible={visible} title="Primary Currency" onClose={onClose}>
      <SettingsSection title="Choose a currency">
        {CURRENCIES.map((item, index) => (
          <SettingsRow
            key={item.code}
            label={`${item.symbol}  ${item.code}`}
            value={item.label}
            last={index === CURRENCIES.length - 1}
            onPress={() => {
              onSelect(item.code);
              onClose();
            }}
            accessory={
              value === item.code ? (
                <AppText variant="label" color={colors.accentPress}>
                  Selected
                </AppText>
              ) : undefined
            }
          />
        ))}
      </SettingsSection>
    </SheetFrame>
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
    <SheetFrame visible={visible} title="Primary Goal" onClose={onClose}>
      <AppText variant="body" color={colors.inkSecondary} style={styles.lead}>
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
    <SheetFrame visible={visible} title="Tracked Categories" onClose={onClose}>
      <AppText variant="body" color={colors.inkSecondary} style={styles.lead}>
        Used for expenses and AI sorting. Choose at least {MIN_CATEGORIES}.
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
        color={tooFew ? colors.danger : colors.inkMuted}
        style={styles.chipStatus}>
        {tooFew
          ? `Choose at least ${MIN_CATEGORIES} categories.`
          : `${draftIds.length} categories active.`}
      </AppText>
      <PressableScale
        onPress={() => {
          if (tooFew) {
            return;
          }
          onChange(draftIds);
          onClose();
        }}
        disabled={tooFew}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityState={{disabled: tooFew}}
        style={[styles.doneBtn, tooFew && styles.doneBtnDisabled]}>
        <AppText
          variant="bodyStrong"
          color={tooFew ? colors.inkMuted : colors.onInk}>
          Done
        </AppText>
      </PressableScale>
    </SheetFrame>
  );
}

type ToggleItem = {
  id: string;
  label: string;
  caption: string;
};

type ToggleSheetProps = {
  visible: boolean;
  title: string;
  intro: string;
  items: ToggleItem[];
  values: Record<string, boolean>;
  onChange: (id: string, value: boolean) => void;
  onClose: () => void;
};

function ToggleSheet({
  visible,
  title,
  intro,
  items,
  values,
  onChange,
  onClose,
}: ToggleSheetProps) {
  return (
    <SheetFrame visible={visible} title={title} onClose={onClose}>
      <AppText variant="body" color={colors.inkSecondary} style={styles.lead}>
        {intro}
      </AppText>
      <SettingsSection title="Options">
        {items.map((item, index) => (
          <View
            key={item.id}
            style={[
              styles.toggleRow,
              index < items.length - 1 && styles.toggleDivider,
            ]}>
            <View style={styles.toggleCopy}>
              <AppText variant="body">{item.label}</AppText>
              <AppText variant="caption" color={colors.inkMuted}>
                {item.caption}
              </AppText>
            </View>
            <Switch
              value={values[item.id] ?? false}
              onValueChange={next => onChange(item.id, next)}
              trackColor={{false: colors.canvasSunk, true: colors.accent}}
              thumbColor={colors.surface}
            />
          </View>
        ))}
      </SettingsSection>
    </SheetFrame>
  );
}

type NotificationsSheetProps = {
  visible: boolean;
  values: Record<string, boolean>;
  onChange: (id: string, value: boolean) => void;
  onClose: () => void;
};

export function NotificationsSheet(props: NotificationsSheetProps) {
  return (
    <ToggleSheet
      {...props}
      title="Notifications"
      intro="Choose what Paisa should tap you about. Delivery wiring comes next."
      items={[
        {
          id: 'spend',
          label: 'Spending alerts',
          caption: 'When a day or category runs hot.',
        },
        {
          id: 'monthly',
          label: 'Monthly summary',
          caption: 'A recap when the month closes.',
        },
        {
          id: 'ai',
          label: 'Paisa AI tips',
          caption: 'Occasional nudges from chat insights.',
        },
      ]}
    />
  );
}

type AiPreferencesSheetProps = {
  visible: boolean;
  autoCategorize: boolean;
  onAutoCategorize: (value: boolean) => void;
  tone: 'short' | 'detailed';
  onTone: (value: 'short' | 'detailed') => void;
  onClose: () => void;
};

export function AiPreferencesSheet({
  visible,
  autoCategorize,
  onAutoCategorize,
  tone,
  onTone,
  onClose,
}: AiPreferencesSheetProps) {
  return (
    <SheetFrame visible={visible} title="AI Preferences" onClose={onClose}>
      <AppText variant="body" color={colors.inkSecondary} style={styles.lead}>
        How Paisa reads new expenses and talks back.
      </AppText>
      <SettingsSection title="Sorting">
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <AppText variant="body">Auto-categorize</AppText>
            <AppText variant="caption" color={colors.inkMuted}>
              Guess a category from the merchant and note.
            </AppText>
          </View>
          <Switch
            value={autoCategorize}
            onValueChange={onAutoCategorize}
            trackColor={{false: colors.canvasSunk, true: colors.accent}}
            thumbColor={colors.surface}
          />
        </View>
      </SettingsSection>
      <SettingsSection title="Reply length">
        <View style={styles.toneRow}>
          <TogglePill
            label="Short"
            selected={tone === 'short'}
            onPress={() => onTone('short')}
          />
          <TogglePill
            label="Detailed"
            selected={tone === 'detailed'}
            onPress={() => onTone('detailed')}
          />
        </View>
      </SettingsSection>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    letterSpacing: -0.4,
  },
  headerSpacer: {
    width: 44,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  lead: {
    marginBottom: spacing.lg,
    marginHorizontal: spacing.xs,
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
  doneBtn: {
    height: layout.controlHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnDisabled: {
    backgroundColor: colors.canvasSunk,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  toggleDivider: {
    borderBottomWidth: layout.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  toggleCopy: {
    flex: 1,
    marginRight: spacing.md,
  },
  toneRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
});
