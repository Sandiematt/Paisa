import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  ActivityGlyph,
  AskGlyph,
  HomeGlyph,
  InsightsGlyph,
  PlusGlyph,
} from '../../components/icons/Glyphs';
import {AppText, PressableScale} from '../../components/ui';
import {colors, layout, radii, spacing} from '../../theme';

export const TABS = ['home', 'activity', 'insights', 'ask'] as const;
export type TabId = (typeof TABS)[number];

type NavBarProps = {
  activeTab: TabId;
  onTabPress: (tab: TabId) => void;
  onAddPress: () => void;
};

const ITEMS: {
  id: TabId | 'add';
  label: string;
}[] = [
  {id: 'home', label: 'Home'},
  {id: 'activity', label: 'Activity'},
  {id: 'add', label: 'Add'},
  {id: 'insights', label: 'Insights'},
  {id: 'ask', label: 'Ask'},
];

function TabGlyph({
  id,
  color,
}: {
  id: Exclude<TabId, never>;
  color: string;
}) {
  const size = layout.navIcon;
  switch (id) {
    case 'home':
      return <HomeGlyph color={color} size={size} />;
    case 'activity':
      return <ActivityGlyph color={color} size={size} />;
    case 'insights':
      return <InsightsGlyph color={color} size={size} />;
    case 'ask':
      return <AskGlyph color={color} size={size} />;
  }
}

export function NavBar({activeTab, onTabPress, onAddPress}: NavBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      collapsable={false}
      style={[
        styles.bar,
        {paddingBottom: Math.max(insets.bottom, spacing.sm)},
      ]}>
      {ITEMS.map(item => {
        if (item.id === 'add') {
          return (
            <View key="add" style={styles.slot} collapsable={false}>
              <PressableScale
                onPress={onAddPress}
                scaleTo={0.94}
                accessibilityRole="button"
                accessibilityLabel="Add transaction"
                accessibilityHint="Opens a menu to add an expense or income"
                containerStyle={styles.slotFill}
                style={styles.addHit}>
                <View style={styles.addFace}>
                  <PlusGlyph color={colors.ink} size={18} />
                </View>
              </PressableScale>
            </View>
          );
        }

        const tabId = item.id;
        const active = activeTab === tabId;
        const color = active ? colors.ink : colors.inkMuted;

        return (
            <View key={tabId} style={styles.slot} collapsable={false}>
            <PressableScale
              onPress={() => onTabPress(tabId)}
              scaleTo={0.94}
              accessibilityRole="tab"
              accessibilityState={{selected: active}}
              accessibilityLabel={item.label}
              containerStyle={styles.slotFill}
              style={styles.tab}>
              <TabGlyph id={tabId} color={color} />
              <AppText
                variant="caption"
                color={color}
                style={styles.label}
                numberOfLines={1}>
                {item.label}
              </AppText>
            </PressableScale>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.canvas,
    borderTopWidth: layout.hairlineWidth,
    borderTopColor: colors.hairline,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  slot: {
    flex: 1,
    minHeight: 52,
  },
  slotFill: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.xs,
  },
  label: {
    letterSpacing: 0.1,
    marginTop: spacing.xs,
  },
  addHit: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.xs,
  },
  addFace: {
    width: layout.addButton,
    height: layout.addButton,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accentPress,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
    elevation: 4,
  },
});
