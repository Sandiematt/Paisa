import React from 'react';
import {StyleSheet, View} from 'react-native';

/**
 * Profile Settings backdrop: plain yellow background.
 */
export function ProfileAmbient() {
  return <View pointerEvents="none" style={styles.wash} accessible={false} />;
}

const styles = StyleSheet.create({
  wash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#E3D2A8',
  },
});
