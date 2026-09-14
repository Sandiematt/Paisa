import React, {useEffect, useRef} from 'react';
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
import {GlassPanel, PressableScale} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {colors, duration, easing, layout, radii, shadows, spacing} from '../../theme';

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

const ITEM_HEIGHT = 48;

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
  const hidden = useRef(new Animated.Value(0)).current;

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
      <GlassPanel
        intensity="2xl"
        overlayColor={colors.surfaceNav}
        radius={radii.pill}
        style={[styles.pillWrap, shadows.nav]}
        contentStyle={styles.pill}>
        {ITEMS.map(item => {
          if (item.id === 'add') {
            return (
              <PressableScale
                key="add"
                onPress={onAddPress}
                scaleTo={0.94}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityHint="Adds an expense or income"
                containerStyle={styles.slot}
                style={styles.hit}>
                <View style={styles.addFace}>
                  <View pointerEvents="none" style={styles.addSheen} />
                  <PlusGlyph color="#FFFFFF" size={22} />
                </View>
              </PressableScale>
            );
          }

          const tabId = item.id;
          const active = activeTab === tabId;
          const color = active ? colors.accent : colors.inkMuted;

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
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  pillWrap: {
    width: '100%',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  slot: {
    flex: 1,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addFace: {
    width: 48,
    height: 48,
    marginTop: -2,
    borderRadius: radii.pill,
    backgroundColor: '#D97A1F',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.add,
  },
  addSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F0A63C',
    opacity: 0.9,
  },
});
