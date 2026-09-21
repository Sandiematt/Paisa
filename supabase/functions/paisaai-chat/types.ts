// Shared types for the paisaai-chat Edge Function.
//
// Nothing here performs I/O or calls the AI — these are the plain data
// shapes that flow from Supabase -> deterministic context/pattern math ->
// Gemini (expense extraction + reply writing) -> HTTP response -> React
// Native. Mirrors the split used by supabase/functions/generate-insights/.

export type MoneyFlow = 'income' | 'expense';

export interface CategoryRef {
  id: string;
  name: string;
  slug: string | null;
  type: MoneyFlow;
}

/** A transaction row, normalized from the Supabase query result. */
export interface TransactionRecord {
  id: string;
  type: MoneyFlow;
  amount: number;
  merchant: string | null;
  description: string | null;
  /** Calendar date, `YYYY-MM-DD`. */
  transactionDate: string;
  paymentMethod: string | null;
  /** Ledger marker, e.g. `opening_balance` / `balance_adjustment`, or null. */
  notes: string | null;
  categoryId: string | null;
}

/** Subset of `profiles` needed for budget math. */
export interface ProfileRecord {
  currency: string;
  monthlyIncome: number | null;
  monthlyBudget: number | null;
  monthlySavingsGoal: number | null;
  startingBalance: number | null;
}

/** A category's spend this month vs. its trailing 3-month baseline average. */
export interface CategorySpend {
  categoryId: string | null;
  name: string;
  slug: string | null;
  amountThisMonth: number;
  /** Average monthly spend in this category over the trailing baseline window. */
  baselineAverage: number;
}

/** Deterministic financial snapshot the AI is allowed to see and quote from. */
export interface ChatFinancialContext {
  /** Today's calendar date, `YYYY-MM-DD`. */
  today: string;
  currency: string;
  /** First day of the current calendar month, `YYYY-MM-DD`. */
  monthStart: string;
  daysInMonth: number;
  daysElapsed: number;
  daysLeft: number;
  monthlyBudget: number;
  spentThisMonth: number;
  /** Budget minus spent. Can be negative when over budget. */
  remaining: number;
  /** Safe amount left to spend per remaining day. */
  dailySafe: number;
  /** Pace vs. the budget given how much of the month has elapsed. */
  pace: {under: boolean; pct: number} | null;
  categories: CategoryRef[];
  categorySpend: CategorySpend[];
  topCategory: {name: string; amount: number} | null;
  recentExpenses: {
    merchant: string | null;
    description: string | null;
    amount: number;
    date: string;
    categoryName: string | null;
  }[];
}

/** Mirrors src/features/paisaAI/types.ts's ParsedExpense in the RN app. */
export interface ParsedExpense {
  amount: number;
  category: string;
  subcategory: string;
  merchant: string;
  /** ISO date string YYYY-MM-DD. */
  date: string;
  description: string;
  paymentMethod?: string;
  /** Real category id when a confident match was found, so the client can save without a name lookup. */
  categoryId?: string | null;
}

export interface ChatAnomaly {
  category: string;
  currentAmount: number;
  averageAmount: number;
  percentAboveAverage: number;
  message: string;
}

export interface ChatForecast {
  projectedMonthEnd: number;
  willOverbudget: boolean;
  daysToLimit: number | null;
  message: string | null;
}

export type ChatTone = 'short' | 'detailed';

export interface ChatRequestBody {
  message: string;
  tone: ChatTone;
}

export interface ChatResponse {
  text: string;
  parsedExpense?: ParsedExpense;
  anomaly?: ChatAnomaly;
  forecast?: ChatForecast;
  suggestions?: string[];
  /** False when the AI call failed/was skipped and a rule-based reply was used. */
  aiGenerated: boolean;
}
