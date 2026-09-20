import React from 'react';
import {Image, View} from 'react-native';

type IconProps = {
  color: string;
  size?: number;
};

function Stroke({
  color,
  width,
  height,
  rotate,
  left,
  top,
}: {
  color: string;
  width: number;
  height: number;
  rotate?: string;
  left?: number;
  top?: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        width,
        height,
        borderRadius: height / 2,
        backgroundColor: color,
        left,
        top,
        transform: rotate ? [{rotate}] : undefined,
      }}
    />
  );
}

export function ArrowUpRightIcon({color, size = 15}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={size * 0.62} height={s} left={size * 0.22} top={size * 0.28} rotate="-45deg" />
      <Stroke color={color} width={s} height={size * 0.42} left={size * 0.58} top={size * 0.18} />
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.38} top={size * 0.18} />
    </View>
  );
}

export function ArrowDownRightIcon({color, size = 15}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={size * 0.62} height={s} left={size * 0.22} top={size * 0.58} rotate="45deg" />
      <Stroke color={color} width={s} height={size * 0.42} left={size * 0.58} top={size * 0.4} />
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.38} top={size * 0.72} />
    </View>
  );
}

export function ArrowDownLeftIcon({color, size = 15}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={size * 0.62} height={s} left={size * 0.16} top={size * 0.58} rotate="-45deg" />
      <Stroke color={color} width={s} height={size * 0.42} left={size * 0.18} top={size * 0.4} />
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.18} top={size * 0.72} />
    </View>
  );
}

export function TrendingUpIcon({color, size = 15}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={size * 0.38} height={s} left={size * 0.08} top={size * 0.62} rotate="-28deg" />
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.38} top={size * 0.38} rotate="-38deg" />
      <Stroke color={color} width={s} height={size * 0.28} left={size * 0.68} top={size * 0.16} />
      <Stroke color={color} width={size * 0.28} height={s} left={size * 0.56} top={size * 0.16} />
    </View>
  );
}

/** Mirror of TrendingUpIcon — a line descending to a bottom-right arrowhead. */
export function TrendingDownIcon({color, size = 15}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={size * 0.38} height={s} left={size * 0.08} top={size * 0.28} rotate="28deg" />
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.38} top={size * 0.52} rotate="38deg" />
      <Stroke color={color} width={s} height={size * 0.28} left={size * 0.68} top={size * 0.56} />
      <Stroke color={color} width={size * 0.28} height={s} left={size * 0.56} top={size * 0.68} />
    </View>
  );
}

export function ChevronRightIcon({color, size = 16}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.32} top={size * 0.28} rotate="45deg" />
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.32} top={size * 0.62} rotate="-45deg" />
    </View>
  );
}

export function ChevronDownIcon({color, size = 16}: IconProps) {
  return (
    <View style={{width: size, height: size, transform: [{rotate: '90deg'}]}}>
      <ChevronRightIcon color={color} size={size} />
    </View>
  );
}

export function GearIcon({color, size = 20}: IconProps) {
  const stroke = Math.max(1.7, size * 0.09);
  const toothW = Math.max(3.2, size * 0.18);
  const toothH = size * 0.22;
  const ring = size * 0.58;
  const hole = size * 0.26;
  const teeth = [0, 60, 120, 180, 240, 300];
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      {teeth.map(deg => (
        <View
          key={deg}
          style={{
            position: 'absolute',
            width: size,
            height: size,
            transform: [{rotate: `${deg}deg`}],
          }}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: (size - toothW) / 2,
              width: toothW,
              height: toothH,
              borderRadius: toothW / 2,
              backgroundColor: color,
            }}
          />
        </View>
      ))}
      <View
        style={{
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: stroke,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
        }}>
        <View
          style={{
            width: hole,
            height: hole,
            borderRadius: hole / 2,
            borderWidth: stroke,
            borderColor: color,
          }}
        />
      </View>
    </View>
  );
}

export function PaperclipIcon({color, size = 20}: IconProps) {
  const stroke = Math.max(1.7, size * 0.1);
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{rotate: '-45deg'}],
      }}>
      <View
        style={{
          width: size * 0.42,
          height: size * 0.78,
          borderWidth: stroke,
          borderColor: color,
          borderRadius: size,
        }}
      />
    </View>
  );
}

export function SendPlaneIcon({color, size = 16}: IconProps) {
  const s = Math.max(1.5, size * 0.14);
  return (
    <View style={{width: size, height: size, transform: [{rotate: '45deg'}]}}>
      <Stroke color={color} width={size * 0.78} height={s} left={size * 0.08} top={size * 0.46} />
      <Stroke color={color} width={s} height={size * 0.42} left={size * 0.72} top={size * 0.18} />
      <Stroke color={color} width={size * 0.38} height={s} left={size * 0.42} top={size * 0.18} />
    </View>
  );
}

export function BarChartIcon({color, size = 16}: IconProps) {
  return (
    <View style={{width: size, height: size, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between'}}>
      <View style={{width: size * 0.22, height: size * 0.52, borderRadius: 2, backgroundColor: color}} />
      <View style={{width: size * 0.22, height: size * 0.78, borderRadius: 2, backgroundColor: color}} />
      <View style={{width: size * 0.22, height: size * 0.38, borderRadius: 2, backgroundColor: color}} />
    </View>
  );
}

export function ArrowDownLongIcon({color, size = 12}: IconProps) {
  const s = Math.max(1.5, size * 0.16);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={s} height={size * 0.72} left={size * 0.44} top={size * 0.08} />
      <Stroke color={color} width={size * 0.38} height={s} left={size * 0.18} top={size * 0.58} rotate="45deg" />
      <Stroke color={color} width={size * 0.38} height={s} left={size * 0.44} top={size * 0.58} rotate="-45deg" />
    </View>
  );
}

export function CreditCardIcon({color, size = 14}: IconProps) {
  const stroke = Math.max(1.5, size * 0.12);
  return (
    <View style={{width: size, height: size, justifyContent: 'center'}}>
      <View
        style={{
          width: size,
          height: size * 0.72,
          borderWidth: stroke,
          borderColor: color,
          borderRadius: 2.5,
        }}>
        <View
          style={{
            position: 'absolute',
            top: size * 0.2,
            left: 0,
            right: 0,
            height: stroke,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

export function ChevronLeftIcon({color, size = 20}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.28} top={size * 0.28} rotate="-45deg" />
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.28} top={size * 0.62} rotate="45deg" />
    </View>
  );
}

export function DollarSignIcon({color, size = 16}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={s} height={size * 0.92} left={(size - s) / 2} top={size * 0.04} />
      <View
        style={{
          position: 'absolute',
          left: size * 0.22,
          top: size * 0.16,
          width: size * 0.56,
          height: size * 0.32,
          borderWidth: s,
          borderColor: color,
          borderBottomColor: 'transparent',
          borderRadius: size,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.22,
          top: size * 0.46,
          width: size * 0.56,
          height: size * 0.32,
          borderWidth: s,
          borderColor: color,
          borderTopColor: 'transparent',
          borderRadius: size,
        }}
      />
    </View>
  );
}

export function TargetIcon({color, size = 16}: IconProps) {
  const s = Math.max(1.3, size * 0.11);
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: s,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: size * 0.58,
            height: size * 0.58,
            borderRadius: size,
            borderWidth: s,
            borderColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View
            style={{
              width: size * 0.18,
              height: size * 0.18,
              borderRadius: size,
              backgroundColor: color,
            }}
          />
        </View>
      </View>
    </View>
  );
}

export function DownloadIcon({color, size = 16}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={s} height={size * 0.5} left={(size - s) / 2} top={size * 0.08} />
      <Stroke color={color} width={size * 0.38} height={s} left={size * 0.22} top={size * 0.42} rotate="45deg" />
      <Stroke color={color} width={size * 0.38} height={s} left={size * 0.4} top={size * 0.42} rotate="-45deg" />
      <Stroke color={color} width={size * 0.72} height={s} left={size * 0.14} top={size * 0.82} />
    </View>
  );
}

export function LockIcon({color, size = 16}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  const body = size * 0.62;
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'flex-end'}}>
      <View
        style={{
          width: size * 0.48,
          height: size * 0.38,
          borderWidth: s,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: size,
          borderTopRightRadius: size,
          marginBottom: -1,
        }}
      />
      <View
        style={{
          width: body,
          height: size * 0.48,
          borderWidth: s,
          borderColor: color,
          borderRadius: 2.5,
        }}
      />
    </View>
  );
}

export function LogOutIcon({color, size = 16}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <View
        style={{
          position: 'absolute',
          left: size * 0.08,
          top: size * 0.12,
          width: size * 0.46,
          height: size * 0.76,
          borderWidth: s,
          borderRightWidth: 0,
          borderColor: color,
          borderRadius: 2.5,
        }}
      />
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.38} top={(size - s) / 2} />
      <Stroke color={color} width={size * 0.28} height={s} left={size * 0.52} top={size * 0.32} rotate="45deg" />
      <Stroke color={color} width={size * 0.28} height={s} left={size * 0.52} top={size * 0.58} rotate="-45deg" />
    </View>
  );
}

export function BoltIcon({color, size = 16}: IconProps) {
  const s = Math.max(1.5, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.28} top={size * 0.18} rotate="-52deg" />
      <Stroke color={color} width={size * 0.46} height={s} left={size * 0.22} top={size * 0.46} />
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.3} top={size * 0.68} rotate="-52deg" />
    </View>
  );
}

export function MailIcon({color, size = 18}: IconProps) {
  return (
    <Image
      source={require('../../../assets/auth/icon-mail.png')}
      style={{width: size, height: size, tintColor: color}}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

export function EyeIcon({color, size = 18}: IconProps) {
  const s = Math.max(1.3, size * 0.11);
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <View
        style={{
          width: size,
          height: size * 0.52,
          borderWidth: s,
          borderColor: color,
          borderRadius: size,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.3,
          height: size * 0.3,
          borderRadius: size,
          borderWidth: s,
          borderColor: color,
        }}
      />
    </View>
  );
}

export function EyeOffIcon({color, size = 18}: IconProps) {
  const s = Math.max(1.3, size * 0.11);
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <EyeIcon color={color} size={size} />
      <Stroke
        color={color}
        width={size * 0.92}
        height={s}
        left={size * 0.04}
        top={size * 0.48}
        rotate="-28deg"
      />
    </View>
  );
}
