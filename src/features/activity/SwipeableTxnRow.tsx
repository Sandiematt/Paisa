import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, LayoutChangeEvent, PanResponder, StyleSheet, View} from 'react-native';

import {
  PencilGlyph,
  RefreshGlyph,
  TrashGlyph,
} from '../../components/icons/Glyphs';
import {PressableScale, Text} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {formatMoney} from '../../lib/formatMoney';
import {colors, duration, easing, fonts} from '../../theme';
import {CategoryDisc} from '../add/categoryIcons';
import {ActivityTransaction} from './types';

const ACTION_W = 62;
const CLUSTER = ACTION_W * 2;
const REST = -CLUSTER;
const SHOW_LEFT = 0;
const SHOW_RIGHT = -CLUSTER * 2;
const THRESHOLD = ACTION_W * 0.55;
const tabular = {fontVariant: ['tabular-nums'] as const};

type SwipeableTxnRowProps = {
  item: ActivityTransaction;
  currencySymbol: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRecurring: () => void;
  onDuplicate: () => void;
};

export function SwipeableTxnRow({
  item,
  currencySymbol,
  open,
  onOpen,
  onClose,
  onEdit,
  onDelete,
  onToggleRecurring,
  onDuplicate,
}: SwipeableTxnRowProps) {
  const reducedMotion = useReducedMotion();
  const x = useRef(new Animated.Value(REST)).current;
  const startX = useRef(REST);
  const [width, setWidth] = useState(0);
  const income = item.kind === 'income';

  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  const snapTo = useMemo(
    () => (toValue: number) => {
      if (reducedMotion) {
        x.setValue(toValue);
        return;
      }
      Animated.timing(x, {
        toValue,
        duration: duration.control,
        easing: easing.out,
        useNativeDriver: true,
      }).start();
    },
    [reducedMotion, x],
  );

  useEffect(() => {
    if (!open) {
      snapTo(REST);
    }
  }, [open, snapTo]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.15,
        onPanResponderGrant: () => {
          x.stopAnimation(value => {
            startX.current = value;
          });
          onOpenRef.current();
        },
        onPanResponderMove: (_, g) => {
          const next = startX.current + g.dx;
          x.setValue(Math.max(SHOW_RIGHT - 16, Math.min(SHOW_LEFT + 16, next)));
        },
        onPanResponderRelease: (_, g) => {
          const projected = startX.current + g.dx + g.vx * 80;
          let target = REST;
          if (projected > REST + THRESHOLD || (g.vx > 0.45 && g.dx > 12)) {
            target = SHOW_LEFT;
          } else if (projected < REST - THRESHOLD || (g.vx < -0.45 && g.dx < -12)) {
            target = SHOW_RIGHT;
          }
          if (target === REST) {
            onCloseRef.current();
          }
          snapTo(target);
        },
        onPanResponderTerminate: () => {
          const current = startX.current;
          const target =
            current > REST + THRESHOLD
              ? SHOW_LEFT
              : current < REST - THRESHOLD
                ? SHOW_RIGHT
                : REST;
          if (target === REST) {
            onCloseRef.current();
          }
          snapTo(target);
        },
      }),
    [snapTo, x],
  );

  const fire = (action: () => void) => {
    snapTo(REST);
    onClose();
    action();
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) {
      setWidth(next);
    }
  };

  const rowBody = (
    <>
      <CategoryDisc id={item.categorySlug ?? 'other'} color={item.categoryColor} />
      <View style={styles.detail}>
        <View style={styles.nameRow}>
          <Text
            fontFamily={fonts.outfitSemi}
            fontSize={15}
            lineHeight={20}
            fontWeight="600"
            color={colors.ink}
            numberOfLines={1}
            style={styles.name}>
            {item.merchant}
          </Text>
          {item.recurring ? (
            <View style={styles.repeats}>
              <RefreshGlyph color={colors.gold} size={9} />
              <Text
                fontFamily={fonts.interSemi}
                fontSize={9}
                lineHeight={12}
                fontWeight="600"
                letterSpacing={0.3}
                color={colors.gold}>
                REPEATS
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          fontFamily={fonts.interMedium}
          fontSize={12}
          lineHeight={16}
          fontWeight="500"
          color={colors.inkMuted}
          numberOfLines={1}>
          {item.category} · {item.account}
        </Text>
      </View>
      <Text
        fontFamily={fonts.outfitSemi}
        fontSize={15}
        lineHeight={20}
        fontWeight="600"
        color={income ? colors.positive : colors.ink}
        numberOfLines={1}
        style={[tabular, styles.amount]}>
        {formatMoney(item.amount, currencySymbol, {signed: true})}
      </Text>
    </>
  );

  if (width <= 0) {
    return (
      <View style={styles.clip} onLayout={onLayout}>
        <View style={styles.row}>{rowBody}</View>
      </View>
    );
  }

  return (
    <View style={styles.clip} onLayout={onLayout}>
      <Animated.View
        style={[
          styles.strip,
          {width: width + CLUSTER * 2, transform: [{translateX: x}]},
        ]}
        {...pan.panHandlers}
        accessibilityRole="text"
        accessibilityLabel={`${item.merchant}, ${item.category}, ${formatMoney(
          item.amount,
          currencySymbol,
          {signed: true},
        )}. Swipe for actions.`}>
        <View style={styles.cluster}>
          <PressableScale
            scaleTo={0.96}
            onPress={() => fire(onToggleRecurring)}
            accessibilityRole="button"
            accessibilityLabel={
              item.recurring ? 'Remove recurring' : 'Mark recurring'
            }
            containerStyle={styles.actionHit}
            style={[styles.actionFace, styles.repeatFace]}>
            <RefreshGlyph color={colors.gold} size={17} />
            <Text
              fontFamily={fonts.interSemi}
              fontSize={11}
              lineHeight={14}
              fontWeight="600"
              color={colors.gold}>
              {item.recurring ? 'Unmark' : 'Repeat'}
            </Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.96}
            onPress={() => fire(onDuplicate)}
            accessibilityRole="button"
            accessibilityLabel="Duplicate transaction"
            containerStyle={styles.actionHit}
            style={[styles.actionFace, styles.dupFace]}>
            <Text
              fontFamily={fonts.outfitSemi}
              fontSize={15}
              lineHeight={17}
              fontWeight="600"
              color={colors.positive}>
              +
            </Text>
            <Text
              fontFamily={fonts.interSemi}
              fontSize={11}
              lineHeight={14}
              fontWeight="600"
              color={colors.positive}>
              Copy
            </Text>
          </PressableScale>
        </View>

        <View style={[styles.row, {width}]}>{rowBody}</View>

        <View style={styles.cluster}>
          <PressableScale
            scaleTo={0.96}
            onPress={() => fire(onEdit)}
            accessibilityRole="button"
            accessibilityLabel="Edit transaction"
            containerStyle={styles.actionHit}
            style={[styles.actionFace, styles.editFace]}>
            <PencilGlyph color={colors.gold} size={17} />
            <Text
              fontFamily={fonts.interSemi}
              fontSize={11}
              lineHeight={14}
              fontWeight="600"
              color={colors.gold}>
              Edit
            </Text>
          </PressableScale>
          <PressableScale
            scaleTo={0.96}
            onPress={() => fire(onDelete)}
            accessibilityRole="button"
            accessibilityLabel="Delete transaction"
            containerStyle={styles.actionHit}
            style={[styles.actionFace, styles.deleteFace]}>
            <TrashGlyph color={colors.onInk} size={17} />
            <Text
              fontFamily={fonts.interSemi}
              fontSize={11}
              lineHeight={14}
              fontWeight="600"
              color={colors.onInk}>
              Delete
            </Text>
          </PressableScale>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  strip: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cluster: {
    flexDirection: 'row',
    width: CLUSTER,
  },
  actionHit: {
    width: ACTION_W,
    height: '100%',
  },
  actionFace: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  repeatFace: {
    backgroundColor: '#C88A2E26',
  },
  dupFace: {
    backgroundColor: '#3F7A4E26',
  },
  editFace: {
    backgroundColor: '#C88A2E26',
  },
  deleteFace: {
    backgroundColor: colors.coral,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingRight: 4,
    backgroundColor: 'transparent',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  detail: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flexShrink: 1,
    minWidth: 0,
  },
  amount: {
    flexShrink: 0,
  },
  repeats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
