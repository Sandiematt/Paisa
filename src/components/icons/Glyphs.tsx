/* Size-driven geometry; StyleSheet cannot take the `size` argument. */
/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import {StyleSheet, View} from 'react-native';

import {colors, radii} from '../../theme';

type GlyphProps = {
  color: string;
  size?: number;
};

/**
 * Geometric glyphs, same construction as BackButton: Views, not a font. That
 * keeps optical centre and stroke weight consistent across iOS and Android.
 */
export type NavGlyphProps = GlyphProps & {
  active?: boolean;
};

/**
 * Modern fintech Home glyph:
 * Clean house silhouette with an arched doorway, crisp eaves, and active fill.
 */
export function HomeGlyph({color, size = 22, active}: NavGlyphProps) {
  const roofH = size * 0.46;
  const bodyW = size * 0.72;
  const bodyH = size * 0.48;
  const doorW = size * 0.24;
  const doorH = size * 0.28;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* Roof peak triangle */}
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.44,
          borderRightWidth: size * 0.44,
          borderBottomWidth: roofH,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      {/* House Body */}
      <View
        style={{
          width: bodyW,
          height: bodyH,
          backgroundColor: active ? color : 'transparent',
          borderWidth: active ? 0 : 2,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}>
        {/* Door cutout */}
        <View
          style={{
            width: doorW,
            height: doorH,
            backgroundColor: active ? colors.canvas : color,
            borderTopLeftRadius: radii.pill,
            borderTopRightRadius: radii.pill,
          }}
        />
      </View>
    </View>
  );
}

/**
 * Modern fintech Activity glyph:
 * A stylish card/ledger with spending pulse lines and a corner indicator badge.
 */
export function ActivityGlyph({color, size = 22, active}: NavGlyphProps) {
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
          width: size * 0.82,
          height: size * 0.88,
          borderWidth: 2,
          borderColor: color,
          borderRadius: 5,
          backgroundColor: active ? `${color}14` : 'transparent',
          paddingHorizontal: 3.5,
          paddingVertical: 3.5,
          justifyContent: 'space-between',
        }}>
        {/* Top header bar */}
        <View
          style={{
            height: 2.2,
            width: '100%',
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
        {/* Line 1 */}
        <View
          style={{
            height: 1.8,
            width: '60%',
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
        {/* Line 2 with transaction dot */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          <View
            style={{
              height: 1.8,
              width: '50%',
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
          <View
            style={{
              width: 3.5,
              height: 3.5,
              borderRadius: radii.pill,
              backgroundColor: active ? colors.accent : color,
            }}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Modern fintech Insights glyph:
 * Ascending analytics bar chart with an upward trend arrow trajectory.
 */
export function InsightsGlyph({color, size = 22, active}: NavGlyphProps) {
  const barW = size * 0.18;
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 1,
        gap: size * 0.1,
      }}>
      {/* Bar 1 */}
      <View
        style={{
          width: barW,
          height: size * 0.38,
          borderRadius: 2,
          backgroundColor: color,
          opacity: active ? 0.7 : 0.85,
        }}
      />
      {/* Bar 2 */}
      <View
        style={{
          width: barW,
          height: size * 0.65,
          borderRadius: 2,
          backgroundColor: color,
          opacity: active ? 0.85 : 0.95,
        }}
      />
      {/* Bar 3 (Leader) */}
      <View
        style={{
          width: barW,
          height: size * 0.92,
          borderRadius: 2,
          backgroundColor: active ? colors.accentPress : color,
        }}
      />
    </View>
  );
}

/**
 * Modern Paisa AI glyph:
 * Dual AI stars/sparkles indicating personal financial intelligence.
 */
export function AskGlyph({color, size = 22, active}: NavGlyphProps) {
  const starColor = active ? colors.accentPress : color;
  const majorSize = size * 0.8;
  const minorSize = size * 0.42;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* Primary 4-point AI sparkle */}
      <View
        style={{
          width: majorSize,
          height: majorSize,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            position: 'absolute',
            width: majorSize * 0.22,
            height: majorSize,
            borderRadius: radii.pill,
            backgroundColor: starColor,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: majorSize,
            height: majorSize * 0.22,
            borderRadius: radii.pill,
            backgroundColor: starColor,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: majorSize * 0.18,
            height: majorSize * 0.7,
            borderRadius: radii.pill,
            backgroundColor: starColor,
            transform: [{rotate: '45deg'}],
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: majorSize * 0.18,
            height: majorSize * 0.7,
            borderRadius: radii.pill,
            backgroundColor: starColor,
            transform: [{rotate: '-45deg'}],
          }}
        />
      </View>

      {/* Secondary accent sparkle on top right */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: minorSize,
          height: minorSize,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            position: 'absolute',
            width: minorSize * 0.26,
            height: minorSize,
            borderRadius: radii.pill,
            backgroundColor: active ? colors.accent : color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: minorSize,
            height: minorSize * 0.26,
            borderRadius: radii.pill,
            backgroundColor: active ? colors.accent : color,
          }}
        />
      </View>
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

export function SparkleGlyph({color, size = 18}: GlyphProps) {
  const arm = size * 0.12;
  const core = size * 0.32;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* Vertical arm */}
      <View
        style={{
          position: 'absolute',
          width: arm,
          height: size,
          borderRadius: radii.pill,
          backgroundColor: color,
        }}
      />
      {/* Horizontal arm */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: arm,
          borderRadius: radii.pill,
          backgroundColor: color,
        }}
      />
      {/* Diagonal arm 1 */}
      <View
        style={{
          position: 'absolute',
          width: arm,
          height: size * 0.7,
          borderRadius: radii.pill,
          backgroundColor: color,
          transform: [{rotate: '45deg'}],
        }}
      />
      {/* Diagonal arm 2 */}
      <View
        style={{
          position: 'absolute',
          width: arm,
          height: size * 0.7,
          borderRadius: radii.pill,
          backgroundColor: color,
          transform: [{rotate: '-45deg'}],
        }}
      />
      {/* Center dot */}
      <View
        style={{
          width: core,
          height: core,
          borderRadius: radii.pill,
          backgroundColor: color,
        }}
      />
    </View>
  );
}



export function CameraGlyph({color, size = 16}: GlyphProps) {
  const bodyW = size * 0.9;
  const bodyH = size * 0.65;
  const lensSize = size * 0.38;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* Top flash/viewfinder notch */}
      <View
        style={{
          width: size * 0.32,
          height: size * 0.16,
          backgroundColor: color,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          marginBottom: -1,
        }}
      />
      {/* Main body */}
      <View
        style={{
          width: bodyW,
          height: bodyH,
          borderWidth: 1.8,
          borderColor: color,
          borderRadius: 3.5,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {/* Center lens circle */}
        <View
          style={{
            width: lensSize,
            height: lensSize,
            borderRadius: radii.pill,
            borderWidth: 1.6,
            borderColor: color,
          }}
        />
      </View>
    </View>
  );
}

export function PencilGlyph({color, size = 16}: GlyphProps) {
  const body = size * 0.58;
  const nib = size * 0.22;
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
          alignItems: 'center',
          transform: [{rotate: '-42deg'}],
        }}>
        <View
          style={{
            width: size * 0.26,
            height: size * 0.16,
            borderRadius: 1,
            backgroundColor: color,
            marginBottom: 1,
          }}
        />
        <View
          style={{
            width: size * 0.26,
            height: body,
            borderRadius: 1.5,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: size * 0.13,
            borderRightWidth: size * 0.13,
            borderTopWidth: nib,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: color,
            marginTop: -1,
          }}
        />
      </View>
    </View>
  );
}

export function CheckGlyph({color, size = 14}: GlyphProps) {
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
          width: size * 0.35,
          height: size * 0.6,
          borderBottomWidth: 2,
          borderRightWidth: 2,
          borderColor: color,
          transform: [{rotate: '45deg'}],
          marginTop: -2,
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

