import React, {useEffect, useRef} from 'react';
import {Animated, Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  FLOATING_NAV_GAP,
  FLOATING_NAV_ITEM_HEIGHT,
  FLOATING_NAV_PILL_PAD_V,
  useFloatingNavClearance,
  useFloatingNavVisible,
} from './FloatingNavScroll';
import {
  ActivityGlyph,
  AskGlyph,
  CloseGlyph,
  HomeGlyph,
  InsightsGlyph,
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
  addOpen?: boolean;
};

const ITEMS: {id: TabId | 'add'; label: string}[] = [
  {id: 'home', label: 'Home'},
  {id: 'activity', label: 'Activity'},
  {id: 'add', label: 'Add transaction'},
  {id: 'insights', label: 'Insights'},
  {id: 'ask', label: 'Paisa AI'},
];

const ITEM_HEIGHT = FLOATING_NAV_ITEM_HEIGHT;
const ADD_FACE = 48;
const ADD_ARM = 14;
const ADD_THICK = 2;

function AddPlusMark({
  twist,
}: {
  twist?: Animated.Value;
}) {
  const fallback = useRef(new Animated.Value(0)).current;
  const value =
    twist && typeof twist.interpolate === 'function' ? twist : fallback;
  const spin = value.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });
  return (
    <>
      <Animated.View style={[styles.addBarH, {transform: [{rotate: spin}]}]} />
      <Animated.View style={[styles.addBarV, {transform: [{rotate: spin}]}]} />
    </>
  );
}

void CloseGlyph;

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
  const plusTwistRef = useRef<Animated.Value | null>(null);
  if (plusTwistRef.current == null) {
    plusTwistRef.current = new Animated.Value(0);
  }
  const plusTwist = plusTwistRef.current;

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

  return (
    <Animated.View
      pointerEvents={navVisible ? 'box-none' : 'none'}
      style={[
        styles.dock,
        {paddingBottom: Math.max(insets.bottom, spacing.sm) + FLOATING_NAV_GAP},
        addOpen ? styles.dockRaised : null,
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
              <Pressable
                key="add"
                onPress={onAddPress}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityHint="Adds an expense or income"
                style={styles.slot}>
                <View collapsable={false} style={styles.addFace}>
                  <View pointerEvents="none" style={styles.addShade} />
                  <View pointerEvents="none" style={styles.addSheen} />
                  <View pointerEvents="none" style={styles.addIconSlot}>
                    <AddPlusMark twist={plusTwist} />
                  </View>
                </View>
              </Pressable>
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

  dockRaised: {
    zIndex: 21,
  },

  pillWrap: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radii.pill,
  },

  pill: {
    height: ITEM_HEIGHT + FLOATING_NAV_PILL_PAD_V * 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: FLOATING_NAV_PILL_PAD_V,
    overflow: 'hidden',
  },

  slot: {
    flex: 1,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  hit: {
    flex: 1,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  addFace: {
    width: ADD_FACE,
    height: ADD_FACE,
    borderRadius: ADD_FACE / 2,
    backgroundColor: '#F0A63C',
    overflow: 'hidden',
    ...shadows.add,
  },
  addIconSlot: {
    ...StyleSheet.absoluteFill,
  },
  addBarH: {
    position: 'absolute',
    left: (ADD_FACE - ADD_ARM) / 2,
    top: (ADD_FACE - ADD_THICK) / 2,
    width: ADD_ARM,
    height: ADD_THICK,
    borderRadius: ADD_THICK / 2,
    backgroundColor: '#FFFFFF',
  },
  addBarV: {
    position: 'absolute',
    left: (ADD_FACE - ADD_THICK) / 2,
    top: (ADD_FACE - ADD_ARM) / 2,
    width: ADD_THICK,
    height: ADD_ARM,
    borderRadius: ADD_THICK / 2,
    backgroundColor: '#FFFFFF',
  },
  addShade: {
    position: 'absolute',
    right: -6,
    bottom: -10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E07A1C',
  },

  addSheen: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFC14D',
    opacity: 0.95,
  },
});