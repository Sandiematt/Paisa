// Calendar maths for DatePickerSheet, kept free of React so it can be tested.

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function shiftMonth(month: Date, delta: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

/** Transactions have happened already, so days after today are not offered. */
export function isAfterDay(date: Date, today: Date): boolean {
  return startOfDay(date).getTime() > startOfDay(today).getTime();
}

/** Whether any day of `month` can be picked (it is not wholly in the future). */
export function monthHasPastDays(month: Date, today: Date): boolean {
  return startOfMonth(month).getTime() <= startOfMonth(today).getTime();
}

/** The month's days in weeks starting on Sunday, with nulls for padding. */
export function monthWeeks(month: Date): (Date | null)[][] {
  const first = startOfMonth(month);
  const lastDate = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells: (Date | null)[] = Array.from(
    {length: first.getDay()},
    () => null,
  );
  for (let day = 1; day <= lastDate; day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  const weeks: (Date | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

export type QuickPick = {label: string; date: Date};

/** Today, Yesterday, and the day before by name ("Fri"). */
export function quickPicks(today: Date): QuickPick[] {
  const day = startOfDay(today);
  const twoBack = addDays(day, -2);
  return [
    {label: 'Today', date: day},
    {label: 'Yesterday', date: addDays(day, -1)},
    {label: WEEKDAYS[twoBack.getDay()], date: twoBack},
  ];
}

/** "Sunday, 26 October" this year, "Sunday, 26 October 2025" otherwise. */
export function longDateLabel(date: Date, today: Date): string {
  const weekday = date.toLocaleDateString('en-GB', {weekday: 'long'});
  const year =
    date.getFullYear() === today.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${weekday}, ${date.getDate()} ${MONTHS[date.getMonth()]}${year}`;
}

/** "Sun, 26 Oct" this year, "Sun, 26 Oct 2025" otherwise, for the button. */
export function shortDateLabel(date: Date, today: Date): string {
  const year =
    date.getFullYear() === today.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[
    date.getMonth()
  ].slice(0, 3)}${year}`;
}

/** How a picked day relates to today, shown under the date in the header. */
export function relativeDayLabel(date: Date, today: Date): string | null {
  const days = Math.round(
    (startOfDay(today).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (days === 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days > 1 && days < 7) {
    return `${days} days ago`;
  }
  return null;
}
