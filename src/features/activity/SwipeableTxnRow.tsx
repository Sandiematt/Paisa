import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  Text as NativeText,
  View,
} from 'react-native';
import {ArrowsClockwise} from 'phosphor-react-native/src/icons/ArrowsClockwise';
import {Copy} from 'phosphor-react-native/src/icons/Copy';
import {NotePencil} from 'phosphor-react-native/src/icons/NotePencil';
import {PencilSimple} from 'phosphor-react-native/src/icons/PencilSimple';
import {Trash} from 'phosphor-react-native/src/icons/Trash';

import {PressableScale, Text} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {formatMoney} from '../../lib/formatMoney';
import {localDateISO} from '../../lib/transactionsStore';
import {
  colors,
  duration,
  easing,
  fonts,
  makeStyles,
  typography,
  withAlpha,
} from '../../theme';
import {CategoryIconSquare} from '../add/categoryIcons';
import {highlightParts} from './mapActivity';
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
  /** Hairline above the row; leave off for the first row in a card. */
  divider?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRecurring: () => void;
  onDuplicate: () => void;
  /** Search words to highlight in the name and note. */
  highlight?: string[];
};

const NO_HIGHLIGHT: string[] = [];

/** Text with the search words picked out, so a result shows why it matched. */
function Highlighted({text, tokens}: {text: string; tokens: string[]}) {
  const styles = useStyles();
  return (
    <>
      {highlightParts(text, tokens).map((part, index) =>
        part.match ? (
          <NativeText key={index} style={styles.match}>
            {part.text}
          </NativeText>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/**
 * "9:41 AM" when the entry was logged on the day it belongs to, otherwise
 * the payment method. (Transactions only store a calendar date, so a time is
 * shown only when the creation time is a faithful stand-in.)
 */
function detailTail(item: ActivityTransaction): string {
  const created = item.source?.createdAt;
  if (created) {
    const at = new Date(created);
    if (!Number.isNaN(at.getTime()) && localDateISO(at) === item.date) {
      return at.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }
  return item.account;
}

export function SwipeableTxnRow({
  item,
  currencySymbol,
  open,
  divider = true,
  onOpen,
  onClose,
  onEdit,
  onDelete,
  onToggleRecurring,
  onDuplicate,
  highlight = NO_HIGHLIGHT,
}: SwipeableTxnRowProps) {
  const styles = useStyles();
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

  const amountLabel = formatMoney(item.amount, currencySymbol, {signed: true});
  const note = item.note?.trim() ?? '';

  const rowBody = (
    <>
      <CategoryIconSquare id={item.categorySlug ?? 'other'} size={40} />
      <View style={styles.detail}>
        <View style={styles.nameRow}>
          <Text
            fontFamily={fonts.jakartaSemiBold}
            fontSize={15}
            lineHeight={20}
            color={colors.text}
            numberOfLines={1}
            style={styles.name}>
            {highlight.length > 0 ? (
              <Highlighted text={item.merchant} tokens={highlight} />
            ) : (
              item.merchant
            )}
          </Text>
          {item.recurring ? (
            <View style={styles.repeats}>
              <ArrowsClockwise size={10} color={colors.lavender} weight="bold" />
              <Text
                fontFamily={fonts.jakartaBold}
                fontSize={9}
                lineHeight={12}
                letterSpacing={0.3}
                color={colors.lavender}>
                REPEATS
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          fontFamily={fonts.jakartaRegular}
          fontSize={12}
          lineHeight={17}
          color={colors.muted}
          numberOfLines={1}>
          {item.category} · {detailTail(item)}
        </Text>
        {note ? (
          <View style={styles.noteRow} testID="txn-note">
            <NotePencil size={12} color={colors.muted} />
            <Text
              fontFamily={fonts.jakartaRegular}
              fontSize={12}
              lineHeight={17}
              color={colors.inkSecondary}
              numberOfLines={highlight.length > 0 ? 2 : 1}
              style={styles.noteText}>
              {highlight.length > 0 ? (
                <Highlighted text={note} tokens={highlight} />
              ) : (
                note
              )}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        fontFamily={fonts.jakartaBold}
        fontSize={15}
        lineHeight={20}
        color={income ? colors.mint : colors.roseLight}
        numberOfLines={1}
        style={[tabular, styles.amount]}>
        {amountLabel}
      </Text>
    </>
  );

  const rowStyle = [styles.row, divider ? styles.rowDivider : null];

  if (width <= 0) {
    return (
      <View style={styles.clip} onLayout={onLayout}>
        <View style={rowStyle}>{rowBody}</View>
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
        accessibilityLabel={`${item.merchant}, ${item.category}, ${amountLabel}${
          item.recurring ? ', recurring' : ''
        }${note ? `, note: ${note}` : ''}. Swipe for actions.`}>
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
            <ArrowsClockwise size={18} color={colors.sky} weight="bold" />
            <Text
              fontFamily={fonts.jakartaBold}
              fontSize={11}
              lineHeight={14}
              color={colors.sky}>
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
            <Copy size={18} color={colors.mint} weight="bold" />
            <Text
              fontFamily={fonts.jakartaBold}
              fontSize={11}
              lineHeight={14}
              color={colors.mint}>
              Copy
            </Text>
          </PressableScale>
        </View>

        <View style={[rowStyle, {width}]}>{rowBody}</View>

        <View style={styles.cluster}>
          <PressableScale
            scaleTo={0.96}
            onPress={() => fire(onEdit)}
            accessibilityRole="button"
            accessibilityLabel="Edit transaction"
            containerStyle={styles.actionHit}
            style={[styles.actionFace, styles.editFace]}>
            <PencilSimple size={18} color={colors.onAccent} weight="bold" />
            <Text
              fontFamily={fonts.jakartaBold}
              fontSize={11}
              lineHeight={14}
              color={colors.onAccent}>
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
            <Trash size={18} color={colors.onAccent} weight="bold" />
            <Text
              fontFamily={fonts.jakartaBold}
              fontSize={11}
              lineHeight={14}
              color={colors.onAccent}>
              Delete
            </Text>
          </PressableScale>
        </View>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
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
    backgroundColor: withAlpha(colors.sky, 0.16),
  },
  dupFace: {
    backgroundColor: withAlpha(colors.mint, 0.16),
  },
  editFace: {
    backgroundColor: colors.violet,
  },
  deleteFace: {
    backgroundColor: colors.rose,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
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
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  match: {
    color: colors.lavender,
    fontFamily: fonts.jakartaBold,
  },
  noteText: {
    flexShrink: 1,
  },
  amount: {
    flexShrink: 0,
    letterSpacing: typography.numeric.letterSpacing,
  },
  repeats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: withAlpha(colors.violet, 0.2),
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
}));
