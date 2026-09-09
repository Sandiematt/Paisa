import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';

import {colors, radii, spacing, spring} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {AppText} from './AppText';
import {PressableScale} from './PressableScale';

type ChipProps = {
  label: string;
  /** Category colour, shown as the leading dot. Matches the report legend. */
  dotColor: string;
  selected: boolean;
  onToggle: () => void;
};

export function Chip({label, dotColor, selected, onToggle}: ChipProps) {
  const reducedMotion = useReducedMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (reducedMotion || !selected) {
      return;
    }
    // Selection is a one-off confirmation, so it gets a small settle rather
    // than a linear fade. Deselect stays silent: nothing to confirm.
    pop.setValue(0.94);
    Animated.spring(pop, {
      toValue: 1,
      ...spring.select,
      useNativeDriver: true,
    }).start();
  }, [pop, reducedMotion, selected]);

  return (
    <PressableScale
      onPress={onToggle}
      scaleTo={0.95}
      accessibilityRole="checkbox"
      accessibilityState={{checked: selected}}
      accessibilityLabel={label}>
      {/* Nested so the press scale and the selection settle compose instead of
          fighting over one transform. */}
      <Animated.View
        style={[
          styles.chip,
          selected && styles.chipSelected,
          {transform: [{scale: pop}]},
        ]}>
        <View
          style={[
            styles.dot,
            !selected && styles.dotDim,
            {backgroundColor: dotColor},
          ]}
        />
        <AppText
          variant="bodyStrong"
          color={selected ? colors.ink : colors.inkSecondary}>
          {label}
        </AppText>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.chip,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: radii.pill,
    marginRight: spacing.sm,
  },
  dotDim: {
    opacity: 0.35,
  },
});
