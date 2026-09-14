import React, {useEffect, useRef} from 'react';
import {
  Animated,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import {
  ArrowDownLeftGlyph,
  ArrowUpRightGlyph,
} from '../../components/icons/Glyphs';
import {AppText, GlassPanel, PressableScale} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {
  useFloatingNavDockHeight,
} from '../NavBar/FloatingNavScroll';
import {colors, duration, easing, fonts, radii} from '../../theme';
import {AddKind} from './types';

type AddActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: AddKind) => void;
};

const CARD_WIDTH = 250;
const CARET = 14;
const CARET_GAP = 14;
const ROW_HEIGHT = 54;

const OPTIONS: {
  kind: AddKind;
  title: string;
  description: string;
  accent: string;
  accentSoft: string;
  accentRing: string;
}[] = [
  {
    kind: 'income',
    title: 'Add Income',
    description: 'Record money coming in',
    accent: colors.positive,
    accentSoft: colors.alertPositive,
    accentRing: '#3F7A4E33',
  },
  {
    kind: 'expense',
    title: 'Add Expense',
    description: 'Record money going out',
    accent: colors.coral,
    accentSoft: colors.alertDanger,
    accentRing: '#C0523A33',
  },
];

export function AddActionSheet({
  visible,
  onClose,
  onSelect,
}: AddActionSheetProps) {
  const dockHeight = useFloatingNavDockHeight();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : duration.enter,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [progress, reducedMotion, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onClose, visible]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  return (
    <View
      style={styles.layer}
      pointerEvents={visible ? 'auto' : 'none'}
      collapsable={false}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss add menu"
      />

      <Animated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        style={[
          styles.cluster,
          {
            bottom: dockHeight + CARET_GAP,
            opacity: progress,
            transform: [{translateY}, {scale}],
          },
        ]}>
        <GlassPanel
          intensity="2xl"
          overlayColor="rgba(255, 255, 255, 0.88)"
          radius={26}
          style={styles.cardWrap}
          contentStyle={styles.card}>
          {OPTIONS.map((option, index) => (
            <React.Fragment key={option.kind}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <PressableScale
                onPress={() => onSelect(option.kind)}
                scaleTo={0.98}
                accessibilityRole="button"
                accessibilityLabel={option.title}
                style={styles.row}>
                <View
                  style={[
                    styles.mark,
                    {
                      backgroundColor: option.accentSoft,
                      borderColor: option.accentRing,
                    },
                  ]}>
                  {option.kind === 'income' ? (
                    <ArrowDownLeftGlyph color={option.accent} size={18} />
                  ) : (
                    <ArrowUpRightGlyph color={option.accent} size={18} />
                  )}
                </View>
                <View style={styles.copy}>
                  <AppText variant="heading" style={styles.title}>
                    {option.title}
                  </AppText>
                  <AppText variant="caption" color={colors.inkSoft}>
                    {option.description}
                  </AppText>
                </View>
              </PressableScale>
            </React.Fragment>
          ))}
        </GlassPanel>
        <View style={styles.caret} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
  },
  cluster: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    width: CARD_WIDTH,
  },
  cardWrap: {
    width: CARD_WIDTH,
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#78643C',
        shadowOpacity: 0.18,
        shadowRadius: 17,
        shadowOffset: {width: 0, height: 12},
      },
      default: {elevation: 10, shadowColor: '#78643C'},
    }),
  },
  card: {
    padding: 8,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 18,
    gap: 14,
  },
  mark: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.outfitSemi,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    marginVertical: 4,
  },
  caret: {
    width: CARET,
    height: CARET,
    marginTop: -CARET / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.87)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.07)',
    transform: [{rotate: '45deg'}],
  },
});
