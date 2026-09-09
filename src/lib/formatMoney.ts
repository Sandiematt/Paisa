/** Formats a signed amount with a currency symbol and grouped thousands. */
export function formatMoney(
  amount: number,
  symbol: string,
  options?: {signed?: boolean; fromCents?: boolean; decimals?: number},
): string {
  const value = options?.fromCents ? amount / 100 : amount;
  const digits = options?.decimals ?? 2;
  const abs = Math.abs(value);
  const [whole, fraction] = abs.toFixed(digits).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body =
    fraction !== undefined ? `${symbol}${grouped}.${fraction}` : `${symbol}${grouped}`;

  if (value < 0) {
    return `-${body}`;
  }
  if (value > 0 && options?.signed) {
    return `+${body}`;
  }
  return body;
}

export function formatAmountInput(raw: string, symbol: string): string {
  if (!raw || raw === '.') {
    return `${symbol}0`;
  }
  const [whole, fraction] = raw.split('.');
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (fraction !== undefined) {
    return `${symbol}${grouped}.${fraction}`;
  }
  return `${symbol}${grouped}`;
}

export function parseAmountInput(raw: string): number {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value;
}
