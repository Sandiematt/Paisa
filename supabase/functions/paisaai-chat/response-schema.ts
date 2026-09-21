// Runtime validators for paisaai-chat.
//
// Two different trust boundaries get validated here:
//   1. The HTTP request body (from the React Native client).
//   2. Gemini's JSON output (from the model) — validated separately for
//      the expense-extraction call and the reply-writing call, since each
//      has its own required shape. Passing Zod validation is necessary but
//      not sufficient to be trusted — see the numeric-safety checks in
//      expense-parser.ts and index.ts, which run after these schemas.

import {z} from 'npm:zod@3.23.8';

export const chatRequestBodySchema = z
  .object({
    message: z.string().trim().min(1, 'message is required').max(500, 'message is too long'),
    tone: z.enum(['short', 'detailed']).optional(),
  })
  .strict();

export type ChatRequestPayload = z.infer<typeof chatRequestBodySchema>;

/** Shape Gemini must return when asked to extract an expense from one message. */
export const geminiExpenseSchema = z.object({
  expense: z
    .object({
      amount: z.number().positive(),
      merchant: z.string().nullable().optional(),
      categoryName: z.string().nullable().optional(),
      subcategory: z.string().nullable().optional(),
      date: z.string().nullable().optional(),
      paymentMethod: z.string().nullable().optional(),
    })
    .nullable(),
});

export type GeminiExpensePayload = z.infer<typeof geminiExpenseSchema>;

/** Shape Gemini must return for the conversational reply. */
export const geminiReplySchema = z.object({
  text: z.string().min(1).max(400),
  suggestions: z.array(z.string().max(80)).max(3).optional(),
  /**
   * True when `text` states any of the user's own numbers from "context"
   * (spend, budget, remaining, etc.) — those replies get checked against
   * the numbers we actually computed (see isReplyNumericallySafe in
   * index.ts). False for generic personal-finance answers ("What is a
   * budget?") that may use illustrative example numbers unrelated to the
   * user's real data — those skip the check since there's nothing of the
   * user's to hallucinate. Missing/omitted defaults to `true` (checked),
   * the safer assumption.
   */
  grounded: z.boolean().optional(),
});

export type GeminiReplyPayload = z.infer<typeof geminiReplySchema>;
