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

export function ChevronRightIcon({color, size = 16}: IconProps) {
  const s = Math.max(1.4, size * 0.12);
  return (
    <View style={{width: size, height: size}}>
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.32} top={size * 0.28} rotate="45deg" />
      <Stroke color={color} width={size * 0.42} height={s} left={size * 0.32} top={size * 0.62} rotate="-45deg" />
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
