import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { AppText, PressableScale } from '../../components/ui';
import { colors, radii, spacing } from '../../theme';

export type SuggestionChipsProps = {
  onSelect: (text: string) => void;
};

const SUGGESTIONS = [
  'Spent 500 on lunch',
  'Coffee ₹250 at Starbucks',
  'Uber to college ₹320',
  'Bought a shirt for 1800',
  'Paid 2500 for electricity',
  'Movie tickets ₹600',
];

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {SUGGESTIONS.map((text, index) => (
        <PressableScale 
          key={index} 
          style={styles.chip}
          onPress={() => onSelect(text)}
        >
          <AppText variant="caption" style={styles.text}>{text}</AppText>
        </PressableScale>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  text: {
    color: colors.inkSecondary,
  },
});
