// Turns the text lines OCR read off a receipt into merchant, date, total and
// line items. Pure and deterministic: every number it returns was printed on
// the receipt or is plain arithmetic on printed numbers, all in whole cents.

import {classifyReceipt, suggestCategory} from './classifyReceipt';
import {
  cleanLine,
  findDate,
  findMoney,
  letterCount,
  MoneyToken,
} from './receiptText';
import {
  ParsedReceipt,
  ReceiptAdjustment,
  ReceiptAdjustmentKind,
  ReceiptCheck,
  ReceiptLineItem,
} from './types';

export type ParseReceiptOptions = {
  /** Today as `YYYY-MM-DD`; later dates are treated as misreads. */
  today: string;
  /** Read `03/04/2026` as 3 April (true, the default) or March 4. */
  dayFirst?: boolean;
};

type Role =
  | {kind: 'meta'}
  | {kind: 'info'}
  | {kind: 'total'; rank: number; refund: boolean}
  | {kind: 'subtotal'}
  | {
      kind: 'adjustment';
      adjustment: ReceiptAdjustmentKind;
      aggregate: boolean;
    }
  | {kind: 'payment'; method: string | null; countsAsTotal: boolean}
  | {kind: 'change'}
  | {kind: 'item'};

// Lines whose numbers are ids, counts or contact details, never money.
const META =
  /\b(gstin|gst\s*(no|in|reg)|pan\s*(no|number|:)|fssai|cin\s*(no|:)|tin\s*(no|:)|vat\s*(no|reg)|invoice\s*(no|number|#)|inv\.?\s*no|bill\s*(no|number|#)|receipt\s*(no|number|#)|order\s*(no|number|id|#)|txn|transaction\s*(id|no)|ref(erence)?\s*(no|id|#|:)|table|tbl|token|kot|(covers?|pax|guests?)\s*:?\s*\d|cashier|server|steward|counter|terminal|till|phone|ph|tel|mob(ile)?|contact|whatsapp|pin\s*code|card\s*(no|number)|a\/c|auth\s*code|approval|rrn|vpa|hsn|sac|s\.?\s*no|sl\.?\s*no)\b/i;

// Printed for information only; adding them would count money twice.
const INFO =
  /\b(you\s*(have\s*)?saved|total\s*(qty|quantity|items?)|no\.?\s*of\s*items|items?\s*:|qty\s*:|incl(usive|\.)?\s*(of\s*)?(all\s*)?tax(es)?|mrp\s*total|points?\s*(earned|balance))\b/i;

const ROUNDING = /\b(round(ed|ing)?\s*-?\s*off|rounding|round\s*adj)/i;
const REFUND_TOTAL =
  /\b(refund\s*(total|amount|due)|total\s*refund|amount\s*refunded|credit\s*(note\s*)?(amount|total)|total\s*credit)\b/i;
const SUBTOTAL =
  /\b(sub\s*-?\s*total|item\s*total|taxable\s*(amount|value|amt)|gross\s*(amount|total|amt)|(amount|total)\s*before\s*tax|net\s*sales?)\b/i;
const AGGREGATE_TAX = /\btotal\s*(tax|gst|vat)\b/i;
const AGGREGATE_DISCOUNT = /\btotal\s*(discount|savings?)\b/i;
const TOTAL_RANKS: [RegExp, number][] = [
  [
    /\b(grand\s*total|net\s*payable|(total\s*)?amount\s*payable|total\s*payable|(total\s*)?amount\s*due|balance\s*due|total\s*due|invoice\s*total|bill\s*total|total\s*bill|net\s*total)\b/i,
    4,
  ],
  [
    /\b(total\s*(amount|amt|inr|rs)|net\s*(amount|amt)|bill\s*(amount|amt)|to\s*pay|you\s*pay|payable)\b/i,
    3,
  ],
  [/\btotal\b/i, 2],
];
const CHARGE =
  /\b(service\s*charge|delivery\s*(fee|charges?)|packing\s*(charges?|fee)|packaging|convenience\s*fee|platform\s*fee|handling\s*(fee|charges?)|tip|gratuity|surcharge)\b/i;
const DISCOUNT =
  /\b(discount|disc|savings?|coupon|promo|voucher|offer|less\s*:|cashback)/i;
const TAX = /\b(c\s?gst|s\s?gst|i\s?gst|u\s?gst|gst|vat|tax|cess)\b/i;
const CHANGE = /\b(change(\s*due)?|balance\s*returned)\b/i;
const PAYMENT: [RegExp, string | null, boolean][] = [
  [/\b(upi|gpay|google\s*pay|phone\s*pe|phonepe|paytm|bhim)\b/i, 'UPI', true],
  [
    /\b(card|visa|master\s*card|rupay|amex|credit\s*card|debit\s*card)\b/i,
    'Card',
    true,
  ],
  [/\b(amount\s*paid|paid\s*amount|total\s*paid|net\s*paid)\b/i, null, true],
  [/\b(cash|tendered)\b/i, 'Cash', false],
  [/\b(paid|payment|net\s*banking|wallet)\b/i, null, false],
];
const RETURN_WORDS =
  /\b(refund(ed)?|return(ed)?|reversal|void(ed)?|cancel(led)?)\b/i;
const ITEM_HEADER =
  /\b(item|description|particulars|product)\b.*\b(qty|quantity|rate|price|amount|amt|mrp)\b/i;

function roleOf(line: string): Role {
  if (INFO.test(line)) {
    return {kind: 'info'};
  }
  if (ROUNDING.test(line)) {
    return {kind: 'adjustment', adjustment: 'rounding', aggregate: false};
  }
  if (REFUND_TOTAL.test(line)) {
    return {kind: 'total', rank: 4, refund: true};
  }
  if (SUBTOTAL.test(line)) {
    return {kind: 'subtotal'};
  }
  if (AGGREGATE_TAX.test(line)) {
    return {kind: 'adjustment', adjustment: 'tax', aggregate: true};
  }
  if (AGGREGATE_DISCOUNT.test(line)) {
    return {kind: 'adjustment', adjustment: 'discount', aggregate: true};
  }
  for (const [pattern, rank] of TOTAL_RANKS) {
    if (pattern.test(line)) {
      return {kind: 'total', rank, refund: false};
    }
  }
  if (META.test(line)) {
    return {kind: 'meta'};
  }
  if (CHARGE.test(line)) {
    return {kind: 'adjustment', adjustment: 'charge', aggregate: false};
  }
  if (DISCOUNT.test(line)) {
    return {kind: 'adjustment', adjustment: 'discount', aggregate: false};
  }
  if (TAX.test(line)) {
    return {kind: 'adjustment', adjustment: 'tax', aggregate: false};
  }
  if (CHANGE.test(line)) {
    return {kind: 'change'};
  }
  for (const [pattern, method, countsAsTotal] of PAYMENT) {
    if (pattern.test(line)) {
      return {kind: 'payment', method, countsAsTotal};
    }
  }
  return {kind: 'item'};
}

type Line = {
  text: string;
  money: MoneyToken[];
  role: Role;
};

/** The amount a line stands for: its right-most number. */
function lineAmount(line: Line): MoneyToken | null {
  return line.money.length ? line.money[line.money.length - 1] : null;
}

/** A summary label printed on one line with its amount on the next. */
function amountFor(lines: Line[], index: number): MoneyToken | null {
  const own = lineAmount(lines[index]);
  if (own) {
    return own;
  }
  const next = lines[index + 1];
  if (next && letterCount(next.text) < 2 && next.money.length) {
    return lineAmount(next);
  }
  return null;
}

const SEPARATORS = /^[\s xX×*@:=/-]*$/;
const MAX_QUANTITY_CENTS = 99_999;

/**
 * In "Soap 1 45.00 40.00 40.00" (qty, MRP, rate, amount), the quantity and
 * unit price are the pair closest to the end that multiplies out to the amount.
 */
function quantityPair(
  run: MoneyToken[],
): {quantity: number; unitCents: number} | null {
  const amount = run[run.length - 1].cents;
  for (let j = run.length - 2; j >= 1; j -= 1) {
    for (let i = j - 1; i >= 0; i -= 1) {
      const q = run[i].cents;
      const u = run[j].cents;
      if (
        q > 0 &&
        q <= MAX_QUANTITY_CENTS &&
        Math.abs(Math.round((q / 100) * u) - amount) <= 1
      ) {
        return {quantity: q / 100, unitCents: u};
      }
    }
  }
  return null;
}

/**
 * Splits an item line into description, quantity and unit price. The amount
 * is the right-most number; quantity and unit price are taken from the
 * numbers before it only when they multiply out to that amount.
 */
function readItem(
  line: Line,
  id: string,
  fallbackDescription: string | null,
): ReceiptLineItem | null {
  const amount = lineAmount(line);
  if (!amount || amount.cents === 0) {
    return null;
  }
  // The run of numbers at the end of the line, separated only by spaces, x or @.
  let runStart = line.money.length - 1;
  while (
    runStart > 0 &&
    SEPARATORS.test(
      line.text.slice(line.money[runStart - 1].end, line.money[runStart].start),
    )
  ) {
    runStart -= 1;
  }
  const run = line.money.slice(runStart);
  let description = line.text
    .slice(0, run[0].start)
    .replace(/[\s:.\-*@xX×]+$/, '')
    .replace(/^\s*\d{1,3}[.)]\s+/, '')
    .trim();
  if (letterCount(description) < 2) {
    if (!fallbackDescription) {
      return null;
    }
    description = fallbackDescription;
  }

  let quantity: number | null = null;
  let unitCents: number | null = null;
  let amountCents = amount.cents;
  const explicitTimes = /[xX×*@]/.test(
    line.text.slice(run[0].start, amount.end),
  );

  if (run.length === 2 && explicitTimes) {
    // "2 x 30.00" with no line amount printed after it.
    const [q, u] = run;
    const product = Math.round((q.cents / 100) * u.cents);
    if (q.cents <= MAX_QUANTITY_CENTS && q.cents > 0) {
      quantity = q.cents / 100;
      unitCents = u.cents;
      amountCents = product;
    }
  } else if (run.length >= 3) {
    const pair = quantityPair(run);
    if (pair) {
      quantity = pair.quantity;
      unitCents = pair.unitCents;
    }
  } else if (run.length === 2) {
    // "Coke 2 80.00": a small whole number before the amount is a count.
    const q = run[0];
    if (!q.hasDecimals && q.cents > 0 && q.cents <= 9_900) {
      quantity = q.cents / 100;
      unitCents = Math.round(amount.cents / quantity);
    }
  }

  const credit =
    amount.credit ||
    RETURN_WORDS.test(description) ||
    DISCOUNT.test(description);
  return {
    id,
    description: tidyText(description),
    quantity,
    unitCents,
    amountCents,
    flow: credit ? 'credit' : 'debit',
  };
}

function tidyText(text: string): string {
  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/^[^\w(]+|[^\w)%.]+$/g, '')
    .trim();
}

const GENERIC_HEADER =
  /^(tax\s*invoice|retail\s*invoice|invoice|bill(\s*of\s*supply)?|cash\s*(memo|bill)|receipt|sales?\s*receipt|estimate|original|duplicate|customer\s*copy|merchant\s*copy|welcome|thank\s*you.*|credit\s*note|refund\s*receipt|return\s*receipt|payment\s*receipt|order\s*summary)$/i;
const ADDRESS =
  /(\b\d{6}\b|\b(road|rd|street|st|lane|ln|nagar|sector|floor|flr|bldg|building|complex|plot|near|opp|cross|layout|colony|market|phase|block|marg|chowk|district|dist|india)\b\.?|@|www\.|\.com\b|\.in\b|,\s*\w+,)/i;

function titleCase(text: string): string {
  if (text !== text.toUpperCase()) {
    return text;
  }
  return text
    .toLowerCase()
    .split(' ')
    .map(word =>
      // Vowel-less words are acronyms: KFC, PVR.
      /^[^aeiouy]{2,}$/.test(word) && /^[a-z]+$/.test(word)
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

function findMerchant(lines: Line[], headerEnd: number): string | null {
  const limit = Math.min(headerEnd, 8);
  for (let i = 0; i < limit; i += 1) {
    const line = lines[i];
    const text = line.text
      .replace(
        /^(welcome\s*to|thank\s*you\s*for\s*(visiting|shopping\s*(at|with)))\s*/i,
        '',
      )
      .replace(/[*=~_#|]+/g, ' ')
      .trim();
    if (
      letterCount(text) < 3 ||
      GENERIC_HEADER.test(text) ||
      line.role.kind === 'meta' ||
      ADDRESS.test(text) ||
      line.money.length > 0 ||
      /\d{3,}/.test(text)
    ) {
      continue;
    }
    return titleCase(tidyText(text));
  }
  for (const line of lines) {
    const match =
      /thank\s*you\s*for\s*(?:visiting|shopping\s*(?:at|with)|dining\s*(?:at|with))\s+(.{3,40})$/i.exec(
        line.text,
      );
    if (match) {
      return titleCase(tidyText(match[1]));
    }
  }
  return null;
}

const DATE_LABEL = /\b(date|dt|dated)\b/i;

function receiptDate(
  lines: Line[],
  options: {dayFirst: boolean; latest: string},
): string | null {
  const labeled = lines.filter(line => DATE_LABEL.test(line.text));
  for (const line of [...labeled, ...lines]) {
    const found = findDate(line.text, options);
    if (found) {
      return found;
    }
  }
  return null;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function signed(token: MoneyToken, forceCredit = false): number {
  return token.credit || forceCredit ? -token.cents : token.cents;
}

/**
 * Keeps one of each kind of adjustment: an aggregate line ("Total GST") is
 * dropped when the itemised lines it sums ("CGST", "SGST") are also printed.
 */
function dedupeAdjustments(
  found: (ReceiptAdjustment & {aggregate: boolean})[],
): ReceiptAdjustment[] {
  return found
    .filter(
      item =>
        !item.aggregate ||
        !found.some(other => other.kind === item.kind && !other.aggregate),
    )
    .map(({label, kind, cents}) => ({label, kind, cents}));
}

/** Within a cent, or within a rupee when the printed total is a whole rupee amount. */
function agrees(total: number, computed: number): boolean {
  const gap = Math.abs(total - computed);
  return gap <= 1 || (gap < 100 && total % 100 === 0);
}

export function itemsNetCents(items: ReceiptLineItem[]): number {
  let net = 0;
  for (const item of items) {
    net += item.flow === 'credit' ? -item.amountCents : item.amountCents;
  }
  return net;
}

/**
 * Compares the printed total with what the items (or printed subtotal) and
 * the adjustments add up to. Taxes are tried both added on and as already
 * included, since many receipts print a GST breakup of tax-inclusive prices.
 */
export function checkReceipt(input: {
  totalCents: number | null;
  subtotalCents: number | null;
  items: ReceiptLineItem[];
  adjustments: ReceiptAdjustment[];
}): {check: ReceiptCheck; computedCents: number | null; extrasCents: number} {
  const {totalCents, subtotalCents, items, adjustments} = input;
  const base =
    subtotalCents ?? (items.length > 0 ? itemsNetCents(items) : null);
  // On a return, the tax and charges are handed back too.
  const direction = base !== null && base < 0 ? -1 : 1;
  const all =
    direction * adjustments.reduce((sum, item) => sum + item.cents, 0);
  const withoutTax =
    direction *
    adjustments
      .filter(item => item.kind !== 'tax')
      .reduce((sum, item) => sum + item.cents, 0);

  if (base === null) {
    if (totalCents !== null) {
      return {
        check: {status: 'total_only'},
        computedCents: null,
        extrasCents: all,
      };
    }
    return {check: {status: 'none'}, computedCents: null, extrasCents: all};
  }
  const computed = base + all;
  if (totalCents === null) {
    return {
      check: {status: 'computed'},
      computedCents: computed,
      extrasCents: all,
    };
  }
  const total = Math.abs(totalCents);
  const hit = [all, withoutTax, 0].find(extras =>
    agrees(total, Math.abs(base + extras)),
  );
  if (hit !== undefined) {
    return {
      check: {status: 'matched'},
      computedCents: base + hit,
      extrasCents: hit,
    };
  }
  return {
    check: {status: 'mismatch', differenceCents: total - Math.abs(computed)},
    computedCents: computed,
    extrasCents: all,
  };
}

export function parseReceipt(
  rawLines: string[],
  options: ParseReceiptOptions,
): ParsedReceipt {
  const dayFirst = options.dayFirst ?? true;
  const latest = addDays(options.today, 1);
  const lines: Line[] = rawLines
    .map(cleanLine)
    .filter(text => text.length > 0)
    .map(text => {
      const role = roleOf(text);
      return {
        text,
        role,
        money:
          role.kind === 'meta' || role.kind === 'info' ? [] : findMoney(text),
      };
    });

  const items: ReceiptLineItem[] = [];
  const adjustments: (ReceiptAdjustment & {aggregate: boolean})[] = [];
  const totals: {token: MoneyToken; rank: number; refund: boolean}[] = [];
  let subtotal: MoneyToken | null = null;
  let paymentMethod: string | null = null;
  let firstItem = -1;
  let firstSummary = -1;
  // With a column header row ("Item Qty Rate Amount"), items only start below it.
  const headerRow = lines.findIndex(
    line => ITEM_HEADER.test(line.text) && line.money.length === 0,
  );
  let itemsStarted = false;
  let pendingDescription: string | null = null;

  lines.forEach((line, index) => {
    const {role} = line;
    if (role.kind === 'payment' && role.method && !paymentMethod) {
      paymentMethod = role.method;
    }
    if (ITEM_HEADER.test(line.text) && line.money.length === 0) {
      itemsStarted = true;
      pendingDescription = null;
      return;
    }
    const summaryLine =
      role.kind === 'total' ||
      role.kind === 'subtotal' ||
      (role.kind === 'adjustment' && role.adjustment !== 'discount');
    if (summaryLine && firstSummary === -1 && amountFor(lines, index)) {
      firstSummary = index;
    }

    switch (role.kind) {
      case 'total': {
        const token = amountFor(lines, index);
        if (token) {
          totals.push({token, rank: role.rank, refund: role.refund});
        }
        return;
      }
      case 'subtotal': {
        const token = amountFor(lines, index);
        if (token && !subtotal) {
          subtotal = token;
        }
        return;
      }
      case 'adjustment': {
        const token = amountFor(lines, index);
        if (!token || token.cents === 0) {
          return;
        }
        const inItems = firstSummary === -1 && role.adjustment === 'discount';
        if (inItems && items.length > 0) {
          // An item-level discount printed among the items.
          const item = readItem(line, `item-${index}`, null);
          if (item) {
            items.push({...item, flow: 'credit'});
          }
          return;
        }
        const cents =
          role.adjustment === 'discount'
            ? -token.cents
            : role.adjustment === 'rounding'
            ? signed(token)
            : token.cents;
        adjustments.push({
          label:
            tidyText(
              line.text.slice(0, line.money[0]?.start ?? line.text.length),
            ) || role.adjustment,
          kind: role.adjustment,
          cents,
          aggregate: role.aggregate,
        });
        return;
      }
      case 'payment': {
        const token = lineAmount(line);
        if (token && role.countsAsTotal) {
          totals.push({token, rank: 1, refund: false});
        }
        return;
      }
      case 'item': {
        if (
          firstSummary !== -1 ||
          index < headerRow ||
          (!itemsStarted && ADDRESS.test(line.text))
        ) {
          return;
        }
        if (line.money.length === 0) {
          // A name whose numbers OCR put on the next line.
          pendingDescription =
            itemsStarted && letterCount(line.text) >= 2 ? line.text : null;
          return;
        }
        const item = readItem(
          line,
          `item-${index}`,
          itemsStarted ? pendingDescription : null,
        );
        pendingDescription = null;
        if (item) {
          items.push(item);
          itemsStarted = true;
          if (firstItem === -1) {
            firstItem = index;
          }
        }
        return;
      }
      default:
        return;
    }
  });

  const best = totals.reduce<(typeof totals)[number] | null>(
    (current, candidate) =>
      !current || candidate.rank >= current.rank ? candidate : current,
    null,
  );
  const totalSigned = best ? signed(best.token, best.refund) : null;
  const totalCents = totalSigned === null ? null : Math.abs(totalSigned);
  const subtotalCents = subtotal ? signed(subtotal) : null;
  const finalAdjustments = dedupeAdjustments(adjustments);
  const {check, computedCents, extrasCents} = checkReceipt({
    totalCents: totalSigned,
    subtotalCents,
    items,
    adjustments: finalAdjustments,
  });

  const headerEnd = [firstItem, firstSummary, lines.length]
    .filter(value => value >= 0)
    .reduce((a, b) => Math.min(a, b));
  const merchant = findMerchant(lines, headerEnd);
  const netSign = Math.sign(totalSigned ?? computedCents ?? 0) as -1 | 0 | 1;
  const texts = lines.map(line => line.text);
  const classification = classifyReceipt({
    lines: texts,
    netSign,
    items,
  });

  return {
    merchant,
    date: receiptDate(lines, {dayFirst, latest}),
    totalCents,
    subtotalCents: subtotalCents === null ? null : Math.abs(subtotalCents),
    lineItems: items,
    adjustments: finalAdjustments,
    extrasCents,
    paymentMethod,
    amountCents:
      totalCents ?? (computedCents === null ? null : Math.abs(computedCents)),
    check,
    classification,
    suggestedCategoryId: suggestCategory({
      type: classification.type,
      merchant,
      lines: texts,
    }),
    rawLines,
  };
}
