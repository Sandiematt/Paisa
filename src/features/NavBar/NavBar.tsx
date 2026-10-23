import React, {useEffect, useRef} from 'react';
import {Animated, Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {ChartBar, House, Plus, Receipt, User} from 'phosphor-react-native';

import {
  FLOATING_NAV_GAP,
  FLOATING_NAV_ITEM_HEIGHT,
  FLOATING_NAV_PILL_HEIGHT,
  FLOATING_NAV_PILL_PAD_V,
  useFloatingNavClearance,
  useFloatingNavVisible,
} from './FloatingNavScroll';
import {AppText, GlassPanel, PressableScale} from '../../components/ui';
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
} from '../../theme';

export const TABS = ['home', 'activity', 'insights'] as const;
export type TabId = (typeof TABS)[number];

type NavBarProps = {
  activeTab: TabId;
  onTabPress: (tab: TabId) => void;
  onAddPress: () => void;
  onProfilePress: () => void;
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

function TabGlyph({
  id,
  color,
  active,
}: {
  id: TabId;
  color: string;
  active: boolean;
}) {
  const size = layout.navIcon;
  const weight = active ? 'fill' : 'regular';
  switch (id) {
    case 'home':
      return <House color={color} size={size} weight={weight} />;
    case 'activity':
      return <Receipt color={color} size={size} weight={weight} />;
    case 'insights':
      return <ChartBar color={color} size={size} weight={weight} />;
  }
}

function NavSlot({
  label,
  active,
  onPress,
  accessibilityRole,
  accessibilityLabel,
  children,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityRole: 'tab' | 'button';
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'tab' ? {selected: active} : undefined}
      accessibilityLabel={accessibilityLabel}
      containerStyle={styles.slot}
      style={[styles.item, active && styles.itemActive]}>
      {children}
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
  onProfilePress,
  addOpen = false,
}: NavBarProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const navVisible = useFloatingNavVisible();
  const hideDistance = useFloatingNavClearance() + spacing.lg;
  const hidden = useRef(new Animated.Value(0)).current;
  const plusTwist = useRef(new Animated.Value(0)).current;

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
          {TAB_ITEMS.map(item => {
            const active = activeTab === item.id;
            return (
              <NavSlot
                key={item.id}
                label={item.label}
                active={active}
                onPress={() => onTabPress(item.id)}
                accessibilityRole="tab"
                accessibilityLabel={item.label}>
                <TabGlyph
                  id={item.id}
                  color={active ? colors.text : colors.muted}
                  active={active}
                />
              </NavSlot>
            );
          })}
          <NavSlot
            label="Profile"
            active={false}
            onPress={onProfilePress}
            accessibilityRole="button"
            accessibilityLabel="Open profile">
            <User color={colors.muted} size={layout.navIcon} weight="regular" />
          </NavSlot>
        </GlassPanel>

        <Pressable
          onPress={onAddPress}
          accessibilityRole="button"
          accessibilityLabel="Add transaction"
          accessibilityHint="Adds an expense or income"
          style={styles.addHit}>
          <View collapsable={false} style={[styles.addFace, shadows.add]}>
            <Animated.View
              pointerEvents="none"
              style={{transform: [{rotate: spin}]}}>
              <Plus color={colors.text} size={24} weight="bold" />
            </Animated.View>
          </View>
        </Pressable>
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

  itemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
