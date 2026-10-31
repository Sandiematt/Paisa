import {File, Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {loadCategories} from './categoriesStore';
import {ExportOptions, ExportResult, rowKind} from './exportCsv';
import {monthKey, transactionsInMonth} from './exportMonth';
import {
  TransactionRow,
  isLedgerSpecial,
  loadTransactions,
  localDateISO,
} from './transactionsStore';

/**
 * A transactions statement as a PDF, written by hand so it needs no native
 * module: A4 pages in the built-in Helvetica, a summary up top and one table
 * row per transaction. The built-in fonts only cover Latin text, so other
 * characters print as "?" and amounts carry no ₹ sign (the header names the
 * currency instead).
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const ROW_HEIGHT = 16;
const FONT_SIZE = 9;
const BOTTOM = 56;
const FIRST_TABLE_TOP = PAGE_HEIGHT - 150;
const NEXT_TABLE_TOP = PAGE_HEIGHT - 80;

const COLUMNS = {
  date: {x: MARGIN, width: 58},
  description: {x: MARGIN + 62, width: 214},
  category: {x: MARGIN + 282, width: 86},
  type: {x: MARGIN + 372, width: 70},
  amountRight: PAGE_WIDTH - MARGIN,
};

/** Helvetica advance widths (1/1000 em) for ASCII 32-126. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const REPLACEMENTS: Record<string, string> = {
  '₹': 'Rs ',
  '–': '-',
  '—': '-',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '·': '-',
  '…': '...',
  ' ': ' ',
};

/** Text the built-in font can print: known symbols spelled out, anything else "?". */
function plain(text: string): string {
  let out = '';
  for (const char of text) {
    const swapped = REPLACEMENTS[char] ?? char;
    for (const part of swapped) {
      const code = part.charCodeAt(0);
      out += code >= 32 && code <= 126 ? part : '?';
    }
  }
  return out;
}

function escape(text: string): string {
  return text.replace(/[\\()]/g, match => `\\${match}`);
}

/** `text` as a PDF string body: printable by Helvetica, with PDF syntax escaped. */
export function pdfText(text: string): string {
  return escape(plain(text));
}

function widthOf(text: string, size: number, bold = false): number {
  let units = 0;
  for (const char of text) {
    const width = HELVETICA[char.charCodeAt(0) - 32] ?? 556;
    // Helvetica-Bold keeps the figures' widths and runs letters a little
    // wider; near enough for fitting and aligning.
    units += bold && !/[-0-9,.]/.test(char) ? width * 1.08 : width;
  }
  return (units * size) / 1000;
}

/** Cut to fit `width`, ending in "..." when anything was cut. */
function fit(text: string, width: number, size = FONT_SIZE): string {
  const clean = plain(text);
  if (widthOf(clean, size) <= width) {
    return clean;
  }
  let cut = clean;
  while (cut.length > 0 && widthOf(`${cut}...`, size) > width) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}...`;
}

function money(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const [whole, cents] = Math.abs(amount).toFixed(2).split('.');
  // Indian grouping: 12,34,567.00
  const last = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}${rest ? `${rest},${last}` : last}.${cents}`;
}

function dateLabel(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${names[month - 1] ?? ''} ${year}`;
}

class Page {
  ops: string[] = [];

  text(x: number, y: number, text: string, {size = FONT_SIZE, bold = false, gray = 0} = {}) {
    this.ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${gray} g ${x.toFixed(2)} ${y.toFixed(2)} Td (${escape(text)}) Tj ET`,
    );
  }

  textRight(right: number, y: number, text: string, options: {size?: number; bold?: boolean; gray?: number} = {}) {
    this.text(right - widthOf(text, options.size ?? FONT_SIZE, options.bold), y, text, options);
  }

  fill(x: number, y: number, width: number, height: number, rgb: string) {
    this.ops.push(`${rgb} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }
}

export type PdfMeta = {
  /** Currency code the amounts are in, e.g. "INR". */
  currency: string;
  /** What the statement covers, e.g. "October 2026" or "All transactions". */
  title: string;
  generatedOn: string;
};

function tableHeader(page: Page, top: number) {
  page.fill(MARGIN, top - 5, PAGE_WIDTH - MARGIN * 2, ROW_HEIGHT + 2, '0.93 0.92 0.98');
  const y = top;
  const options = {bold: true, size: 8.5};
  page.text(COLUMNS.date.x + 4, y, 'Date', options);
  page.text(COLUMNS.description.x, y, 'Description', options);
  page.text(COLUMNS.category.x, y, 'Category', options);
  page.text(COLUMNS.type.x, y, 'Type', options);
  page.textRight(COLUMNS.amountRight - 4, y, 'Amount', options);
}

export function transactionsToPdf(
  rows: TransactionRow[],
  categoryNames: Map<string, string>,
  meta: PdfMeta,
): string {
  let income = 0;
  let spent = 0;
  let count = 0;
  for (const row of rows) {
    if (isLedgerSpecial(row)) {
      continue;
    }
    count += 1;
    if (row.type === 'income') {
      income += row.amount;
    } else {
      spent += row.amount;
    }
  }

  const pages: Page[] = [];
  let page = new Page();
  pages.push(page);
  page.fill(0, PAGE_HEIGHT - 6, PAGE_WIDTH, 6, '0.43 0.29 1');
  page.text(MARGIN, PAGE_HEIGHT - 52, 'Paisa - Transactions', {size: 20, bold: true});
  page.text(MARGIN, PAGE_HEIGHT - 72, fit(meta.title, 300, 12), {size: 12});
  page.textRight(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 52, `Generated ${plain(meta.generatedOn)}`, {gray: 0.4});
  page.textRight(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 66, `Amounts in ${plain(meta.currency)}`, {gray: 0.4});
  page.text(
    MARGIN,
    PAGE_HEIGHT - 100,
    `Income ${money(income)}    Spent ${money(spent)}    Net ${money(income - spent)}    ${count} ${
      count === 1 ? 'transaction' : 'transactions'
    }`,
    {size: 10, bold: true},
  );

  let y = FIRST_TABLE_TOP;
  tableHeader(page, y);
  y -= ROW_HEIGHT + 4;
  rows.forEach((row, index) => {
    if (y < BOTTOM) {
      page = new Page();
      pages.push(page);
      page.text(MARGIN, PAGE_HEIGHT - 50, 'Paisa - Transactions (continued)', {bold: true, size: 11});
      y = NEXT_TABLE_TOP;
      tableHeader(page, y);
      y -= ROW_HEIGHT + 4;
    }
    if (index % 2 === 1) {
      page.fill(MARGIN, y - 5, PAGE_WIDTH - MARGIN * 2, ROW_HEIGHT, '0.97 0.97 0.97');
    }
    const label = row.merchant || row.description || '';
    const category = row.categoryId ? categoryNames.get(row.categoryId) ?? '' : '';
    const signed = row.type === 'income' ? row.amount : -row.amount;
    page.text(COLUMNS.date.x + 4, y, dateLabel(row.transactionDate));
    page.text(COLUMNS.description.x, y, fit(label, COLUMNS.description.width));
    page.text(COLUMNS.category.x, y, fit(category, COLUMNS.category.width), {gray: 0.35});
    page.text(COLUMNS.type.x, y, fit(rowKind(row), COLUMNS.type.width), {gray: 0.35});
    page.textRight(COLUMNS.amountRight - 4, y, money(signed), {bold: row.type === 'income'});
    y -= ROW_HEIGHT;
  });

  pages.forEach((each, index) => {
    each.textRight(PAGE_WIDTH - MARGIN, 30, `Page ${index + 1} of ${pages.length}`, {size: 8, gray: 0.5});
    each.text(MARGIN, 30, 'Made with Paisa', {size: 8, gray: 0.5});
  });

  // 1 catalog, 2 page tree, 3-4 fonts, then a page and its content per page.
  const objects: string[] = [];
  const pageRefs = pages.map((_, index) => `${5 + index * 2} 0 R`);
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pages.forEach((each, index) => {
    const content = each.ops.join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  // Everything is ASCII, so string offsets are byte offsets.
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

export async function exportTransactionsPdf(
  currency: string,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const [allRows, categories] = await Promise.all([loadTransactions(), loadCategories()]);
  const rows = options.month ? transactionsInMonth(allRows, options.month) : allRows;
  if (rows.length === 0) {
    return {rows: 0, shared: false};
  }

  const pdf = transactionsToPdf(rows, new Map(categories.map(item => [item.id, item.name])), {
    currency,
    title: options.month
      ? options.month.toLocaleDateString('en-IN', {month: 'long', year: 'numeric'})
      : 'All transactions',
    generatedOn: dateLabel(localDateISO()),
  });

  const stamp = options.month ? monthKey(options.month) : localDateISO();
  const file = new File(Paths.cache, `paisa-transactions-${stamp}.pdf`);
  if (file.exists) {
    file.delete();
  }
  file.create();
  await file.write(pdf);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Export transactions',
  });
  return {rows: rows.length, shared: true};
}
