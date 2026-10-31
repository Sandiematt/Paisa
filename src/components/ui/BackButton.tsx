import React from 'react';
import {View} from 'react-native';

import {colors, makeStyles, radii} from '../../theme';
import {PressableScale} from './PressableScale';

type BackButtonProps = {
  onPress: () => void;
};

/**
 * Round `track` glass button with a geometric chevron. Unicode arrows sit
 * left of optical centre and Android adds font padding, so the glyph is drawn
 * from two bars.
 */
export function BackButton({onPress}: BackButtonProps) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.92}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      containerStyle={styles.hit}
      style={styles.face}>
      <View style={styles.chevron}>
        <View style={[styles.arm, styles.armTop]} />
        <View style={[styles.arm, styles.armBottom]} />
      </View>
    </PressableScale>
  );
}

export const BACK_BUTTON_SIZE = 44;

const ARM_LENGTH = 11;
const ARM_THICKNESS = 2;

const useStyles = makeStyles(() => ({
  hit: {
    width: BACK_BUTTON_SIZE,
    height: BACK_BUTTON_SIZE,
  },
  face: {
    width: BACK_BUTTON_SIZE,
    height: BACK_BUTTON_SIZE,
    borderRadius: radii.pill,
    backgroundColor: colors.track,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    width: 14,
    height: 14,
    // Nudge right so the V of the chevron sits on the visual centre, not the
    // bounding box of two rotated bars.
    marginLeft: 2,
  },
  arm: {
    position: 'absolute',
    left: 1,
    width: ARM_LENGTH,
    height: ARM_THICKNESS,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
  },
  armTop: {
    top: 3,
    transform: [{rotate: '-42deg'}],
  },
  armBottom: {
    bottom: 3,
    transform: [{rotate: '42deg'}],
  },
}));
