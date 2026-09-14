import React from 'react';
import {View} from 'react-native';

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
