export type ParsedExpense = {
  amount: number;
  category: string;
  subcategory: string;
  merchant: string;
  date: string;           // ISO date string YYYY-MM-DD
  description: string;
  paymentMethod?: string;
};

export type MessageStatus = 'pending' | 'confirmed' | 'edited';

export type ChatMessage = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  parsedExpense?: ParsedExpense;
  status?: MessageStatus;
};
