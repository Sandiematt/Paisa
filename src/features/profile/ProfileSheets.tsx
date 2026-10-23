import React, {useEffect, useState} from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  AppText,
  BackButton,
  Chip,
  PressableScale,
  SelectCard,
} from '../../components/ui';
import {colors, layout, radii, spacing} from '../../theme';
import {CATEGORIES, GOALS, MIN_CATEGORIES} from '../onboarding/constants';
import {GoalId} from '../onboarding/types';

type SheetFrameProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Sits where the header's right edge would otherwise be empty. */
  trailing?: React.ReactNode;
  children: React.ReactNode;
};

export function SheetFrame({
  visible,
  title,
  onClose,
  trailing,
  children,
}: SheetFrameProps) {
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
          {trailing ?? <View style={styles.headerSpacer} />}
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
});
