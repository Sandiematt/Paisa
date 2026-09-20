import React from 'react';
import {StyleSheet, View} from 'react-native';

/** Stitch Paisa AI robot: ceramic head, charcoal visor, marigold ears and antenna. */
export function PaisaMascot() {
  return (
    <View style={styles.wrap} accessibilityLabel="Paisa AI mascot">
      <View style={styles.aura} />
      <View style={styles.antennaBall} />
      <View style={styles.antennaStem} />
      <View style={[styles.ear, styles.earLeft]} />
      <View style={[styles.earInner, styles.earInnerLeft]} />
      <View style={[styles.ear, styles.earRight]} />
      <View style={[styles.earInner, styles.earInnerRight]} />
      <View style={styles.head}>
        <View style={styles.visor}>
          <View style={styles.visorSheen} />
          <View style={styles.eyes}>
            <View style={styles.eye} />
            <View style={styles.eye} />
          </View>
        </View>
      </View>
      <View style={styles.torso} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 116,
    height: 105,
    alignItems: 'center',
  },
  aura: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(245, 166, 56, 0.22)',
    top: 14,
  },
  antennaBall: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F0A63C',
    zIndex: 3,
  },
  antennaStem: {
    width: 4,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#EE8838',
    marginTop: -1,
    zIndex: 2,
  },
  ear: {
    position: 'absolute',
    width: 11,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#DF5F2D',
    top: 42,
  },
  earLeft: {
    left: 4,
  },
  earRight: {
    right: 4,
  },
  earInner: {
    position: 'absolute',
    width: 6,
    height: 20,
    borderRadius: 3,
    backgroundColor: '#ED793E',
    top: 46,
  },
  earInnerLeft: {
    left: 6,
  },
  earInnerRight: {
    right: 6,
  },
  head: {
    width: 86,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#FAF5EE',
    borderWidth: 1.5,
    borderColor: '#E8DCCC',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  visor: {
    width: 68,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#252422',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  visorSheen: {
    position: 'absolute',
    top: 6,
    width: 52,
    height: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(75, 72, 68, 0.55)',
  },
  eyes: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  eye: {
    width: 16,
    height: 11,
    borderColor: '#FFFFFF',
    borderTopWidth: 3.2,
    borderLeftWidth: 3.2,
    borderRightWidth: 3.2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  torso: {
    width: 48,
    height: 10,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: 'rgba(222, 115, 54, 0.9)',
    marginTop: -4,
  },
});
