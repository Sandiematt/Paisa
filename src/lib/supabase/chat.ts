import {supabase} from './client';
import {dataErrorMessage} from './errors';
import type {ParsedExpense} from '../../features/paisaAI/types';

// Mirrors supabase/functions/paisaai-chat/types.ts (ChatResponse). Kept as
// a plain duplicate here rather than a shared import: the Edge Function
// runs on Deno and this file ships in the React Native bundle, so the two
// can't share a module graph. If you change the function's response
// shape, update this file to match.

export type ChatAnomaly = {
  category: string;
  currentAmount: number;
  averageAmount: number;
  percentAboveAverage: number;
  message: string;
};

export type ChatForecast = {
  projectedMonthEnd: number;
  willOverbudget: boolean;
  daysToLimit: number | null;
  message: string | null;
};

export type ChatTone = 'short' | 'detailed';

export type ChatResponse = {
  text: string;
  parsedExpense?: ParsedExpense;
  anomaly?: ChatAnomaly;
  forecast?: ChatForecast;
  suggestions?: string[];
  /** False when the AI call failed/was skipped and a rule-based reply was used. */
  aiGenerated: boolean;
};

export type SendChatMessageOptions = {
  message: string;
  /** "short" (default) for one-line replies, "detailed" for up to two sentences. */
  tone?: ChatTone;
};

/**
 * Calls the `paisaai-chat` Edge Function. All financial statistics are
 * computed server-side from the signed-in user's own transactions
 * (enforced by RLS); the AI only writes the `text` reply and extracts
 * `parsedExpense` from the message, both numerically verified server-side
 * before being trusted. Throws on network/auth failure — callers should
 * catch this and fall back to an offline reply (see paisaAIMock.ts).
 */
export async function sendChatMessage({message, tone = 'short'}: SendChatMessageOptions): Promise<ChatResponse> {
  const {data, error} = await supabase.functions.invoke<ChatResponse>('paisaai-chat', {
    body: {message, tone},
  });

  if (error || !data) {
    throw new Error(dataErrorMessage(error));
  }

  return data;
}
