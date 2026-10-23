import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';

import {colors, spacing} from '../../theme';
import {AppText} from './AppText';
import {PressableScale} from './PressableScale';

type SectionTitleProps = {
  title: string;
  /** Optional right-aligned link, e.g. "See all". */
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * 20 bold section header (-0.3 tracking). Carries the usual DX rhythm: use
 * `style={{marginTop: 26}}` between sections and `paddingHorizontal` from the
 * parent. An optional lavender link sits on the right.
 */
export function SectionTitle({
  title,
  actionLabel,
  onActionPress,
  style,
}: SectionTitleProps) {
  return (
    <View style={[styles.row, style]}>
      <AppText
        variant="sectionTitle"
        accessibilityRole="header"
        style={styles.title}>
        {title}
      </AppText>
      {actionLabel && onActionPress ? (
        <PressableScale
          onPress={onActionPress}
          scaleTo={0.96}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}>
          <AppText variant="bodyStrong" color={colors.lavender}>
            {actionLabel}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    flexShrink: 1,
  },
});
