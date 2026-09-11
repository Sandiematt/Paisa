import React, { useState, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SparkleGlyph } from '../../components/icons/Glyphs';
import { AppText, Screen, PressableScale } from '../../components/ui';
import { colors, radii, spacing, layout } from '../../theme';
import { useFloatingNavClearance, useFloatingNavScroll } from '../NavBar/FloatingNavScroll';
import { ChatMessage } from './types';
import { SuggestionChips } from './SuggestionChips';
import { ChatBubble } from './ChatBubble';
import { parseExpenseFromText, generateAIResponse } from './paisaAIMock';

export type PaisaAIScreenProps = {
  currencySymbol: string;
};

export function PaisaAIScreen({ currencySymbol }: PaisaAIScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const navClearance = useFloatingNavClearance();
  const navScroll = useFloatingNavScroll();

  const handleSend = useCallback((text: string) => {
    if (!text.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: text.trim(),
    };

    setMessages(prev => [userMessage, ...prev]);
    setInputText('');

    // Simulate AI processing delay
    setTimeout(() => {
      const parsed = parseExpenseFromText(userMessage.text);
      let aiText = '';
      
      if (parsed) {
        aiText = generateAIResponse(parsed, currencySymbol);
      } else {
        aiText = 'Hmm, I couldn\'t quite understand that. Try something like "Spent 500 on lunch at Subway".';
      }

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: aiText,
        parsedExpense: parsed || undefined,
        status: parsed ? 'pending' : undefined,
      };

      setMessages(prev => [aiMessage, ...prev]);
    }, 400);
  }, [currencySymbol]);

  const handleAddExpense = useCallback((messageId: string) => {
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId ? { ...msg, status: 'confirmed' } : msg
      )
    );
  }, []);

  const handleEditExpense = useCallback((messageId: string) => {
    Alert.alert('Edit Expense', 'Mock edit action triggered.');
  }, []);

  const showSuggestions = messages.length === 0;

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <AppText variant="display">Paisa AI</AppText>
        <View style={styles.headerSparkle}>
          <SparkleGlyph color={colors.accent} size={22} />
        </View>
      </View>

      <View style={styles.container}>
        {showSuggestions ? (
          <View style={styles.emptyState}>
            <AppText style={styles.robotEmoji}>🤖</AppText>
            <AppText variant="heading" style={styles.emptyTitle}>Hi! I'm Paisa AI</AppText>
            <AppText variant="body" style={styles.emptyDesc}>
              Tell me what you spent and I'll handle the rest.
            </AppText>
            <View style={styles.suggestionsContainer}>
              <SuggestionChips onSelect={handleSend} />
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            inverted
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <ChatBubble
                message={item}
                currencySymbol={currencySymbol}
                onAddExpense={handleAddExpense}
                onEditExpense={handleEditExpense}
              />
            )}
            contentContainerStyle={styles.listContent}
            onScroll={navScroll.onScroll}
            scrollEventThrottle={navScroll.scrollEventThrottle}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={[styles.inputBar, {paddingBottom: spacing.sm + navClearance}]}>
          <View style={styles.inputInner}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Tell Paisa what you spent..."
              placeholderTextColor={colors.inkMuted}
              returnKeyType="send"
              onSubmitEditing={() => handleSend(inputText)}
            />
            <PressableScale 
              style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
              onPress={() => handleSend(inputText)}
              disabled={!inputText.trim()}
            >
              <View style={styles.sendIconWrapper}>
                <View style={styles.triangle} />
              </View>
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerSparkle: {
    marginLeft: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  robotEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  emptyDesc: {
    color: colors.inkSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  suggestionsContainer: {
    width: '100%',
  },
  listContent: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  inputBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.sm,
  },
  inputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  textInput: {
    flex: 1,
    height: 48,
    backgroundColor: colors.canvasSunk,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    color: colors.ink,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendIconWrapper: {
    width: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  triangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.onInk,
  },
});
