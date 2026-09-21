export type ParsedExpense = {
  amount: number;
  category: string;
  subcategory: string;
  merchant: string;
  date: string;           // ISO date string YYYY-MM-DD
  description: string;
  paymentMethod?: string;
  /** Real category id when the backend found a confident match, so we can save without a name lookup. */
  categoryId?: string | null;
};

export type MessageStatus = 'pending' | 'confirmed' | 'edited';

export type ChatMessage = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  parsedExpense?: ParsedExpense;
  status?: MessageStatus;
  /** Shows an animated three-dot indicator instead of `text` while a reply is loading. */
  isTyping?: boolean;
  /** Follow-up prompts from the latest reply. Shown only on the newest message. */
  suggestions?: string[];
};
