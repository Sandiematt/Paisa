import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import {colors, duration, easing, fonts, radii} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  accessibilityLabel?: string;
};

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const PAD = 4;
const SEGMENT_HEIGHT = 36;

/**
 * Week / Month / Year style control. `surface` track with a `line` border and
 * 4px padding; the active segment is a `text`-coloured pill with a bold
 * `ground` label that slides between options.
 *
 *   <SegmentedControl
 *     options={[{value: 'week', label: 'Week'}, {value: 'month', label: 'Month'}]}
 *     value={range}
 *     onChange={setRange}
 *   />
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const reducedMotion = useReducedMotion();
  const [innerWidth, setInnerWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex(option => option.value === value),
  );
  const slide = useRef(new Animated.Value(index)).current;
  const segmentWidth = options.length > 0 ? innerWidth / options.length : 0;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: index,
      duration: reducedMotion ? 0 : duration.control,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [index, reducedMotion, slide]);

  const onLayout = (event: LayoutChangeEvent) => {
    setInnerWidth(event.nativeEvent.layout.width);
  };

  const translateX = Animated.multiply(slide, segmentWidth);

  return (
    <View
      style={[styles.track, style]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}>
      <View style={styles.inner} onLayout={onLayout}>
        {segmentWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              {width: segmentWidth, transform: [{translateX}]},
            ]}
          />
        ) : null}
        {options.map(option => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="tab"
              accessibilityState={{selected: active}}
              accessibilityLabel={option.accessibilityLabel ?? option.label}
              style={styles.segment}>
              <Animated.Text
                numberOfLines={1}
                style={[
                  styles.label,
                  active ? styles.labelActive : styles.labelIdle,
                ]}>
                {option.label}
              </Animated.Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    padding: PAD - 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  inner: {
    flexDirection: 'row',
    height: SEGMENT_HEIGHT,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
  },
  segment: {
    flex: 1,
    height: SEGMENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
  },
  labelActive: {
    fontFamily: fonts.jakartaBold,
    color: colors.ground,
  },
  labelIdle: {
    fontFamily: fonts.jakartaMedium,
    color: colors.muted,
  },
});
