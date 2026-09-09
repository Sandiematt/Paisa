import React from 'react';
import {StyleSheet, View} from 'react-native';

import {AppText, Screen} from '../../components/ui';
import {colors, layout, spacing} from '../../theme';

type ComingSoonScreenProps = {
  title: string;
};

export function ComingSoonScreen({title}: ComingSoonScreenProps) {
  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <AppText variant="display">{title}</AppText>
      </View>
      <View style={styles.body}>
        <AppText variant="heading" color={colors.inkSecondary} align="center">
          {title} coming soon
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.section,
  },
});
