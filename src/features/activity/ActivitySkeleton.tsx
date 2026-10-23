import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';

import {Card} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {colors, radii, withAlpha} from '../../theme';

const BLOCK = withAlpha(colors.text, 0.08);

/** Shimmering placeholder blocks that stand in for a ledger day while loading. */
export function ActivitySkeleton({rows = 4}: {rows?: number}) {
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });

  return (
    <Card
      padding={0}
      radius={radii.card}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading activity"
      accessibilityState={{busy: true}}>
      <Animated.View style={{opacity}}>
        <View style={styles.header}>
          <View style={[styles.block, styles.label]} />
          <View style={[styles.block, styles.total]} />
        </View>
        {Array.from({length: rows}, (_, index) => (
          <View key={index} style={[styles.row, styles.rowDivider]}>
            <View style={[styles.block, styles.icon]} />
            <View style={styles.copy}>
              <View style={[styles.block, styles.title]} />
              <View style={[styles.block, styles.subtitle]} />
            </View>
            <View style={[styles.block, styles.amount]} />
          </View>
        ))}
      </Animated.View>
    </Card>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: BLOCK,
    borderRadius: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  label: {
    width: 84,
    height: 14,
  },
  total: {
    width: 64,
    height: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  copy: {
    flex: 1,
    gap: 6,
  },
  title: {
    width: '60%',
    height: 14,
  },
  subtitle: {
    width: '38%',
    height: 11,
  },
  amount: {
    width: 56,
    height: 14,
  },
});
