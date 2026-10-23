/**
 * Keeps only what a money field can hold: digits, plus one `.` and up to two
 * decimals when `allowDecimal` is set.
 */
export function sanitizeMoneyInput(text: string, allowDecimal = false): string {
  const stripped = text.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
  if (!allowDecimal) {
    return stripped;
  }
  const dot = stripped.indexOf('.');
  if (dot === -1) {
    return stripped;
  }
  const whole = stripped.slice(0, dot);
  const fraction = stripped.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return `${whole}.${fraction}`;
}

/** Groups the whole part in thousands for display, leaving decimals alone. */
export function groupMoneyInput(raw: string): string {
  if (!raw) {
    return '';
  }
  const [whole, fraction] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
