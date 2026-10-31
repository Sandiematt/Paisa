export type MoneyFlow = 'income' | 'expense';
export type TransactionKind = 'regular' | 'opening_balance' | 'balance_adjustment';
export type TransactionSource = 'manual' | 'upi_auto' | 'receipt_scan';
export type BudgetFlowSource = 'new' | 'migrated' | 'restart';
export type MonthChoice = 'keep' | 'budget';
export type BudgetAdjustmentKind = 'top_up' | 'move_to_budget' | 'move_to_savings';
export type BillMonthStatus = 'not_paid' | 'paid' | 'paid_outside' | 'skipped';

/** One finished budget cycle (supabase/migrations/20261030120000_budget_flow.sql). */
export type BudgetMonthRow = {
  user_id: string;
  cycle_start: string;
  cycle_end: string;
  budget: number;
  savings_goal: number;
  spendable: number;
  spent: number;
  extra_savings: number;
  overspent_by: number;
  partial_from: string | null;
  prompt: boolean;
  choice: MonthChoice | null;
  to_budget: number;
  applied_cycle_start: string | null;
  handled_at: string | null;
  reviewed_at: string | null;
  closed_at: string;
};

/** A monthly bill's status in one budget cycle. */
export type BillMonthRow = {
  user_id: string;
  bill_key: string;
  cycle_start: string;
  status: BillMonthStatus;
  label: string;
  planned_amount: number;
  paid_amount: number | null;
  transaction_id: string | null;
  settled_on: string | null;
  updated_at: string;
};

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
          budget_flow_version: number;
          tracking_start: string | null;
          already_spent: number;
          budget_flow_started_on: string | null;
          budget_flow_source: BudgetFlowSource | null;
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
          budget_flow_version?: number;
          tracking_start?: string | null;
          already_spent?: number;
          budget_flow_started_on?: string | null;
          budget_flow_source?: BudgetFlowSource | null;
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
          budget_flow_version?: number;
          tracking_start?: string | null;
          already_spent?: number;
          budget_flow_started_on?: string | null;
          budget_flow_source?: BudgetFlowSource | null;
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
          kind: TransactionKind;
          is_recurring: boolean;
          is_fixed: boolean;
          source: TransactionSource;
          external_ref: string | null;
          upi_ref: string | null;
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
          kind?: TransactionKind;
          is_recurring?: boolean;
          is_fixed?: boolean;
          source?: TransactionSource;
          external_ref?: string | null;
          upi_ref?: string | null;
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
          kind?: TransactionKind;
          is_recurring?: boolean;
          is_fixed?: boolean;
          source?: TransactionSource;
          external_ref?: string | null;
          upi_ref?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      budget_months: {
        Row: BudgetMonthRow;
        Insert: Partial<BudgetMonthRow> & {
          cycle_start: string;
          cycle_end: string;
        };
        Update: Partial<BudgetMonthRow>;
        Relationships: [];
      };
      budget_adjustments: {
        Row: {
          id: string;
          user_id: string;
          cycle_start: string;
          kind: BudgetAdjustmentKind;
          amount: number;
          label: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      bill_months: {
        Row: BillMonthRow;
        Insert: Partial<BillMonthRow> & {
          bill_key: string;
          cycle_start: string;
          status: BillMonthStatus;
        };
        Update: Partial<BillMonthRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      apply_month_choice: {
        Args: {
          p_cycle_start: string;
          p_choice: MonthChoice;
          p_extra_savings: number;
          p_applied_cycle_start: string;
        };
        Returns: BudgetMonthRow[];
      };
      add_budget_adjustment: {
        Args: {
          p_cycle_start: string;
          p_kind: BudgetAdjustmentKind;
          p_amount: number;
          p_label?: string | null;
        };
        Returns: Database['public']['Tables']['budget_adjustments']['Row'];
      };
      consume_function_quota: {
        Args: {p_function: string};
        Returns: boolean;
      };
      email_registered: {
        Args: {p_email: string};
        Returns: boolean;
      };
    };
    Enums: {
      money_flow: MoneyFlow;
    };
    CompositeTypes: Record<string, never>;
  };
};
