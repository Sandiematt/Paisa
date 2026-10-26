// The category tiles offered when adding a transaction. Ids are the default
// category slugs in Supabase (see categoriesStore.categoryForSlug).

export type CategoryOption = {id: string; label: string};

export const OTHER_CATEGORY: CategoryOption = {id: 'other', label: 'Other'};

export const EXPENSE_GRID: CategoryOption[] = [
  {id: 'housing', label: 'Housing'},
  {id: 'dining', label: 'Dining'},
  {id: 'groceries', label: 'Groceries'},
  {id: 'transport', label: 'Transport'},
  {id: 'health', label: 'Health'},
  {id: 'shopping', label: 'Shopping'},
  {id: 'entertainment', label: 'Entertainment'},
  {id: 'bills', label: 'Bills'},
  {id: 'personal', label: 'Personal'},
  {id: 'education', label: 'Education'},
  {id: 'travel', label: 'Travel'},
  OTHER_CATEGORY,
];

export const INCOME_CATEGORIES: CategoryOption[] = [
  {id: 'salary', label: 'Salary'},
  {id: 'freelance', label: 'Freelance'},
  {id: 'refund', label: 'Refund'},
  OTHER_CATEGORY,
];
