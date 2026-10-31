import React from 'react';
import {View} from 'react-native';

import {AppText, Stagger} from '../../../components/ui';
import {colors, layout, makeStyles, spacing} from '../../../theme';

type StepLayoutProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

/**
 * Shared frame for every wizard step: the heading always reveals first, then
 * the step's own blocks continue the stagger from index 1.
 */
export function StepLayout({title, subtitle, children}: StepLayoutProps) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <Stagger index={0}>
        <AppText variant="display" style={styles.title}>
          {title}
        </AppText>
        <AppText variant="body" color={colors.muted} style={styles.subtitle}>
          {subtitle}
        </AppText>
      </Stagger>

      <View style={styles.body}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.section,
  },
  // Display weight and tracking, scaled down so a long question still sits on
  // two lines on a narrow phone.
  title: {
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.9,
  },
  subtitle: {
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  body: {
    marginTop: spacing.xxxl,
  },
}));
