import React, {useEffect, useMemo, useState} from 'react';
import {Modal, ScrollView, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {BoltIcon, TargetIcon} from '../../components/icons/FeatherIcons';
import {BackButton, Screen, Text} from '../../components/ui';
import {colors, fonts, layout, spacing} from '../../theme';
import {CATEGORIES, GOALS, MIN_CATEGORIES} from '../onboarding/constants';
import {GoalId, OnboardingDraft} from '../onboarding/types';
import {HomeAmbient} from '../home/HomeAmbient';
import {
  AiPreferencesSheet,
  CategoriesSheet,
  GoalSheet,
} from '../profile/ProfileSheets';
import {SettingsRow} from '../profile/SettingsRow';
import {SettingsSection} from '../profile/SettingsSection';
import {
  CompanionPrefs,
  DEFAULT_COMPANION_PREFS,
  loadCompanionPrefs,
  saveCompanionPrefs,
} from './companionPrefs';

export type CompanionSettingsScreenProps = {
  visible: boolean;
  draft: OnboardingDraft;
  onSave: (updated: OnboardingDraft) => void;
  onClose: () => void;
};

const ICON = '#6F6553';
const MUTED = '#6F634E';
const PREVIEW_CATEGORY_COUNT = 4;

export function CompanionSettingsScreen({
  visible,
  draft,
  onSave,
  onClose,
}: CompanionSettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const [goalOpen, setGoalOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [prefs, setPrefs] = useState<CompanionPrefs>(DEFAULT_COMPANION_PREFS);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    loadCompanionPrefs().then(loaded => {
      if (!cancelled) {
        setPrefs(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const goalLabel = GOALS.find(item => item.id === draft.goal)?.title;
  const previewCategories = useMemo(() => {
    const selected = CATEGORIES.filter(item => draft.categoryIds.includes(item.id));
    return {
      shown: selected.slice(0, PREVIEW_CATEGORY_COUNT),
      extra: Math.max(0, selected.length - PREVIEW_CATEGORY_COUNT),
    };
  }, [draft.categoryIds]);

  const aiSubtitle = `${prefs.tone === 'short' ? 'Short replies' : 'Detailed replies'} · ${
    prefs.autoCategorize ? 'Auto-sort on' : 'Auto-sort off'
  }`;

  const persistPrefs = (next: CompanionPrefs) => {
    setPrefs(next);
    void saveCompanionPrefs(next);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <Screen edges={['top']} backdrop={<HomeAmbient />}>
        <View style={styles.header}>
          <BackButton onPress={onClose} />
          <Text
            fontFamily={fonts.outfitSemi}
            fontSize={18}
            lineHeight={24}
            fontWeight="600"
            color={colors.ink}
            style={styles.headerTitle}>
            Settings
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingBottom: Math.max(insets.bottom, spacing.section)},
          ]}
          showsVerticalScrollIndicator={false}>
          <SettingsSection title="AI Preferences">
            <SettingsRow
              icon={<BoltIcon color={ICON} size={16} />}
              label="Paisa AI"
              subtitle={aiSubtitle}
              kind="nav"
              last
              onPress={() => setAiOpen(true)}
            />
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
                  color={colors.ink}>
                  Tracked Categories
                </Text>
                <Text
                  fontFamily={fonts.interMedium}
                  fontSize={12}
                  lineHeight={16}
                  color={MUTED}>
                  {draft.categoryIds.length} active
                </Text>
              </View>
              <View style={styles.previewRow}>
                {previewCategories.shown.map(item => (
                  <View key={item.id} style={styles.previewChip}>
                    <View style={[styles.previewDot, {backgroundColor: item.color}]} />
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
                    <Text fontFamily={fonts.interMedium} fontSize={12} color={MUTED}>
                      +{previewCategories.extra} more
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <SettingsRow
              label="Manage Categories"
              kind="nav"
              last
              onPress={() => setCategoriesOpen(true)}
            />
          </SettingsSection>
        </ScrollView>
      </Screen>

      <AiPreferencesSheet
        visible={aiOpen}
        autoCategorize={prefs.autoCategorize}
        onAutoCategorize={value => persistPrefs({...prefs, autoCategorize: value})}
        tone={prefs.tone}
        onTone={value => persistPrefs({...prefs, tone: value})}
        onClose={() => setAiOpen(false)}
      />
      <GoalSheet
        visible={goalOpen}
        value={draft.goal}
        onSelect={(goal: GoalId) => onSave({...draft, goal})}
        onClose={() => setGoalOpen(false)}
      />
      <CategoriesSheet
        visible={categoriesOpen}
        selectedIds={draft.categoryIds}
        onChange={ids => {
          if (ids.length < MIN_CATEGORIES) {
            return;
          }
          onSave({...draft, categoryIds: ids});
        }}
        onClose={() => setCategoriesOpen(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.xxl,
  },
  categoryBlock: {
    paddingVertical: 12,
    gap: 10,
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
    gap: 6,
    backgroundColor: '#00000008',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
