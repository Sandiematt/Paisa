export type ActivityKind = 'expense' | 'income';

export type ActivityFilter = 'all' | 'expenses' | 'income' | 'recurring';

export type ActivityTransaction = {
  id: string;
  merchant: string;
  category: string;
  account: string;
  /** Signed: expenses negative, income positive. */
  amount: number;
  kind: ActivityKind;
  recurring: boolean;
  note: string;
  /** ISO date, local calendar day. */
  date: string;
};
