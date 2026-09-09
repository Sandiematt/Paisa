/* Size-driven geometry; StyleSheet cannot take the `size` argument. */
/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import {StyleSheet, View} from 'react-native';

import {radii} from '../../theme';

type GlyphProps = {
  color: string;
  size?: number;
};

/**
 * Geometric glyphs, same construction as BackButton: Views, not a font. That
 * keeps optical centre and stroke weight consistent across iOS and Android.
 */
export function HomeGlyph({color, size = 22}: GlyphProps) {
  const roof = size * 0.52;
  const body = size * 0.62;
  return (
    <View style={{width: size, height: size, alignItems: 'center'}}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: roof * 0.72,
          borderRightWidth: roof * 0.72,
          borderBottomWidth: roof * 0.7,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
          marginBottom: 1,
        }}
      />
      <View
        style={{
          width: body,
          height: size * 0.42,
          borderWidth: 1.8,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
        }}
      />
    </View>
  );
}

export function ActivityGlyph({color, size = 22}: GlyphProps) {
  const inset = size * 0.18;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderWidth: 1.8,
        borderColor: color,
        borderRadius: 4,
        paddingHorizontal: inset,
        paddingVertical: inset * 0.9,
        justifyContent: 'space-between',
      }}>
      <View style={[styles.rule, {backgroundColor: color}]} />
      <View
        style={[styles.rule, {backgroundColor: color, width: '72%'}]}
      />
      <View
        style={[styles.rule, {backgroundColor: color, width: '88%'}]}
      />
    </View>
  );
}

export function InsightsGlyph({color, size = 22}: GlyphProps) {
  const bar = size * 0.2;
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: size * 0.12,
      }}>
      <View
        style={{
          width: bar,
          height: size * 0.42,
          borderRadius: 1.5,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: bar,
          height: size * 0.72,
          borderRadius: 1.5,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: bar,
          height: size,
          borderRadius: 1.5,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function AskGlyph({color, size = 22}: GlyphProps) {
  const arm = size * 0.16;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          position: 'absolute',
          width: arm,
          height: size,
          borderRadius: radii.pill,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size,
          height: arm,
          borderRadius: radii.pill,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: arm,
          height: size * 0.68,
          borderRadius: radii.pill,
          backgroundColor: color,
          transform: [{rotate: '45deg'}],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: arm,
          height: size * 0.68,
          borderRadius: radii.pill,
          backgroundColor: color,
          transform: [{rotate: '-45deg'}],
        }}
      />
    </View>
  );
}

export function PlusGlyph({color, size = 22}: GlyphProps) {
  const thickness = Math.max(2.4, size * 0.12);
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: thickness,
          borderRadius: radii.pill,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: thickness,
          height: size,
          borderRadius: radii.pill,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function SearchGlyph({color, size = 18}: GlyphProps) {
  const lens = size * 0.72;
  return (
    <View style={{width: size, height: size}}>
      <View
        style={{
          width: lens,
          height: lens,
          borderRadius: radii.pill,
          borderWidth: 1.8,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: 0,
          bottom: 1,
          width: size * 0.42,
          height: 1.8,
          borderRadius: radii.pill,
          backgroundColor: color,
          transform: [{rotate: '42deg'}],
        }}
      />
    </View>
  );
}

export function ReceiptGlyph({color, size = 18}: GlyphProps) {
  return (
    <View
      style={{
        width: size * 0.78,
        height: size,
        borderWidth: 1.6,
        borderColor: color,
        borderRadius: 3,
        paddingHorizontal: 3,
        paddingVertical: 4,
        justifyContent: 'space-between',
      }}>
      <View style={[styles.rule, {backgroundColor: color}]} />
      <View style={[styles.rule, {backgroundColor: color, width: '70%'}]} />
      <View style={[styles.rule, {backgroundColor: color, width: '85%'}]} />
    </View>
  );
}

export function MicGlyph({color, size = 18}: GlyphProps) {
  const capsuleW = size * 0.42;
  const capsuleH = size * 0.58;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'flex-start',
      }}>
      <View
        style={{
          width: capsuleW,
          height: capsuleH,
          borderRadius: radii.pill,
          borderWidth: 1.7,
          borderColor: color,
        }}
      />
      <View
        style={{
          marginTop: 1,
          width: size * 0.7,
          height: size * 0.28,
          borderWidth: 1.6,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: size,
          borderBottomRightRadius: size,
        }}
      />
      <View
        style={{
          width: 1.6,
          height: 3,
          backgroundColor: color,
          marginTop: 0,
        }}
      />
    </View>
  );
}

export function BackspaceGlyph({color, size = 22}: GlyphProps) {
  return (
    <View
      style={{
        width: size,
        height: size * 0.72,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: size * 0.72,
          height: size * 0.56,
          borderWidth: 1.7,
          borderColor: color,
          borderRadius: 3,
          marginLeft: 4,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: size * 0.28,
            height: 1.8,
            backgroundColor: color,
            borderRadius: 1,
            transform: [{rotate: '45deg'}],
            position: 'absolute',
          }}
        />
        <View
          style={{
            width: size * 0.28,
            height: 1.8,
            backgroundColor: color,
            borderRadius: 1,
            transform: [{rotate: '-45deg'}],
            position: 'absolute',
          }}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          left: 0,
          width: 0,
          height: 0,
          borderTopWidth: size * 0.28,
          borderBottomWidth: size * 0.28,
          borderRightWidth: size * 0.28,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderRightColor: color,
        }}
      />
    </View>
  );
}

export function BellGlyph({color, size = 20}: GlyphProps) {
  const dome = size * 0.62;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}>
      <View
        style={{
          width: dome,
          height: dome * 0.85,
          borderWidth: 1.7,
          borderColor: color,
          borderBottomLeftRadius: dome,
          borderBottomRightRadius: dome,
          borderTopLeftRadius: dome * 0.7,
          borderTopRightRadius: dome * 0.7,
        }}
      />
      <View
        style={{
          width: size * 0.55,
          height: 1.7,
          borderRadius: 1,
          backgroundColor: color,
          marginTop: 1,
        }}
      />
      <View
        style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
          marginTop: 1,
        }}
      />
    </View>
  );
}

export function RefreshGlyph({color, size = 14}: GlyphProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.6,
        borderColor: color,
        borderTopColor: 'transparent',
        transform: [{rotate: '-20deg'}],
      }}>
      <View
        style={{
          position: 'absolute',
          top: -2,
          right: 1,
          width: 0,
          height: 0,
          borderLeftWidth: 3.5,
          borderRightWidth: 3.5,
          borderBottomWidth: 5,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
          transform: [{rotate: '110deg'}],
        }}
      />
    </View>
  );
}

export function TrendUpGlyph({color, size = 10}: GlyphProps) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderLeftWidth: size * 0.45,
        borderRightWidth: size * 0.45,
        borderBottomWidth: size,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
      }}
    />
  );
}

const styles = StyleSheet.create({
  rule: {
    height: 1.7,
    width: '100%',
    borderRadius: 1,
  },
});

