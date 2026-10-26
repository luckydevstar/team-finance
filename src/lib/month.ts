/**
 * Months as the team counts them: from the 20th to the 19th, so "November
 * 2026" is Oct 20 – Nov 19, and a payment on Oct 20 is November's. The same
 * rule as finance_period() in the schema — change both. Pure.
 *
 * In the address a month is "2026-11"; on screen, "November 2026".
 */

export type Month = { year: number; month: number };

/** The day a month's money starts counting: the 20th of the month before. */
export const START_DAY = 20;

/**
 * The zone "today" is read in — which month it is, and the date a new
 * transaction starts on. NEXT_PUBLIC_TIME_ZONE (an IANA name such as
 * Europe/London) at build time; New York otherwise.
 */
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "America/New_York";

/** The month a YYYY-MM-DD date counts in. */
export function monthOf(date: string): Month {
  const [year, month, day] = date.split("-").map(Number);
  return day >= START_DAY ? shiftMonth({ year, month }, 1) : { year, month };
}

/** The month today counts in, by New York's calendar. */
export function currentMonth(now = new Date()): Month {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return monthOf(parts);
}

/** "2026-11" → November 2026; anything else → null. */
export function parseMonth(value: string | null | undefined): Month | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : null;
}

export const monthKey = ({ year, month }: Month) => `${year}-${String(month).padStart(2, "0")}`;

export function shiftMonth({ year, month }: Month, by: number): Month {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** The month's first and last day as YYYY-MM-DD — `to` is the first day of the next, for a query. */
export function monthRange(m: Month): { from: string; to: string; last: string } {
  const from = `${monthKey(shiftMonth(m, -1))}-${START_DAY}`;
  const to = `${monthKey(m)}-${START_DAY}`;
  const last = `${monthKey(m)}-${String(START_DAY - 1).padStart(2, "0")}`;
  return { from, to, last };
}

export const monthLabel = ({ year, month }: Month) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** "Oct 20 – Nov 19", the days a month covers. */
export function monthSpan(m: Month): string {
  const { from, last } = monthRange(m);
  const day = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${day(from)} – ${day(last)}`;
}
