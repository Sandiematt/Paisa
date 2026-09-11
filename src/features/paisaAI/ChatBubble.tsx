import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '../../components/ui';
import { colors, radii, spacing } from '../../theme';
import { ChatMessage } from './types';
import { ExpensePreviewCard } from './ExpensePreviewCard';

export type ChatBubbleProps = {
  message: ChatMessage;
  currencySymbol: string;
  onAddExpense: (messageId: string) => void;
  onEditExpense: (messageId: string) => void;
};

export function ChatBubble({ message, currencySymbol, onAddExpense, onEditExpense }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <View style={styles.userBubble}>
        <AppText variant="body" style={styles.userText}>{message.text}</AppText>
      </View>
    );
  }

  return (
    <View style={styles.aiBubble}>
      <AppText variant="body" style={styles.aiText}>{message.text}</AppText>
      
      {message.parsedExpense && message.status !== 'confirmed' && (
        <ExpensePreviewCard 
          expense={message.parsedExpense}
          currencySymbol={currencySymbol}
          onAdd={() => onAddExpense(message.id)}
          onEdit={() => onEditExpense(message.id)}
        />
      )}
      
      {message.status === 'confirmed' && (
        <AppText variant="bodyStrong" style={styles.confirmedText}>
          ✓ Added to your expenses.
        </AppText>
      )}
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
  userText: {
    color: colors.onInk,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    maxWidth: '92%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.card,
    borderBottomLeftRadius: spacing.xs,
    marginBottom: spacing.sm,
  },
  aiText: {
    color: colors.ink,
  },
  confirmedText: {
    color: colors.positive,
    marginTop: spacing.sm,
  }
});
