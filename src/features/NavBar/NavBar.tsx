import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  FLOATING_NAV_GAP,
  useFloatingNavClearance,
  useFloatingNavVisible,
} from './FloatingNavScroll';
import {
  ActivityGlyph,
  AskGlyph,
  HomeGlyph,
  InsightsGlyph,
  PlusGlyph,
} from '../../components/icons/Glyphs';
import {PressableScale} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {colors, duration, easing, layout, radii, spacing} from '../../theme';

export const TABS = ['home', 'activity', 'insights', 'ask'] as const;
export type TabId = (typeof TABS)[number];

type NavBarProps = {
  activeTab: TabId;
  onTabPress: (tab: TabId) => void;
  onAddPress: () => void;
};

const ITEMS: {id: TabId | 'add'; label: string}[] = [
  {id: 'home', label: 'Home'},
  {id: 'activity', label: 'Activity'},
  {id: 'add', label: 'Add transaction'},
  {id: 'insights', label: 'Insights'},
  {id: 'ask', label: 'Paisa AI'},
];

const ITEM_WIDTH = 58;
const ITEM_HEIGHT = 44;
const PILL_PAD = 8;
const INDICATOR = 40;

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
  switch (id) {
    case 'home':
      return <HomeGlyph color={color} size={size} active={active} />;
    case 'activity':
      return <ActivityGlyph color={color} size={size} active={active} />;
    case 'insights':
      return <InsightsGlyph color={color} size={size} active={active} />;
    case 'ask':
      return <AskGlyph color={color} size={size} active={active} />;
  }
}

export function NavBar({activeTab, onTabPress, onAddPress}: NavBarProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const navVisible = useFloatingNavVisible();
  const hideDistance = useFloatingNavClearance() + spacing.lg;
  const selectedIndex = useMemo(
    () => ITEMS.findIndex(item => item.id === activeTab),
    [activeTab],
  );
  const indicatorX = useRef(new Animated.Value(selectedIndex * ITEM_WIDTH))
    .current;
  const hidden = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(indicatorX, {
      toValue: selectedIndex * ITEM_WIDTH,
      duration: reducedMotion ? 0 : duration.swap,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [indicatorX, reducedMotion, selectedIndex]);

  useEffect(() => {
    Animated.timing(hidden, {
      toValue: navVisible ? 0 : 1,
      duration: reducedMotion ? 0 : duration.swap,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [hidden, navVisible, reducedMotion]);

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

  return (
    <Animated.View
      pointerEvents={navVisible ? 'box-none' : 'none'}
      style={[
        styles.dock,
        {paddingBottom: Math.max(insets.bottom, spacing.sm) + FLOATING_NAV_GAP},
        dockMotion,
      ]}>
      <View style={styles.pill}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {transform: [{translateX: indicatorX}]},
          ]}
        />
        {ITEMS.map(item => {
          if (item.id === 'add') {
            return (
              <PressableScale
                key="add"
                onPress={onAddPress}
                scaleTo={0.94}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityHint="Opens a menu to add an expense or income"
                containerStyle={styles.slot}
                style={styles.hit}>
                <View style={styles.addFace}>
                  <PlusGlyph color={colors.ink} size={16} />
                </View>
              </PressableScale>
            );
          }

          const tabId = item.id;
          const active = activeTab === tabId;
          const color = active ? colors.ink : colors.inkMuted;

          return (
            <PressableScale
              key={tabId}
              onPress={() => onTabPress(tabId)}
              scaleTo={0.94}
              accessibilityRole="tab"
              accessibilityState={{selected: active}}
              accessibilityLabel={item.label}
              containerStyle={styles.slot}
              style={styles.hit}>
              <TabGlyph id={tabId} color={color} active={active} />
            </PressableScale>
          );
        })}
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
    alignItems: 'center',
    zIndex: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: PILL_PAD,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    elevation: 8,
  },
  indicator: {
    position: 'absolute',
    top: PILL_PAD + (ITEM_HEIGHT - INDICATOR) / 2,
    left: PILL_PAD + (ITEM_WIDTH - INDICATOR) / 2,
    width: INDICATOR,
    height: INDICATOR,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
  },
  slot: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
  },
  hit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFace: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
