import React from 'react';
import {View} from 'react-native';
import {Backspace} from 'phosphor-react-native/src/icons/Backspace';

import {AppText, PressableScale} from '../../components/ui';
import {PIN_LENGTH} from '../../lib/biometricLock';
import {colors, makeStyles, radii, spacing} from '../../theme';

type PinPadProps = {
  value: string;
  onChange: (next: string) => void;
  /** Turns the dots red, for a PIN that did not match. */
  error?: boolean;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const;

/** PIN dots and a phone-style keypad; stops taking digits once the PIN is full. */
export function PinPad({value, onChange, error = false}: PinPadProps) {
  const styles = useStyles();

  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'back') {
      onChange(value.slice(0, -1));
    } else if (key && value.length < PIN_LENGTH) {
      onChange(value + key);
    }
  };

  return (
    <View>
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={`${value.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({length: PIN_LENGTH}, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index < value.length && styles.dotFilled,
              error && styles.dotError,
            ]}
          />
        ))}
      </View>
      <View style={styles.keys}>
        {KEYS.map((key, index) => (
          <View key={index} style={styles.keyCell}>
            {key ? (
              <PressableScale
                onPress={() => press(key)}
                accessibilityRole="button"
                accessibilityLabel={key === 'back' ? 'Delete' : key}
                containerStyle={styles.keyHit}
                style={styles.key}>
                {key === 'back' ? (
                  <Backspace size={24} color={colors.text} />
                ) : (
                  <AppText variant="title">{key}</AppText>
                )}
              </PressableScale>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const KEY_SIZE = 64;

const useStyles = makeStyles(() => ({
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.lavender,
  },
  dotFilled: {
    backgroundColor: colors.violet,
    borderColor: colors.violet,
  },
  dotError: {
    borderColor: colors.roseLight,
    backgroundColor: colors.roseLight,
  },
  keys: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
    width: KEY_SIZE * 3 + spacing.xxl * 2,
    rowGap: spacing.md,
    columnGap: spacing.xxl,
  },
  keyCell: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  keyHit: {
    flex: 1,
  },
  key: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSunk,
  },
}));
