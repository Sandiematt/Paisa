import {File, Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {loadCategories} from './categoriesStore';
import {
  isBalanceAdjustment,
  isOpeningBalance,
  loadTransactions,
  localDateISO,
  TransactionRow,
} from './transactionsStore';

const HEADERS = [
  'Date',
  'Type',
  'Amount',
  'Currency',
  'Category',
  'Merchant',
  'Description',
  'Payment Method',
  'Recurring',
  'Notes',
];

export type ExportResult = {rows: number; shared: boolean};

/** Quotes a CSV cell and defuses spreadsheet formula injection. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowKind(row: TransactionRow): string {
  if (isOpeningBalance(row)) {
    return 'Opening balance';
  }
  if (isBalanceAdjustment(row)) {
    return 'Balance adjustment';
  }
  return row.type === 'income' ? 'Income' : 'Expense';
}

export function transactionsToCsv(
  rows: TransactionRow[],
  categoryNames: Map<string, string>,
  currency: string,
): string {
  const lines = [HEADERS.join(',')];
  for (const row of rows) {
    const special = isOpeningBalance(row) || isBalanceAdjustment(row);
    lines.push(
      [
        cell(row.transactionDate),
        cell(rowKind(row)),
        cell(row.amount.toFixed(2)),
        cell(currency),
        cell(row.categoryId ? categoryNames.get(row.categoryId) : ''),
        cell(row.merchant),
        cell(row.description),
        cell(row.paymentMethod),
        cell(row.isRecurring ? 'Yes' : 'No'),
        cell(special ? '' : row.notes),
      ].join(','),
    );
  }
  // BOM so Excel reads ₹ and other symbols as UTF-8.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export async function exportTransactionsCsv(
  currency: string,
): Promise<ExportResult> {
  const [rows, categories] = await Promise.all([
    loadTransactions(),
    loadCategories(),
  ]);
  if (rows.length === 0) {
    return {rows: 0, shared: false};
  }

  const names = new Map(categories.map(item => [item.id, item.name]));
  const csv = transactionsToCsv(rows, names, currency);

  const file = new File(Paths.cache, `paisa-transactions-${localDateISO()}.csv`);
  if (file.exists) {
    file.delete();
  }
  file.create();
  await file.write(csv);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export transactions',
  });
  return {rows: rows.length, shared: true};
}
