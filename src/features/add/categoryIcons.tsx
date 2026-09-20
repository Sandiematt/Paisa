import React from 'react';
import {StyleSheet, View} from 'react-native';

import {
  HomeGlyph,
  ReceiptGlyph,
  RefreshGlyph,
} from '../../components/icons/Glyphs';
import {colors, radii} from '../../theme';

type IconProps = {
  color: string;
  size?: number;
};

function Dot({color, size = 4}: {color: string; size?: number}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.pill,
        backgroundColor: color,
      }}
    />
  );
}

function DiningIcon({color, size = 18}: IconProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
      }}>
      <View
        style={{
          width: 2,
          height: size * 0.82,
          borderRadius: radii.pill,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.34,
          height: size * 0.72,
          borderWidth: 1.7,
          borderColor: color,
          borderRadius: 8,
        }}
      />
    </View>
  );
}

function CartIcon({color, size = 18}: IconProps) {
  return (
    <View style={{width: size, height: size, justifyContent: 'flex-end'}}>
      <View
        style={{
          width: size * 0.78,
          height: size * 0.48,
          borderWidth: 1.7,
          borderColor: color,
          borderRadius: 3,
          alignSelf: 'center',
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 3,
          marginTop: 2,
        }}>
        <Dot color={color} />
        <Dot color={color} />
      </View>
    </View>
  );
}

function CarIcon({color, size = 18}: IconProps) {
  return (
    <View style={{width: size, height: size, justifyContent: 'center'}}>
      <View
        style={{
          width: size * 0.7,
          height: size * 0.28,
          backgroundColor: color,
          borderRadius: 3,
          alignSelf: 'center',
          marginBottom: 2,
        }}
      />
      <View
        style={{
          width: size * 0.9,
          height: size * 0.28,
          backgroundColor: color,
          borderRadius: 4,
          alignSelf: 'center',
        }}
      />
    </View>
  );
}

function HeartIcon({color, size = 18}: IconProps) {
  const bump = size * 0.34;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View style={{flexDirection: 'row', marginBottom: -bump * 0.35}}>
        <View
          style={{
            width: bump,
            height: bump,
            borderRadius: radii.pill,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            width: bump,
            height: bump,
            borderRadius: radii.pill,
            backgroundColor: color,
            marginLeft: -2,
          }}
        />
      </View>
      <View
        style={{
          width: size * 0.42,
          height: size * 0.42,
          backgroundColor: color,
          transform: [{rotate: '45deg'}],
          marginTop: -4,
        }}
      />
    </View>
  );
}

function BagIcon({color, size = 18}: IconProps) {
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
          width: size * 0.42,
          height: size * 0.28,
          borderWidth: 1.7,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      />
      <View
        style={{
          width: size * 0.72,
          height: size * 0.52,
          borderWidth: 1.7,
          borderColor: color,
          borderRadius: 4,
        }}
      />
    </View>
  );
}

function PadIcon({color, size = 18}: IconProps) {
  return (
    <View
      style={{
        width: size * 0.9,
        height: size * 0.58,
        borderWidth: 1.7,
        borderColor: color,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
      }}>
      <Dot color={color} size={5} />
      <Dot color={color} size={5} />
    </View>
  );
}

function DotsIcon({color, size = 18}: IconProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
      }}>
      <Dot color={color} size={4} />
      <Dot color={color} size={4} />
      <Dot color={color} size={4} />
    </View>
  );
}

function PersonIcon({color, size = 18}: IconProps) {
  return (
    <View style={{width: size, height: size, alignItems: 'center'}}>
      <View
        style={{
          width: size * 0.34,
          height: size * 0.34,
          borderRadius: radii.pill,
          backgroundColor: color,
          marginBottom: 2,
        }}
      />
      <View
        style={{
          width: size * 0.62,
          height: size * 0.36,
          borderTopLeftRadius: size,
          borderTopRightRadius: size,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function PlaneIcon({color, size = 18}: IconProps) {
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
          width: size * 0.72,
          height: 2.2,
          backgroundColor: color,
          borderRadius: radii.pill,
          transform: [{rotate: '-28deg'}],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.42,
          height: 2.2,
          backgroundColor: color,
          borderRadius: radii.pill,
          transform: [{rotate: '48deg'}],
        }}
      />
    </View>
  );
}

function CapIcon({color, size = 18}: IconProps) {
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
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.38,
          borderRightWidth: size * 0.38,
          borderBottomWidth: size * 0.22,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.62,
          height: size * 0.2,
          borderWidth: 1.6,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 6,
          borderBottomRightRadius: 6,
        }}
      />
    </View>
  );
}

function BriefcaseIcon({color, size = 18}: IconProps) {
  return (
    <View style={{width: size, height: size, alignItems: 'center'}}>
      <View
        style={{
          width: size * 0.32,
          height: size * 0.2,
          borderWidth: 1.6,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
        }}
      />
      <View
        style={{
          width: size * 0.82,
          height: size * 0.52,
          borderWidth: 1.7,
          borderColor: color,
          borderRadius: 4,
        }}
      />
    </View>
  );
}

const ICON_TINT: Record<string, {bg: string; fg: string}> = {
  housing: {bg: '#FDECEA', fg: colors.coral},
  dining: {bg: '#FBF0DA', fg: colors.accentPress},
  groceries: {bg: '#E8F5EE', fg: colors.positive},
  transport: {bg: '#E7F1FB', fg: '#3D7CC9'},
  bills: {bg: '#EEECE6', fg: colors.slate},
  health: {bg: '#FDECEA', fg: colors.coral},
  travel: {bg: '#E7F6F4', fg: colors.teal},
  shopping: {bg: '#F3EEFB', fg: colors.violet},
  subscriptions: {bg: '#FBF0DA', fg: colors.accentPress},
  education: {bg: '#EEE9FB', fg: colors.violet},
  entertainment: {bg: '#EEE9FB', fg: colors.violet},
  personal: {bg: '#E8F5EE', fg: colors.positive},
  other: {bg: '#EEECE6', fg: colors.slate},
  salary: {bg: '#E8F5EE', fg: colors.positive},
  freelance: {bg: '#E7F6F4', fg: colors.teal},
  refund: {bg: '#FBF0DA', fg: colors.accentPress},
};

function GlyphForId({id, color, size}: {id: string; color: string; size: number}) {
  switch (id) {
    case 'housing':
      return <HomeGlyph color={color} size={size} />;
    case 'dining':
      return <DiningIcon color={color} size={size} />;
    case 'groceries':
      return <CartIcon color={color} size={size} />;
    case 'transport':
      return <CarIcon color={color} size={size} />;
    case 'travel':
      return <PlaneIcon color={color} size={size} />;
    case 'health':
      return <HeartIcon color={color} size={size} />;
    case 'shopping':
      return <BagIcon color={color} size={size} />;
    case 'entertainment':
      return <PadIcon color={color} size={size} />;
    case 'personal':
      return <PersonIcon color={color} size={size} />;
    case 'bills':
      return <ReceiptGlyph color={color} size={size} />;
    case 'subscriptions':
      return <RefreshGlyph color={color} size={size} />;
    case 'education':
      return <CapIcon color={color} size={size} />;
    case 'salary':
      return <BriefcaseIcon color={color} size={size} />;
    case 'freelance':
      return <PadIcon color={color} size={size} />;
    case 'refund':
      return <RefreshGlyph color={color} size={size} />;
    default:
      return <DotsIcon color={color} size={size} />;
  }
}

export function categoryTint(id: string): {bg: string; fg: string} {
  return ICON_TINT[id] ?? ICON_TINT.other;
}

export function CategoryMark({
  id,
  color,
  size = 16,
}: {
  id: string;
  color?: string;
  size?: number;
}) {
  const tint = categoryTint(id);
  return <GlyphForId id={id} color={color ?? tint.fg} size={size} />;
}

export function CategoryIcon({id, size = 20}: {id: string; size?: number}) {
  const tint = ICON_TINT[id] ?? ICON_TINT.other;
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: radii.pill,
        backgroundColor: tint.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <GlyphForId id={id} color={tint.fg} size={size} />
    </View>
  );
}

/** Wonder Activity row disc: 36px, tinted fill + hairline. */
export function CategoryDisc({
  id,
  color,
  size = 36,
  iconSize = 16,
}: {
  id: string;
  color?: string;
  size?: number;
  iconSize?: number;
}) {
  const tint = ICON_TINT[id] ?? ICON_TINT.other;
  const fg = color ?? tint.fg;
  const withAlpha = (hex: string, alpha: string) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      return tint.bg;
    }
    return `${hex}${alpha}`;
  };
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color ? withAlpha(fg, '1A') : tint.bg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color ? withAlpha(fg, '33') : `${tint.fg}33`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <GlyphForId id={id} color={fg} size={iconSize} />
    </View>
  );
}
