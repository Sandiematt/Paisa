export type MoneyFlow = 'income' | 'expense';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          currency: string;
          starting_balance: number | null;
          monthly_income: number | null;
          monthly_budget: number | null;
          monthly_savings_goal: number | null;
          goal: string | null;
          category_ids: string[];
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string;
          currency?: string;
          starting_balance?: number | null;
          monthly_income?: number | null;
          monthly_budget?: number | null;
          monthly_savings_goal?: number | null;
          goal?: string | null;
          category_ids?: string[];
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          currency?: string;
          starting_balance?: number | null;
          monthly_income?: number | null;
          monthly_budget?: number | null;
          monthly_savings_goal?: number | null;
          goal?: string | null;
          category_ids?: string[];
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          icon: string;
          color: string;
          type: MoneyFlow;
          slug: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          icon?: string;
          color: string;
          type: MoneyFlow;
          slug?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          icon?: string;
          color?: string;
          type?: MoneyFlow;
          slug?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: MoneyFlow;
          amount: number;
          category_id: string | null;
          description: string | null;
          merchant: string | null;
          transaction_date: string;
          payment_method: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: MoneyFlow;
          amount: number;
          category_id?: string | null;
          description?: string | null;
          merchant?: string | null;
          transaction_date?: string;
          payment_method?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: MoneyFlow;
          amount?: number;
          category_id?: string | null;
          description?: string | null;
          merchant?: string | null;
          transaction_date?: string;
          payment_method?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      money_flow: MoneyFlow;
    };
    CompositeTypes: Record<string, never>;
  };
};
