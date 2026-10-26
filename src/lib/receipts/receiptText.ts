// Low-level reading of OCR'd receipt lines: cleaning up common OCR slips,
// finding money amounts, and finding dates. No receipt layout knowledge here;
// that lives in parseReceipt.ts.

/** A money amount found on a line, in whole cents. */
export type MoneyToken = {
  cents: number;
  /** Printed as a credit: `-12.00`, `12.00-`, `(12.00)` or `12.00 CR`. */
  credit: boolean;
  hasDecimals: boolean;
  /** Character offsets of the token in the cleaned line. */
  start: number;
  end: number;
};

const MAX_WHOLE_DIGITS = 9;

/**
 * Fixes the OCR slips that break amounts and dates: a letter O inside a
 * number, and a decimal point split from its digits (`60 .00`, `60. 00`).
 */
export function cleanLine(raw: string): string {
  let line = raw.replace(/\s+/g, ' ').trim();
  let previous = '';
  while (previous !== line) {
    previous = line;
    line = line
      .replace(/(\d)[oO](?=[\d.,])/g, '$10')
      .replace(/(\d)[oO]$/g, '$10')
      .replace(/(\d)[oO](?=\s)/g, '$10');
  }
  return line.replace(/(\d) ?\. ?(\d{2})(?!\d)/g, '$1.$2');
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const MONTH_NAME =
  '(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\\.?';

const DATE_PATTERNS: {
  regex: RegExp;
  read: (m: RegExpExecArray, dayFirst: boolean) => [number, number, number];
}[] = [
  {
    // 2026-10-24, 2026/10/24
    regex: /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
    read: m => [Number(m[1]), Number(m[2]), Number(m[3])],
  },
  {
    // 24 Oct 2026, 24-Oct-26, 24th October, 2026
    regex: new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-/.,]*${MONTH_NAME}[\\s\\-/.,']*(\\d{4}|\\d{2})\\b`,
      'i',
    ),
    read: m => [fullYear(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1])],
  },
  {
    // Oct 24, 2026
    regex: new RegExp(
      `\\b${MONTH_NAME}[\\s\\-/.]*(\\d{1,2})(?:st|nd|rd|th)?[\\s,\\-/.']*(\\d{4}|\\d{2})\\b`,
      'i',
    ),
    read: m => [fullYear(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2])],
  },
  {
    // 24/10/2026, 24-10-26, 10/24/2026 (month first only when it must be)
    regex: /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/,
    read: (m, dayFirst) => {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const year = fullYear(m[3]);
      if (a > 12 && b <= 12) {
        return [year, b, a];
      }
      if (b > 12 && a <= 12) {
        return [year, a, b];
      }
      return dayFirst ? [year, b, a] : [year, a, b];
    },
  },
];

const TIME = /\b\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?\b/gi;

function fullYear(text: string): number {
  const value = Number(text);
  return text.length === 2 ? 2000 + value : value;
}

function isoDay(year: number, month: number, day: number): string | null {
  if (!year || !month || !day || month > 12 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0',
  )}`;
}

/**
 * The first real calendar day printed on the line, as `YYYY-MM-DD`. Days
 * after `latest` (a receipt cannot be from the future) or before 2000 are
 * skipped.
 */
export function findDate(
  line: string,
  options: {dayFirst: boolean; latest: string},
): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.regex.exec(line);
    if (!match) {
      continue;
    }
    const [year, month, day] = pattern.read(match, options.dayFirst);
    const iso = isoDay(year, month, day);
    if (iso && iso >= '2000-01-01' && iso <= options.latest) {
      return iso;
    }
  }
  return null;
}

/** The line with dates and times blanked out, so their digits never read as money. */
export function withoutDatesAndTimes(line: string): string {
  let out = line.replace(TIME, m => ' '.repeat(m.length));
  for (const pattern of DATE_PATTERNS) {
    const global = new RegExp(pattern.regex.source, 'gi');
    out = out.replace(global, m => ' '.repeat(m.length));
  }
  return out;
}

const MONEY =
  /(\()?([-−])?\s?(₹|rs\.?|inr|\$|€|£)?\s?([-−])?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?(\))?(\s?-(?=\s*$)|\s?cr\b)?/gi;

/** Whole numbers longer than this, with no decimals or grouping, are ids or barcodes. */
const MAX_PLAIN_DIGITS = 6;

function isLetter(char: string | undefined): boolean {
  return !!char && /[a-z]/i.test(char);
}

function isAlnum(char: string | undefined): boolean {
  return !!char && /[a-z0-9]/i.test(char);
}

/**
 * Every money-looking number on the line, left to right. Numbers glued to
 * letters (`500ml`, `29ABCDE1234F1Z5`), percentages, masked card digits,
 * ids with leading zeros and barcode-length runs are left out.
 */
export function findMoney(line: string): MoneyToken[] {
  const text = withoutDatesAndTimes(line);
  const tokens: MoneyToken[] = [];
  MONEY.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MONEY.exec(text))) {
    const [
      raw,
      open,
      minusA,
      currency,
      minusB,
      digits,
      fraction,
      close,
      suffix,
    ] = match;
    const whole = raw.trimStart();
    const start = match.index + (raw.length - whole.length);
    const end = start + whole.length;
    const numberStart =
      start +
      whole.indexOf(
        digits,
        currency ? whole.indexOf(currency) + currency.length : 0,
      );
    const numberEnd =
      numberStart +
      digits.length +
      (fraction !== undefined ? fraction.length + 1 : 0);
    const before = currency ? text[start - 1] : text[numberStart - 1];
    const after = text[numberEnd];
    const bare = digits.replace(/,/g, '');
    // "x2" is a count, not a number glued to a word.
    const timesPrefix =
      /[xX×]/.test(before ?? '') && !isLetter(text[numberStart - 2]);
    if (
      (isLetter(before) && !timesPrefix) ||
      (isLetter(after) && !/cr$/i.test(suffix ?? '')) ||
      after === '%' ||
      text[end] === '%' ||
      before === '.' ||
      before === '*' ||
      before === '#' ||
      bare.length > MAX_WHOLE_DIGITS ||
      (bare.length > MAX_PLAIN_DIGITS &&
        fraction === undefined &&
        !digits.includes(',')) ||
      (bare.length > 1 && bare.startsWith('0'))
    ) {
      continue;
    }
    // A hyphen joining a word to a number ("Item-2") is not a minus sign.
    const leadingMinus = Boolean(minusA || minusB) && !isAlnum(text[start - 1]);
    const cents =
      Number(bare) * 100 + (fraction ? Number(fraction.padEnd(2, '0')) : 0);
    tokens.push({
      cents,
      credit: leadingMinus || Boolean(suffix) || Boolean(open && close),
      hasDecimals: fraction !== undefined,
      start,
      end,
    });
  }
  return tokens;
}

/** Count of letters, used to tell a described line from a bare number. */
export function letterCount(text: string): number {
  return (text.match(/[a-z]/gi) ?? []).length;
}
