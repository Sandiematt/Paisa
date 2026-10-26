export type AddKind = 'expense' | 'income';

/** What the + menu offers: a manual entry of either kind, or a receipt scan. */
export type AddChoice = AddKind | 'scan';
