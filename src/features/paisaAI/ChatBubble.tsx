import React from 'react';
import {StyleSheet, View} from 'react-native';

import {PressableScale, Text} from '../../components/ui';
import {colors, fonts, radii, spacing} from '../../theme';
import {ChatMessage} from './types';
import {ExpensePreviewCard} from './ExpensePreviewCard';
import {TypingIndicator} from './TypingIndicator';

export type ChatBubbleProps = {
  message: ChatMessage;
  currencySymbol: string;
  showSuggestions?: boolean;
  onSuggestion?: (text: string) => void;
  onAddExpense: (messageId: string) => void;
  onEditExpense: (messageId: string) => void;
};

export function ChatBubble({
  message,
  currencySymbol,
  showSuggestions,
  onSuggestion,
  onAddExpense,
  onEditExpense,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <View style={styles.userBubble}>
        <Text fontFamily={fonts.interMedium} fontSize={15} lineHeight={22} color={colors.onInk}>
          {message.text}
        </Text>
      </View>
    );
  }

  if (message.isTyping) {
    return (
      <View style={[styles.aiBubble, styles.typingBubble]}>
        <TypingIndicator />
      </View>
    );
  }

  const suggestions = showSuggestions ? message.suggestions ?? [] : [];

  return (
    <View style={styles.aiColumn}>
      <View style={styles.aiBubble}>
        <Text fontFamily={fonts.interMedium} fontSize={15} lineHeight={22} color={colors.ink}>
          {message.text}
        </Text>

        {message.parsedExpense && message.status !== 'confirmed' ? (
          <ExpensePreviewCard
            expense={message.parsedExpense}
            currencySymbol={currencySymbol}
            onAdd={() => onAddExpense(message.id)}
            onEdit={() => onEditExpense(message.id)}
          />
        ) : null}

        {message.status === 'confirmed' ? (
          <Text
            fontFamily={fonts.interSemi}
            fontSize={13}
            lineHeight={18}
            fontWeight="600"
            color={colors.positive}
            style={styles.confirmedText}>
            Added to your expenses.
          </Text>
        ) : null}
      </View>

      {suggestions.length > 0 ? (
        <View style={styles.suggestionRow}>
          {suggestions.map(text => (
            <PressableScale
              key={text}
              scaleTo={0.97}
              style={styles.suggestionChip}
              onPress={() => onSuggestion?.(text)}>
              <Text fontFamily={fonts.interMedium} fontSize={12} lineHeight={17} color={colors.inkSecondary}>
                {text}
              </Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.ink,
    maxWidth: '80%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderBottomRightRadius: spacing.xs,
    marginBottom: spacing.sm,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.field,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.fieldStroke,
    maxWidth: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderBottomLeftRadius: spacing.xs,
  },
  typingBubble: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  aiColumn: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    marginBottom: spacing.sm,
  },
  confirmedText: {
    marginTop: spacing.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  suggestionChip: {
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldStroke,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
