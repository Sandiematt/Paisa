import React, {useEffect, useRef, useState} from 'react';
import {Animated, LayoutChangeEvent, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {Plus} from 'phosphor-react-native';

import {
  FLOATING_NAV_GAP,
  FLOATING_NAV_ITEM_HEIGHT,
  FLOATING_NAV_PILL_HEIGHT,
  FLOATING_NAV_PILL_PAD_V,
  useFloatingNavClearance,
  useFloatingNavVisible,
} from './FloatingNavScroll';
import {AppText, GlassPanel, NavLottieIcon, PressableScale} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {
  colors,
  duration,
  easing,
  fonts,
  gradients,
  layout,
  linearGradient,
  radii,
  shadows,
  spacing,
  spring,
} from '../../theme';

export const TABS = ['home', 'activity', 'insights'] as const;
export type TabId = (typeof TABS)[number];

type NavBarProps = {
  activeTab: TabId;
  onTabPress: (tab: TabId) => void;
  onAddPress: () => void;
  addOpen?: boolean;
};

const TAB_ITEMS: {id: TabId; label: string}[] = [
  {id: 'home', label: 'Home'},
  {id: 'activity', label: 'Activity'},
  {id: 'insights', label: 'Insights'},
];

const ACTIVE_PILL_WIDTH = 70;
const ADD_SIZE = layout.addButton;
const FAB_IMAGE = linearGradient(gradients.fab, 140, [0, 0.55, 1]);

function NavSlot({
  label,
  active,
  showFill,
  onPress,
  accessibilityRole,
  accessibilityLabel,
  children,
}: {
  label: string;
  active: boolean;
  /** Paint the active fill here; off once the sliding indicator has measured. */
  showFill: boolean;
  onPress: () => void;
  accessibilityRole: 'tab' | 'button';
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const wasActive = useRef(active);

  // The glyph pops as its tab is picked; never on mount.
  useEffect(() => {
    const picked = active && !wasActive.current;
    wasActive.current = active;
    if (!picked || reducedMotion) {
      return;
    }
    pop.setValue(0);
    const anim = Animated.spring(pop, {toValue: 1, ...spring.pop, useNativeDriver: true});
    anim.start();
    return () => anim.stop();
  }, [active, pop, reducedMotion]);

  const glyphMotion = {
    transform: [
      {translateY: pop.interpolate({inputRange: [0, 1], outputRange: [3, 0]})},
      {scale: pop.interpolate({inputRange: [0, 1], outputRange: [0.78, 1]})},
    ],
  };

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'tab' ? {selected: active} : undefined}
      accessibilityLabel={accessibilityLabel}
      containerStyle={styles.slot}
      style={[styles.item, active && showFill && styles.itemActive]}>
      <Animated.View style={glyphMotion}>{children}</Animated.View>
      <AppText
        variant="caption"
        color={active ? colors.text : colors.muted}
        numberOfLines={1}
        style={active ? styles.labelActive : styles.label}>
        {label}
      </AppText>
    </PressableScale>
  );
}

export function NavBar({
  activeTab,
  onTabPress,
  onAddPress,
  addOpen = false,
}: NavBarProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const navVisible = useFloatingNavVisible();
  const hideDistance = useFloatingNavClearance() + spacing.lg;
  const hidden = useRef(new Animated.Value(0)).current;
  const plusTwist = useRef(new Animated.Value(0)).current;
  const [pillWidth, setPillWidth] = useState(0);
  const slotWidth = (pillWidth - FLOATING_NAV_PILL_PAD_V * 2) / TAB_ITEMS.length;
  const activeIndex = Math.max(0, TABS.indexOf(activeTab));
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorPlaced = useRef(false);

  // The active fill glides between tabs instead of jumping. It snaps on the
  // first measure so the bar never animates in from the wrong slot.
  useEffect(() => {
    if (pillWidth === 0) {
      return;
    }
    const toValue = activeIndex * slotWidth;
    if (!indicatorPlaced.current || reducedMotion) {
      indicatorPlaced.current = true;
      indicatorX.setValue(toValue);
      return;
    }
    Animated.spring(indicatorX, {toValue, ...spring.select, useNativeDriver: true}).start();
  }, [activeIndex, indicatorX, pillWidth, reducedMotion, slotWidth]);

  const onPillLayout = (event: LayoutChangeEvent) => {
    setPillWidth(Math.round(event.nativeEvent.layout.width));
  };

  useEffect(() => {
    Animated.timing(hidden, {
      toValue: navVisible ? 0 : 1,
      duration: reducedMotion ? 0 : duration.swap,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [hidden, navVisible, reducedMotion]);

  useEffect(() => {
    Animated.timing(plusTwist, {
      toValue: addOpen ? 1 : 0,
      duration: reducedMotion ? 0 : duration.control,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [addOpen, plusTwist, reducedMotion]);

  const dockMotion = {
    opacity: hidden.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
    transform: [
      {
        translateY: hidden.interpolate({
          inputRange: [0, 1],
          outputRange: [0, reducedMotion ? 0 : hideDistance],
        }),
      },
    ],
  };

  const spin = plusTwist.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <Animated.View
      pointerEvents={navVisible ? 'box-none' : 'none'}
      style={[
        styles.dock,
        {paddingBottom: Math.max(insets.bottom, spacing.sm) + FLOATING_NAV_GAP},
        addOpen ? styles.dockRaised : null,
        dockMotion,
      ]}>
      <View style={styles.row} pointerEvents="box-none">
        <GlassPanel
          intensity="2xl"
          overlayColor={colors.glass}
          radius={radii.pill}
          style={[styles.pillWrap, shadows.nav]}
          contentStyle={styles.pill}>
          <View
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            onLayout={onPillLayout}
          />
          {pillWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.indicator,
                {
                  left: FLOATING_NAV_PILL_PAD_V + (slotWidth - ACTIVE_PILL_WIDTH) / 2,
                  transform: [{translateX: indicatorX}],
                },
              ]}
            />
          ) : null}
          {TAB_ITEMS.map(item => {
            const active = activeTab === item.id;
            return (
              <NavSlot
                key={item.id}
                label={item.label}
                active={active}
                showFill={pillWidth === 0}
                onPress={() => onTabPress(item.id)}
                accessibilityRole="tab"
                accessibilityLabel={item.label}>
                <NavLottieIcon id={item.id} active={active} size={layout.navIcon} />
              </NavSlot>
            );
          })}
        </GlassPanel>

        <PressableScale
          onPress={onAddPress}
          scaleTo={0.9}
          accessibilityRole="button"
          accessibilityLabel="Add transaction"
          accessibilityHint="Adds an expense or income"
          containerStyle={styles.addHit}
          style={[styles.addFace, shadows.add]}>
          <Animated.View
            pointerEvents="none"
            style={{transform: [{rotate: spin}]}}>
            <Plus color={colors.text} size={24} weight="bold" />
          </Animated.View>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },

  dockRaised: {
    zIndex: 21,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },

  pillWrap: {
    flex: 1,
    borderRadius: radii.pill,
  },

  pill: {
    height: FLOATING_NAV_PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: FLOATING_NAV_PILL_PAD_V,
  },

  slot: {
    flex: 1,
    height: FLOATING_NAV_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  item: {
    width: ACTIVE_PILL_WIDTH,
    height: FLOATING_NAV_ITEM_HEIGHT,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },

  // Opaque so the glass blur behind the bar cannot show through unevenly.
  itemActive: {
    backgroundColor: colors.surfaceRaised,
  },

  indicator: {
    position: 'absolute',
    top: FLOATING_NAV_PILL_PAD_V,
    width: ACTIVE_PILL_WIDTH,
    height: FLOATING_NAV_ITEM_HEIGHT,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
  },

  label: {
    fontSize: 11,
    lineHeight: 15,
  },

  labelActive: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fonts.jakartaBold,
  },

  addHit: {
    width: ADD_SIZE,
    height: ADD_SIZE,
  },

  addFace: {
    width: ADD_SIZE,
    height: ADD_SIZE,
    borderRadius: ADD_SIZE / 2,
    backgroundImage: FAB_IMAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
