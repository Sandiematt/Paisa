import React from 'react';
import {View} from 'react-native';

import {AppText, GradientView, PressableScale} from '../../../components/ui';
import {colors, makeStyles, radii, spacing} from '../../../theme';
import {dayLabel} from '../constants';

type PaydayGridProps = {
  value: number | null;
  onSelect: (day: number) => void;
};

const DAYS = Array.from({length: 31}, (_, index) => index + 1);

/** Days 1-31 in rows of seven; the picked day fills with the brand gradient. */
export function PaydayGrid({value, onSelect}: PaydayGridProps) {
  const styles = useStyles();
  return (
    <View>
      <View style={styles.grid}>
        {DAYS.map(day => {
          const selected = value === day;
          return (
            <View key={day} style={styles.cell}>
              <PressableScale
                onPress={() => onSelect(day)}
                accessibilityRole="button"
                accessibilityState={{selected}}
                accessibilityLabel={`Payday on the ${dayLabel(day)}`}
                containerStyle={styles.dayHit}
                style={styles.dayHit}>
                {selected ? (
                  <GradientView gradient="primary" style={styles.day}>
                    <AppText variant="bodyStrong" color={colors.onAccent}>
                      {day}
                    </AppText>
                  </GradientView>
                ) : (
                  <View style={styles.day}>
                    <AppText variant="body">{day}</AppText>
                  </View>
                )}
              </PressableScale>
            </View>
          );
        })}
      </View>
      <AppText variant="caption" color={colors.muted} style={styles.note}>
        Picked 29, 30 or 31? Shorter months use their last day.
      </AppText>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Floored: a full 100/7 rounds up on some densities and wraps the 7th day.
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    padding: 3,
  },
  dayHit: {
    flex: 1,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  note: {
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },
}));
