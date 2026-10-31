import {cycleFor} from './budgetCycle';

/**
 * The budget for one budget cycle (the calendar month, or payday to payday),
 * worked out at read time from raw facts: the monthly budget, the savings
 * goal, the month's bills and what was spent. Nothing derived is stored, so
 * an edited or deleted expense, or days without opening the app, need no
 * catch-up: the same facts always give the same limits.
 *
 *   spendable   = budget - bills - savings goal + adjustments
 *   remaining   = spendable - spent before today
 *   daily limit = max(0, remaining) / days left, today included
 *
 * One rolling limit, recalculated every day: money not spent raises the days
 * after it, overspending lowers them, and what is left when the cycle ends is
 * extra savings. Weeks are only a way of showing it.
 *
 * Money is worked in whole paise and limits round down to the paisa, so a
 * limit never offers money that is not there; the paise it drops stay in
 * `remaining` for the days after. Rupees go in and come out; nothing in
 * between is floating point.
 */

/** Days at the end of a cycle when a new budget waits for the next one (handbook 5.5). */
export const END_OF_MONTH_THRESHOLD = 3;

/** Whole cycles without opening Paisa that restart the setup (handbook 5.6). */
export const LONG_ABSENCE_CYCLES = 1;

/** A budget cycle as local calendar days, `YYYY-MM-DD`, both included. */
export type CycleRange = {start: string; end: string};

export type BillStatus =
  /** Paid in the ledger: `paid` holds what it actually cost. */
  | 'paid'
  /** Due later this cycle; added for the user on its due day. */
  | 'upcoming'
  /** The user said it is not paid yet: reserved until they pay it. */
  | 'notPaid'
  /** Paid where Paisa cannot see it (before sign-up, or not logged). */
  | 'paidOutside'
  /** Not owed this cycle. */
  | 'skipped';

/** One monthly bill in one cycle. */
export type BillInstance = {
  key: string;
  label: string;
  /** What it is planned to cost. */
  planned: number;
  /** What was actually paid, when it is paid. */
  paid?: number;
  status: BillStatus;
  /**
   * Unpaid when an earlier cycle closed. That cycle held its money back, so
   * the money comes with it: this cycle's own budget is not charged again.
   */
  carried?: boolean;
  /** Due date in this cycle, `YYYY-MM-DD`, when it has one. */
  dueDate?: string;
};

export type MonthInputs = {
  cycle: CycleRange;
  /** The monthly budget: everything for the month, bills and savings goal included. */
  total: number;
  savingsGoal: number;
  bills: BillInstance[];
  /** One-off expenses marked fixed (fees, repairs): set aside like bills. */
  fixedOneOffs?: number;
  /** Top-ups, last month's extra moved in, and moves back to savings (negative). */
  adjustments?: number;
  /** Spent before tracking began this cycle, as the user remembers it. */
  alreadySpent?: number;
  /**
   * First day whose spending counts. Earlier days of the cycle are not
   * tracked. A day after `cycle.end` means the budget has not started.
   */
  countFrom?: string;
  /** Day-to-day spending per day; bills and fixed expenses left out. */
  spendByDate: Record<string, number>;
  /** False when bills and the goal take more than the budget (see validatePlan). */
  planValid?: boolean;
};

export type WeekDisplay = {
  start: string;
  end: string;
  /** The week's daily limits added up. Shown, never enforced. */
  total: number;
  spent: number;
};

export type MonthState = {
  /** `waiting`: the budget starts on `startsOn`. `invalid`: the plan needs fixing first. */
  kind: 'active' | 'waiting' | 'invalid';
  cycle: CycleRange;
  today: string;
  startsOn: string | null;
  /** Tracking began after the cycle's first day: a partial month. */
  partialFrom: string | null;
  total: number;
  savingsGoal: number;
  /** Bills (as paid, or as planned until then) and one-off fixed expenses. */
  fixed: number;
  adjustments: number;
  spendable: number;
  alreadySpent: number;
  /** Spent before today, the already-spent amount included. */
  spentBeforeToday: number;
  spentToday: number;
  /** Spent through today, the already-spent amount included. */
  spent: number;
  /** Days left in the cycle, today included. */
  remainingDays: number;
  dailyLimit: number;
  /** Today's limit less today's spending; negative when today went over. */
  todayLeft: number;
  /** Spendable less everything spent; negative when the month is overspent. */
  remaining: number;
  overspent: boolean;
  overspentBy: number;
  /** Exactly nothing left. */
  usedUp: boolean;
  /** Bills and the goal leave nothing to spend this cycle. */
  zeroSpendable: boolean;
  /** What would be extra savings if nothing else were spent. */
  projectedExtra: number;
  week: WeekDisplay;
};

export type MonthClose = {
  cycle: CycleRange;
  partialFrom: string | null;
  spendable: number;
  spent: number;
  /** Unspent spendable money; 0 for an overspent month, never negative. */
  extraSavings: number;
  overspentBy: number;
  /** Bills still unpaid: they carry into the next cycle. */
  unpaidBills: BillInstance[];
};

export type PlanCheck = {
  /** `over`: bills and the goal take more than the budget. `zero`: they take all of it. */
  status: 'ok' | 'zero' | 'over';
  spendable: number;
  /** How much the budget is short by, when `over`. */
  shortBy: number;
};

export type BudgetFlow = 'normal' | 'midMonth' | 'startNextMonth';

// ---------------------------------------------------------------------------
// Money and days

type Paise = number;

/**
 * Rupees to whole paise, half a paisa rounding up; anything not a finite
 * number is 0. Float noise is cut first (33.335 * 100 is 3333.4999...), so
 * this rounds like the native side's BigDecimal setScale(2, HALF_UP).
 */
export function toPaise(amount: number | null | undefined): Paise {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return 0;
  }
  const paise = Number((Math.abs(value) * 100).toPrecision(15));
  return Math.sign(value) * Math.round(paise) + 0;
}

function rupees(paise: Paise): number {
  return paise / 100 + 0; // folds -0 into 0
}

function positive(paise: Paise): Paise {
  return paise > 0 ? paise : 0;
}

function dayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}

/** Days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function addDaysISO(iso: string, days: number): string {
  const date = new Date((dayNumber(iso) + days) * 86400000);
  return date.toISOString().slice(0, 10);
}

function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

function earlierOf(a: string, b: string): string {
  return a < b ? a : b;
}

/** Monday of the week holding `iso`. */
function mondayOf(iso: string): string {
  // 1970-01-01 was a Thursday, day 0; Monday is day 4 mod 7.
  const offset = (((dayNumber(iso) - 4) % 7) + 7) % 7;
  return addDaysISO(iso, -offset);
}

export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function cycleRangeFor(day: string, payday?: number | null): CycleRange {
  const [year, month, date] = day.split('-').map(Number);
  const cycle = cycleFor(new Date(year, month - 1, date), payday);
  return {start: isoDay(cycle.start), end: isoDay(cycle.end)};
}

/** Days in a cycle. */
export function cycleLength(cycle: CycleRange): number {
  return daysBetween(cycle.start, cycle.end) + 1;
}

/** Days left in the cycle from `today`, today included; 0 once it is over. */
export function remainingDays(today: string, cycle: CycleRange): number {
  if (today > cycle.end) {
    return 0;
  }
  return daysBetween(laterOf(today, cycle.start), cycle.end) + 1;
}

// ---------------------------------------------------------------------------
// The month's parts

function billCost(bill: BillInstance): Paise {
  switch (bill.status) {
    case 'skipped':
      return 0;
    case 'paid':
      return positive(toPaise(bill.paid ?? bill.planned));
    case 'paidOutside':
      return positive(toPaise(bill.paid ?? bill.planned));
    default:
      return positive(toPaise(bill.planned));
  }
}

/** Money last cycle held back for bills it carried over. */
function carriedFunding(bills: BillInstance[]): Paise {
  return bills.reduce(
    (sum, bill) => (bill.carried ? sum + positive(toPaise(bill.planned)) : sum),
    0,
  );
}

/** What bills and fixed one-offs take out of the month: paid ones as paid, the rest as planned. */
export function fixedTotal(bills: BillInstance[], fixedOneOffs = 0): number {
  return rupees(fixedPaise(bills, fixedOneOffs));
}

function fixedPaise(bills: BillInstance[], fixedOneOffs = 0): Paise {
  return bills.reduce((sum, bill) => sum + billCost(bill), positive(toPaise(fixedOneOffs)));
}

function spendablePaise(inputs: MonthInputs): Paise {
  return (
    positive(toPaise(inputs.total)) -
    fixedPaise(inputs.bills, inputs.fixedOneOffs) -
    positive(toPaise(inputs.savingsGoal)) +
    toPaise(inputs.adjustments ?? 0) +
    carriedFunding(inputs.bills)
  );
}

/** Budget less bills less the savings goal, plus the month's adjustments. */
export function spendableTotal(inputs: MonthInputs): number {
  return rupees(spendablePaise(inputs));
}

/**
 * The check onboarding and settings run before saving a plan: bills and the
 * savings goal must fit in the budget. `bills` is every active bill at its
 * planned amount, a normal month's worth.
 */
export function validatePlan(total: number, bills: number, savingsGoal: number): PlanCheck {
  const spendable =
    positive(toPaise(total)) - positive(toPaise(bills)) - positive(toPaise(savingsGoal));
  return {
    status: spendable < 0 ? 'over' : spendable === 0 ? 'zero' : 'ok',
    spendable: rupees(positive(spendable)),
    shortBy: rupees(positive(-spendable)),
  };
}

function countFromOf(inputs: MonthInputs): string {
  return laterOf(inputs.countFrom ?? inputs.cycle.start, inputs.cycle.start);
}

/** Spending per counted day, in paise. */
function spendPaise(inputs: MonthInputs): Map<string, Paise> {
  const from = countFromOf(inputs);
  const spend = new Map<string, Paise>();
  for (const [date, amount] of Object.entries(inputs.spendByDate)) {
    if (date < from || date > inputs.cycle.end) {
      continue;
    }
    spend.set(date, (spend.get(date) ?? 0) + toPaise(amount));
  }
  return spend;
}

function sumBetween(spend: Map<string, Paise>, from: string, toExclusive: string): Paise {
  let sum = 0;
  for (const [date, amount] of spend) {
    if (date >= from && date < toExclusive) {
      sum += amount;
    }
  }
  return sum;
}

/** max(0, remaining) over the days left, rounded down to the paisa. */
function limitPaise(remaining: Paise, days: number): Paise {
  return days > 0 ? Math.floor(positive(remaining) / days) : 0;
}

/**
 * Today's limit and everything the dashboard shows for the cycle holding
 * `today`. `inputs.cycle` must be that cycle.
 */
export function monthState(inputs: MonthInputs, today: string): MonthState {
  const {cycle} = inputs;
  const countFrom = countFromOf(inputs);
  const spend = spendPaise(inputs);
  const spendable = spendablePaise(inputs);
  const already = positive(toPaise(inputs.alreadySpent ?? 0));
  const tracked = countFrom <= cycle.end;
  const dayToCount = laterOf(today, countFrom);

  const before = already + sumBetween(spend, countFrom, today);
  const todaySpend = spend.get(today) ?? 0;
  const days = remainingDays(today, cycle);
  const limit = limitPaise(spendable - before, days);
  const remaining = spendable - before - todaySpend;

  // Days before today get the limit they had; today and the rest of the
  // week are shown at today's limit, what they get if it is kept to.
  const weekStart = laterOf(laterOf(mondayOf(today), cycle.start), countFrom);
  const weekEnd = earlierOf(addDaysISO(mondayOf(today), 6), cycle.end);
  let weekTotal = 0;
  let weekSpent = 0;
  for (let day = weekStart; day <= weekEnd; day = addDaysISO(day, 1)) {
    if (day < today) {
      weekTotal += limitPaise(
        spendable - already - sumBetween(spend, countFrom, day),
        remainingDays(day, cycle),
      );
      weekSpent += spend.get(day) ?? 0;
    } else {
      weekTotal += limit;
      if (day === today) {
        weekSpent += todaySpend;
      }
    }
  }

  const kind: MonthState['kind'] = !tracked || today < countFrom
    ? 'waiting'
    : inputs.planValid === false
      ? 'invalid'
      : 'active';

  return {
    kind,
    cycle,
    today,
    startsOn: kind === 'waiting' ? countFrom : null,
    partialFrom: countFrom > cycle.start && tracked ? countFrom : null,
    total: rupees(positive(toPaise(inputs.total))),
    savingsGoal: rupees(positive(toPaise(inputs.savingsGoal))),
    fixed: rupees(fixedPaise(inputs.bills, inputs.fixedOneOffs)),
    adjustments: rupees(toPaise(inputs.adjustments ?? 0) + carriedFunding(inputs.bills)),
    spendable: rupees(spendable),
    alreadySpent: rupees(already),
    spentBeforeToday: rupees(before),
    spentToday: rupees(todaySpend),
    spent: rupees(before + todaySpend),
    remainingDays: dayToCount > cycle.end ? 0 : days,
    dailyLimit: rupees(limit),
    todayLeft: rupees(limit - todaySpend),
    remaining: rupees(remaining),
    overspent: remaining < 0,
    overspentBy: rupees(positive(-remaining)),
    usedUp: remaining === 0 && spendable > 0,
    zeroSpendable: spendable <= 0,
    projectedExtra: rupees(positive(remaining)),
    week: {
      start: weekStart,
      end: weekEnd,
      total: rupees(weekTotal),
      spent: rupees(weekSpent),
    },
  };
}

/**
 * How a finished cycle ended. Unspent spendable money is extra savings, kept
 * apart from the goal; an overspent month has none and nothing carries into
 * the next one. Bills the user said are not paid carry over with the money
 * this cycle held back for them.
 */
export function closeMonth(inputs: MonthInputs): MonthClose {
  const countFrom = countFromOf(inputs);
  const spendable = spendablePaise(inputs);
  const spent =
    positive(toPaise(inputs.alreadySpent ?? 0)) +
    sumBetween(spendPaise(inputs), countFrom, addDaysISO(inputs.cycle.end, 1));
  return {
    cycle: inputs.cycle,
    partialFrom: countFrom > inputs.cycle.start ? countFrom : null,
    spendable: rupees(spendable),
    spent: rupees(spent),
    extraSavings: rupees(positive(spendable - spent)),
    overspentBy: rupees(positive(spent - spendable)),
    unpaidBills: inputs.bills.filter(bill => bill.status === 'notPaid'),
  };
}

// ---------------------------------------------------------------------------
// Starting, and coming back

/**
 * The date check onboarding (and the move to this budget) runs first. On a
 * cycle's first day the month runs in full; with more than
 * END_OF_MONTH_THRESHOLD days left it starts today; in the last days it waits
 * for the next cycle.
 */
export function budgetFlowFor(today: string, cycle: CycleRange): BudgetFlow {
  if (today <= cycle.start) {
    return 'normal';
  }
  return remainingDays(today, cycle) > END_OF_MONTH_THRESHOLD ? 'midMonth' : 'startNextMonth';
}

/** The first day of the cycle after the one holding `day`. */
export function nextCycleStart(day: string, payday?: number | null): string {
  return addDaysISO(cycleRangeFor(day, payday).end, 1);
}

/**
 * Cycles from the one holding `from` to the one holding `to`: 0 for the
 * same cycle, 1 for the next.
 */
export function cyclesBetween(from: string, to: string, payday?: number | null): number {
  if (to <= from) {
    return 0;
  }
  const target = cycleRangeFor(to, payday).start;
  let start = cycleRangeFor(from, payday).start;
  let count = 0;
  // Bounded: a hundred years of cycles is far past any real gap.
  while (start < target && count < 1200) {
    start = nextCycleStart(start, payday);
    count += 1;
  }
  return count;
}

/** At least LONG_ABSENCE_CYCLES whole cycles went by without Paisa being opened. */
export function isLongAbsence(
  lastActive: string | null,
  today: string,
  payday?: number | null,
): boolean {
  return lastActive !== null && cyclesBetween(lastActive, today, payday) > LONG_ABSENCE_CYCLES;
}

// ---------------------------------------------------------------------------
// Savings

export type SavingsMove = {
  kind: 'top_up' | 'move_to_budget' | 'move_to_savings';
  amount: number;
};

/**
 * Extra savings kept over the months: each closed month's extra, less what
 * went back into a budget, plus what was moved back out of one. Top-ups are
 * new money for the budget and do not touch it.
 */
export function savingsPool(
  months: {extraSavings: number; toBudget: number}[],
  moves: SavingsMove[],
): number {
  let pool = 0;
  for (const month of months) {
    pool += positive(toPaise(month.extraSavings)) - positive(toPaise(month.toBudget));
  }
  for (const move of moves) {
    if (move.kind === 'move_to_budget') {
      pool -= positive(toPaise(move.amount));
    } else if (move.kind === 'move_to_savings') {
      pool += positive(toPaise(move.amount));
    }
  }
  return rupees(positive(pool));
}

/** What a cycle's adjustments add to its spendable money. */
export function adjustmentTotal(moves: SavingsMove[], rolledIn = 0): number {
  let total = positive(toPaise(rolledIn));
  for (const move of moves) {
    const amount = positive(toPaise(move.amount));
    total += move.kind === 'move_to_savings' ? -amount : amount;
  }
  return rupees(total);
}
