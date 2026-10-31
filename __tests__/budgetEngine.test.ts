import {
  BillInstance,
  END_OF_MONTH_THRESHOLD,
  MonthInputs,
  addDaysISO,
  adjustmentTotal,
  budgetFlowFor,
  closeMonth,
  cycleLength,
  cycleRangeFor,
  cyclesBetween,
  daysBetween,
  fixedTotal,
  isLongAbsence,
  monthState,
  nextCycleStart,
  remainingDays,
  savingsPool,
  spendableTotal,
  validatePlan,
} from '../src/lib/budgetEngine';

// November 2026 has 30 days, like the handbook's worked example.
const NOV = {start: '2026-11-01', end: '2026-11-30'};

const rent = (patch: Partial<BillInstance> = {}): BillInstance => ({
  key: 'rent',
  label: 'Rent',
  planned: 5000,
  status: 'paid',
  paid: 5000,
  ...patch,
});

/** The handbook's example: ₹9,000 budget, ₹5,000 of bills, ₹2,000 goal. */
function example(patch: Partial<MonthInputs> = {}): MonthInputs {
  return {
    cycle: NOV,
    total: 9000,
    savingsGoal: 2000,
    bills: [rent()],
    spendByDate: {},
    ...patch,
  };
}

function day(n: number, cycle = NOV): string {
  return addDaysISO(cycle.start, n - 1);
}

describe('the worked example (handbook section 3)', () => {
  it('sets bills and the goal aside before splitting the rest over the days', () => {
    expect(spendableTotal(example())).toBe(2000);
    expect(monthState(example(), day(1)).dailyLimit).toBe(66.66);
  });

  it('raises the limit after a quiet week, lowers it after a big day, and ends in extra savings', () => {
    expect(monthState(example(), day(8)).dailyLimit).toBe(86.95);

    const spent800 = example({spendByDate: {[day(8)]: 800}});
    expect(monthState(spent800, day(8)).todayLeft).toBe(-713.05);
    expect(monthState(spent800, day(9)).dailyLimit).toBe(54.54);
    expect(monthState(spent800, day(9)).remaining).toBe(1200);

    const endsWith150 = example({spendByDate: {[day(8)]: 800, [day(20)]: 1050}});
    expect(closeMonth(endsWith150).extraSavings).toBe(150);
  });

  it('matches the conversation example: ₹500 over 30 days', () => {
    const small = example({total: 7500});
    expect(spendableTotal(small)).toBe(500);
    expect(monthState(small, day(1)).dailyLimit).toBe(16.66);
    expect(monthState(small, day(8)).dailyLimit).toBe(21.73);
    expect(monthState({...small, spendByDate: {[day(8)]: 200}}, day(9)).dailyLimit).toBe(13.63);
  });
});

describe('section 7 scenarios', () => {
  it('a week with no spending raises the limit smoothly, with no lump sum', () => {
    const limits = [1, 2, 3, 4, 5, 6, 7, 8].map(n => monthState(example(), day(n)).dailyLimit);
    for (let i = 1; i < limits.length; i += 1) {
      expect(limits[i]).toBeGreaterThan(limits[i - 1]);
      expect(limits[i] - limits[i - 1]).toBeLessThan(5);
    }
    expect(monthState(example(), day(8)).remaining).toBe(2000);
  });

  it('a quiet week 1 then an overspent week 2 flow through the same formula', () => {
    const inputs = example({spendByDate: {[day(9)]: 400, [day(10)]: 400, [day(11)]: 400}});
    const afterWeek1 = monthState(inputs, day(8)).dailyLimit;
    const afterWeek2 = monthState(inputs, day(15)).dailyLimit;
    expect(afterWeek1).toBeGreaterThan(66.66);
    expect(afterWeek2).toBeLessThan(afterWeek1);
    expect(afterWeek2).toBe(50); // (2000 - 1200) / 16
  });

  it('an overspent month shows 0 and how far over, and has no extra savings', () => {
    const over = example({spendByDate: {[day(3)]: 2300}});
    const state = monthState(over, day(10));
    expect(state.dailyLimit).toBe(0);
    expect(state.overspent).toBe(true);
    expect(state.overspentBy).toBe(300);
    expect(state.remaining).toBe(-300);
    // The goal is untouched: spending never reaches into it.
    expect(state.savingsGoal).toBe(2000);
    expect(closeMonth(over)).toMatchObject({extraSavings: 0, overspentBy: 300});
  });

  it('exactly nothing left is used up, not overspent', () => {
    const state = monthState(example({spendByDate: {[day(3)]: 2000}}), day(3));
    expect(state).toMatchObject({usedUp: true, overspent: false, remaining: 0});
  });

  it('an overspent user who adds money gets the limit back and the label clears', () => {
    const over = example({spendByDate: {[day(3)]: 2300}});
    const recovered = monthState({...over, adjustments: 1000}, day(10));
    expect(recovered.overspent).toBe(false);
    expect(recovered.dailyLimit).toBe(33.33); // 700 / 21
  });

  it('an overspent month carries nothing into the next', () => {
    expect(closeMonth(example({spendByDate: {[day(3)]: 2300}})).extraSavings).toBe(0);
    // The next month is worked out from its own budget alone.
    const dec = {start: '2026-12-01', end: '2026-12-31'};
    expect(monthState(example({cycle: dec}), dec.start).dailyLimit).toBe(64.51);
  });

  it('spending exactly the limit every day keeps it steady and leaves no extra', () => {
    const spend: Record<string, number> = {};
    const limits: number[] = [];
    for (let n = 1; n <= 30; n += 1) {
      const limit = monthState(example({spendByDate: spend}), day(n)).dailyLimit;
      limits.push(limit);
      spend[day(n)] = limit;
    }
    expect(Math.max(...limits) - Math.min(...limits)).toBeLessThanOrEqual(0.02);
    expect(closeMonth(example({spendByDate: spend})).extraSavings).toBe(0);
  });

  it('a mid-month join uses only the days left', () => {
    const joined = example({countFrom: day(15)});
    const state = monthState(joined, day(15));
    expect(state.remainingDays).toBe(16);
    expect(state.dailyLimit).toBe(125);
    expect(state.partialFrom).toBe(day(15));
  });

  it('spending before tracking began is not counted', () => {
    const joined = example({countFrom: day(15), spendByDate: {[day(2)]: 900, [day(15)]: 25}});
    expect(monthState(joined, day(15))).toMatchObject({spentToday: 25, spentBeforeToday: 0});
  });

  it('an edited budget or goal counts from that day; spending so far stays', () => {
    const inputs = example({spendByDate: {[day(2)]: 500}});
    const raised = monthState({...inputs, total: 10500}, day(11));
    expect(raised.remaining).toBe(3000);
    expect(raised.dailyLimit).toBe(150); // 3000 / 20
    const moreSaving = monthState({...inputs, savingsGoal: 2500}, day(11));
    expect(moreSaving.dailyLimit).toBe(50); // 1000 / 20
  });

  it('extra money added raises spendable and the limit', () => {
    const topped = example({adjustments: adjustmentTotal([{kind: 'top_up', amount: 600}])});
    expect(spendableTotal(topped)).toBe(2600);
    expect(monthState(topped, day(1)).dailyLimit).toBe(86.66);
  });

  it('a one-off fixed expense comes off up front, not out of a day', () => {
    const fees = example({fixedOneOffs: 600});
    expect(spendableTotal(fees)).toBe(1400);
    const state = monthState(fees, day(5));
    expect(state.spentToday).toBe(0);
    expect(state.fixed).toBe(5600);
  });

  it('the last day gets everything left', () => {
    const inputs = example({spendByDate: {[day(5)]: 1234.56}});
    const last = monthState(inputs, day(30));
    expect(last.remainingDays).toBe(1);
    expect(last.dailyLimit).toBe(765.44);
  });

  it('bills and the goal taking the whole budget leave a 0 limit', () => {
    const none = example({total: 7000});
    expect(validatePlan(7000, 5000, 2000).status).toBe('zero');
    expect(monthState(none, day(1))).toMatchObject({dailyLimit: 0, zeroSpendable: true});
  });

  it('bills and the goal over the budget fail validation', () => {
    expect(validatePlan(6500, 5000, 2000)).toEqual({status: 'over', spendable: 0, shortBy: 500});
    expect(validatePlan(9000, 5000, 2000)).toEqual({status: 'ok', spendable: 2000, shortBy: 0});
    const invalid = monthState(example({total: 6500, planValid: false}), day(1));
    expect(invalid.kind).toBe('invalid');
    expect(invalid.dailyLimit).toBe(0);
  });

  it.each([
    ['February 2027', '2027-02-10', 28],
    ['February 2028', '2028-02-10', 29],
    ['November 2026', '2026-11-10', 30],
    ['October 2026', '2026-10-10', 31],
  ])('%s uses its real length', (_name, date, length) => {
    const cycle = cycleRangeFor(date);
    expect(cycleLength(cycle)).toBe(length);
    expect(remainingDays(cycle.start, cycle)).toBe(length);
    const state = monthState(example({cycle}), cycle.start);
    expect(state.dailyLimit).toBe(Math.floor(200000 / length) / 100);
  });

  it('an edited or deleted expense is just a new ledger: nothing stored to fix', () => {
    const before = monthState(example({spendByDate: {[day(2)]: 300}}), day(5));
    const edited = monthState(example({spendByDate: {[day(2)]: 100}}), day(5));
    const deleted = monthState(example({spendByDate: {}}), day(5));
    expect(edited.dailyLimit).toBeGreaterThan(before.dailyLimit);
    expect(deleted.dailyLimit).toBe(monthState(example(), day(5)).dailyLimit);
  });

  it('days without opening the app need no catch-up', () => {
    const inputs = example({spendByDate: {[day(2)]: 300}});
    expect(monthState(inputs, day(20))).toEqual(monthState(inputs, day(20)));
    expect(monthState(inputs, day(20)).dailyLimit).toBe(154.54); // 1700 / 11
  });

  it('a bill still unpaid at month end is not extra savings and carries over with its money', () => {
    const unpaid = example({bills: [rent({status: 'notPaid', paid: undefined})]});
    const close = closeMonth(unpaid);
    expect(close.extraSavings).toBe(2000);
    expect(close.unpaidBills.map(bill => bill.key)).toEqual(['rent']);

    // Next month holds it back again, but with last month's money for it, so
    // its own spendable is not charged twice.
    const dec = {start: '2026-12-01', end: '2026-12-31'};
    const next = example({
      cycle: dec,
      bills: [rent({status: 'upcoming', paid: undefined}), rent({key: 'rent:nov', status: 'notPaid', carried: true, paid: undefined})],
    });
    expect(spendableTotal(next)).toBe(2000);
    expect(fixedTotal(next.bills)).toBe(10000);
    // Paying the carried bill at less than planned frees the difference.
    const paidLess = {...next, bills: [next.bills[0], {...next.bills[1], status: 'paid' as const, paid: 4500}]};
    expect(spendableTotal(paidLess)).toBe(2500);
  });

  it('upcoming bills are not carried: they are added on their due day', () => {
    expect(closeMonth(example({bills: [rent({status: 'upcoming'})]})).unpaidBills).toEqual([]);
  });

  it('a bill paid at a different amount moves spendable by the difference', () => {
    expect(spendableTotal(example({bills: [rent({paid: 5400})]}))).toBe(1600);
    expect(spendableTotal(example({bills: [rent({paid: 4800})]}))).toBe(2200);
    // Not paid yet, it is held at its planned amount.
    expect(spendableTotal(example({bills: [rent({status: 'notPaid', paid: undefined})]}))).toBe(2000);
  });

  it('a bill added or removed mid-month changes spendable from that day', () => {
    const added = example({bills: [rent(), {key: 'wifi', label: 'Wifi', planned: 600, status: 'notPaid'}]});
    expect(monthState(added, day(16)).dailyLimit).toBe(93.33); // 1400 / 15
    const removed = example({bills: []});
    expect(monthState(removed, day(16)).dailyLimit).toBe(466.66); // 7000 / 15
    // A bill not owed this month costs nothing.
    expect(spendableTotal(example({bills: [rent({status: 'skipped'})]}))).toBe(7000);
  });

  it('already spent before joining comes off what is left', () => {
    const joined = example({countFrom: day(15), alreadySpent: 400});
    const state = monthState(joined, day(15));
    expect(state.remaining).toBe(1600);
    expect(state.dailyLimit).toBe(100); // 1600 / 16
    expect(closeMonth(joined)).toMatchObject({spent: 400, extraSavings: 1600, partialFrom: day(15)});
  });

  it('waits for the 1st when tracking starts next month', () => {
    const waiting = monthState(example({cycle: {start: '2026-10-01', end: '2026-10-31'}, countFrom: '2026-11-01'}), '2026-10-30');
    expect(waiting.kind).toBe('waiting');
    expect(waiting.startsOn).toBe('2026-11-01');
    // On the 1st the normal month runs.
    const started = monthState(example({countFrom: '2026-11-01'}), '2026-11-01');
    expect(started.kind).toBe('active');
    expect(started.partialFrom).toBeNull();
    expect(started.dailyLimit).toBe(66.66);
  });
});

describe('week display', () => {
  it('adds up the week\'s daily limits and is never enforced', () => {
    // Wednesday 11 November: Monday and Tuesday had their own limits.
    const inputs = example({spendByDate: {[day(9)]: 100}});
    const state = monthState(inputs, day(11));
    expect(state.week.start).toBe('2026-11-09');
    expect(state.week.end).toBe('2026-11-15');
    const monday = monthState(inputs, day(9)).dailyLimit;
    const tuesday = monthState(inputs, day(10)).dailyLimit;
    expect(state.week.total).toBeCloseTo(monday + tuesday + state.dailyLimit * 5, 2);
    expect(state.week.spent).toBe(100);
  });

  it('is clipped to the cycle and to the tracking start', () => {
    // 1 November 2026 is a Sunday: its week has one day in the cycle.
    expect(monthState(example(), day(1)).week).toMatchObject({start: day(1), end: day(1)});
    const joined = monthState(example({countFrom: day(18)}), day(19));
    expect(joined.week.start).toBe(day(18));
  });
});

describe('the date check (handbook 5.5)', () => {
  it.each([
    ['the 1st', '2026-11-01', 'normal'],
    ['the 2nd', '2026-11-02', 'midMonth'],
    ['the 15th', '2026-11-15', 'midMonth'],
    ['4 days before the end', '2026-11-27', 'midMonth'],
    ['3 days before the end', '2026-11-28', 'startNextMonth'],
    ['the last day', '2026-11-30', 'startNextMonth'],
  ])('a 30-day month on %s', (_name, today, flow) => {
    expect(budgetFlowFor(today, cycleRangeFor(today))).toBe(flow);
  });

  it.each([
    ['28-day February', '2027-02-25', '2027-02-26'],
    ['29-day February', '2028-02-26', '2028-02-27'],
    ['31-day October', '2026-10-28', '2026-10-29'],
  ])('the last 3 days of a %s wait for the next month', (_name, lastMid, firstLate) => {
    expect(budgetFlowFor(lastMid, cycleRangeFor(lastMid))).toBe('midMonth');
    expect(budgetFlowFor(firstLate, cycleRangeFor(firstLate))).toBe('startNextMonth');
    expect(remainingDays(firstLate, cycleRangeFor(firstLate))).toBe(END_OF_MONTH_THRESHOLD);
  });

  it('follows the payday cycle', () => {
    // Payday 25: the cycle runs 25 October to 24 November.
    expect(budgetFlowFor('2026-10-25', cycleRangeFor('2026-10-25', 25))).toBe('normal');
    expect(budgetFlowFor('2026-11-01', cycleRangeFor('2026-11-01', 25))).toBe('midMonth');
    expect(budgetFlowFor('2026-11-22', cycleRangeFor('2026-11-22', 25))).toBe('startNextMonth');
    expect(nextCycleStart('2026-11-22', 25)).toBe('2026-11-25');
  });
});

describe('long absence (handbook 5.6)', () => {
  it('counts whole cycles between two days', () => {
    expect(cyclesBetween('2026-10-05', '2026-10-30')).toBe(0);
    expect(cyclesBetween('2026-10-30', '2026-11-01')).toBe(1);
    expect(cyclesBetween('2026-08-20', '2026-10-03')).toBe(2);
    expect(cyclesBetween('2026-10-20', '2026-11-26', 25)).toBe(2);
  });

  it('restarts only after a whole cycle went by unopened', () => {
    expect(isLongAbsence('2026-09-30', '2026-10-02')).toBe(false);
    expect(isLongAbsence('2026-09-01', '2026-10-31')).toBe(false);
    expect(isLongAbsence('2026-08-31', '2026-10-01')).toBe(true);
    expect(isLongAbsence(null, '2026-10-01')).toBe(false);
  });
});

describe('savings', () => {
  it('keeps extra savings apart from the goal, minus what went back to a budget', () => {
    const months = [
      {extraSavings: 150, toBudget: 0},
      {extraSavings: 400, toBudget: 400},
      {extraSavings: 0, toBudget: 0},
    ];
    expect(savingsPool(months, [])).toBe(150);
    expect(savingsPool(months, [{kind: 'move_to_budget', amount: 100}])).toBe(50);
    expect(
      savingsPool(months, [
        {kind: 'move_to_budget', amount: 100},
        {kind: 'move_to_savings', amount: 70},
        {kind: 'top_up', amount: 999},
      ]),
    ).toBe(120);
  });

  it('adds what a cycle got and takes what went back to savings', () => {
    expect(
      adjustmentTotal(
        [
          {kind: 'top_up', amount: 500},
          {kind: 'move_to_budget', amount: 100},
          {kind: 'move_to_savings', amount: 50},
        ],
        150,
      ),
    ).toBe(700);
  });
});

describe('money arithmetic', () => {
  it('works in paise, so float noise never leaks into a limit', () => {
    const noisy = example({spendByDate: {[day(1)]: 0.1 + 0.2, [day(2)]: 33.335}});
    const state = monthState(noisy, day(3));
    expect(state.spentBeforeToday).toBe(33.64);
    // (2000 - 33.64) / 28, rounded down to the paisa.
    expect(state.dailyLimit).toBe(70.22);
  });

  it('counts days across a DST-free calendar', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });
});
