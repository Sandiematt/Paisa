import React, {useEffect, useState} from 'react';
import {Image, Modal, ScrollView, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {CheckGlyph} from '../../components/icons/Glyphs';
import {AppText, BackButton, PressableScale, SecondaryButton} from '../../components/ui';
import {colors, layout, radii, spacing} from '../../theme';
import {AVATAR_PRESETS, AvatarPreset} from './avatarPresets';

type AvatarPickerModalProps = {
  visible: boolean;
  currentAvatarUrl?: string;
  onSelectAvatar: (url: string | undefined) => void;
  onClose: () => void;
};

const AVATAR_SIZE = 64;

export function AvatarPickerModal({
  visible,
  currentAvatarUrl,
  onSelectAvatar,
  onClose,
}: AvatarPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedUrl, setSelectedUrl] = useState<string | undefined>(
    currentAvatarUrl,
  );

  useEffect(() => {
    if (visible) {
      setSelectedUrl(currentAvatarUrl);
    }
  }, [currentAvatarUrl, visible]);

  const handleSelectPreset = (preset: AvatarPreset) => {
    setSelectedUrl(preset.url);
    onSelectAvatar(preset.url);
    onClose();
  };

  const handleRemove = () => {
    setSelectedUrl(undefined);
    onSelectAvatar(undefined);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <View style={[styles.root, {paddingTop: insets.top || spacing.lg}]}>
        <View style={styles.header}>
          <BackButton onPress={onClose} />
          <AppText variant="heading" style={styles.title}>
            Profile Photo
          </AppText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl},
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <AppText
              variant="label"
              color={colors.inkSecondary}
              style={styles.sectionLabel}>
              CHOOSE FROM PRESETS
            </AppText>
            <View style={styles.grid}>
              {AVATAR_PRESETS.map(preset => {
                const isSelected = selectedUrl === preset.url;
                return (
                  <PressableScale
                    key={preset.id}
                    onPress={() => handleSelectPreset(preset)}
                    scaleTo={0.94}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose avatar ${preset.name}`}
                    containerStyle={styles.slot}
                    style={styles.slotInner}>
                    <View
                      style={[
                        styles.imageRing,
                        isSelected && styles.imageRingSelected,
                      ]}>
                      <Image
                        source={{uri: preset.url}}
                        style={styles.presetImage}
                        resizeMode="cover"
                      />
                      {isSelected ? (
                        <View style={styles.checkBadge}>
                          <CheckGlyph color={colors.onInk} size={10} />
                        </View>
                      ) : null}
                    </View>
                    <AppText
                      variant="caption"
                      color={isSelected ? colors.ink : colors.inkMuted}
                      align="center"
                      numberOfLines={1}
                      style={styles.presetName}>
                      {preset.name}
                    </AppText>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          {selectedUrl ? (
            <SecondaryButton
              label="Remove photo (Use initials)"
              onPress={handleRemove}
              style={styles.removeButton}
            />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
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
    paddingVertical: spacing.md,
  },
  title: {
    letterSpacing: -0.3,
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    letterSpacing: 0.8,
    marginBottom: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  slot: {
    width: '25%',
    marginBottom: spacing.lg,
  },
  slotInner: {
    alignItems: 'center',
    width: '100%',
  },
  imageRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  imageRingSelected: {
    borderColor: colors.ink,
  },
  presetImage: {
    width: '100%',
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSunk,
  },
  checkBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.accentPress,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  presetName: {
    marginTop: spacing.sm,
    width: '100%',
    paddingHorizontal: spacing.xs,
    fontWeight: '600',
  },
  removeButton: {
    marginBottom: spacing.lg,
  },
});
