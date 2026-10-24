import React, {useEffect, useState} from 'react';
import {Alert, Image, Linking, StyleSheet, View} from 'react-native';

import {CheckGlyph} from '../../components/icons/Glyphs';
import {AppText, PressableScale, SecondaryButton} from '../../components/ui';
import {colors, radii, spacing} from '../../theme';
import {AvatarSource, pickAvatar} from './avatarImage';
import {AVATAR_PRESETS, AvatarPreset} from './avatarPresets';
import {SheetFrame} from './ProfileSheets';

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
  const [selectedUrl, setSelectedUrl] = useState<string | undefined>(
    currentAvatarUrl,
  );

  useEffect(() => {
    if (visible) {
      setSelectedUrl(currentAvatarUrl);
    }
  }, [currentAvatarUrl, visible]);

  const [busy, setBusy] = useState(false);

  const handlePick = async (source: AvatarSource) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await pickAvatar(source);
      if (result.status === 'selected') {
        setSelectedUrl(result.uri);
        onSelectAvatar(result.uri);
        onClose();
      } else if (result.status === 'denied') {
        const what = source === 'camera' ? 'camera' : 'photos';
        Alert.alert(
          `Allow ${what} access`,
          `Paisa needs ${what} access to set your profile photo. You can turn it on in Settings.`,
          [
            {text: 'Not now', style: 'cancel'},
            {text: 'Open Settings', onPress: () => Linking.openSettings()},
          ],
        );
      }
    } catch {
      Alert.alert(
        'Could not set photo',
        'Something went wrong while loading that image. Please try another one.',
      );
    } finally {
      setBusy(false);
    }
  };

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
    <SheetFrame visible={visible} title="Profile photo" onClose={onClose}>
      <View style={styles.actions}>
        <SecondaryButton
          label="Choose from library"
          onPress={() => handlePick('library')}
          accessibilityHint="Pick a photo from your photo library"
        />
        <SecondaryButton
          label="Choose from files"
          onPress={() => handlePick('files')}
          accessibilityHint="Pick an image from your files"
          style={styles.actionGap}
        />
        <SecondaryButton
          label="Take a photo"
          onPress={() => handlePick('camera')}
          accessibilityHint="Open the camera to take a new photo"
          style={styles.actionGap}
        />
      </View>

      <AppText variant="label" color={colors.muted} style={styles.sectionLabel}>
        Or choose a preset
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
              accessibilityState={{selected: isSelected}}
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
                    <CheckGlyph color={colors.text} size={10} />
                  </View>
                ) : null}
              </View>
              <AppText
                variant="caption"
                color={isSelected ? colors.text : colors.muted}
                align="center"
                numberOfLines={1}
                style={styles.presetName}>
                {preset.name}
              </AppText>
            </PressableScale>
          );
        })}
      </View>

      {selectedUrl ? (
        <SecondaryButton
          label="Remove photo (use initials)"
          onPress={handleRemove}
          style={styles.removeButton}
        />
      ) : null}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  actions: {
    marginBottom: spacing.xl,
  },
  actionGap: {
    marginTop: spacing.sm,
  },
  sectionLabel: {
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
    borderColor: colors.lavender,
  },
  presetImage: {
    width: '100%',
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  checkBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    backgroundColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surfaceRaised,
  },
  presetName: {
    marginTop: spacing.sm,
    width: '100%',
    paddingHorizontal: spacing.xs,
  },
  removeButton: {
    marginTop: spacing.sm,
  },
});
