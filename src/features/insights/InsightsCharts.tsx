import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '../../components/ui';
import { colors, spacing } from '../../theme';

export type BarChartProps = {
  data: { label: string; value: number }[];
  highlightMax?: boolean;
};

export function BarChart({ data, highlightMax = false }: BarChartProps) {
  const maxVal = Math.max(...data.map(d => d.value));

  return (
    <View style={styles.container}>
      {data.map((item, index) => {
        const isMax = item.value === maxVal;
        const height = maxVal > 0 ? (item.value / maxVal) * 120 : 0;
        const barColor = (highlightMax && isMax) ? colors.accentPress : colors.accent;

        return (
          <View key={index} style={styles.barColumn}>
            {isMax && highlightMax ? (
              <AppText variant="caption" style={styles.maxValue}>
                {item.value}
              </AppText>
            ) : (
              <View style={styles.placeholder} />
            )}
            <View style={[styles.bar, { height, backgroundColor: barColor }]} />
            <AppText variant="caption" style={styles.label}>
              {item.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 160,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: spacing.sm / 2,
  },
  maxValue: {
    marginBottom: spacing.xs,
    color: colors.inkMuted,
  },
  placeholder: {
    height: 16,
    marginBottom: spacing.xs,
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  label: {
    marginTop: spacing.sm,
    color: colors.inkMuted,
  },
});
