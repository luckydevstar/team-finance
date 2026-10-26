/**
 * Money as the app shows it, and the split as the database makes it.
 * Pure — used by the pages and by scripts/test-core.mts.
 */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** $1,234.50 — or −$1,234.50. */
export const money = (value: number) => usd.format(value).replace("-", "−");

/** +$1,234.50 for gains, −$1,234.50 for losses, $0.00 for nothing. */
export const signedMoney = (value: number) => (value > 0 ? `+${usd.format(value)}` : money(value));

/**
 * An amount divided equally between `count` members, in cents: the odd cents
 * go one each to the first members, so the parts always add up to the whole.
 * The same rule as finance_save_transaction() in the schema — this is only
 * the preview of what it will store.
 */
export function splitEvenly(amount: number, count: number): number[] {
  if (count < 1 || !(amount > 0)) return [];
  const cents = Math.round(amount * 100);
  const each = Math.floor(cents / count);
  const extra = cents - each * count;
  return Array.from({ length: count }, (_, i) => (each + (i < extra ? 1 : 0)) / 100);
}
