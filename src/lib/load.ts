import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Member, MemberTotals, MonthTotals, Transaction } from "@/lib/types";

/*
 * The reads the pages make, as the signed-in user — the policies in
 * supabase/schema.sql decide what comes back — shaped for the components.
 */

/** Numeric columns can arrive as strings; the pages want numbers. */
const num = (value: unknown) => Number(value ?? 0);

const totals = <T extends { total_in: unknown; total_out: unknown; base_fee: unknown; net: unknown }>(r: T) => ({
  ...r,
  total_in: num(r.total_in),
  total_out: num(r.total_out),
  base_fee: num(r.base_fee),
  net: num(r.net),
});

export const TRANSACTION_SELECT = "*, shares:finance_share(id, member_id, member_name, amount)";

export function toTransactions(rows: unknown[] | null): Transaction[] {
  return ((rows ?? []) as Transaction[]).map((t) => ({
    ...t,
    amount: num(t.amount),
    shares: [...(t.shares ?? [])]
      .map((s) => ({ ...s, amount: num(s.amount) }))
      .sort((a, b) => a.member_name.localeCompare(b.member_name)),
  }));
}

export async function loadMembers() {
  const db = await createClient();
  const { data, error } = await db.rpc("finance_members");
  return { members: (data ?? []) as Member[], error };
}

export async function loadTotals() {
  const db = await createClient();
  const [months, members] = await Promise.all([db.rpc("finance_month_totals"), db.rpc("finance_member_totals")]);
  return {
    error: months.error ?? members.error,
    months: ((months.data ?? []) as MonthTotals[]).map((m) => ({ ...totals(m), transactions: num(m.transactions) })),
    members: ((members.data ?? []) as MemberTotals[]).map(totals),
  };
}

/** One member's month: money in and out, base fees aside. */
export type MemberMonth = { in: number; out: number };

/** A member's months, for the earnings charts. `key` is the account id, or `name:…` once it's gone. */
export type MemberSeries = { key: string; name: string; byMonth: Record<string, MemberMonth> };

/**
 * Every member's money in and out per month — months from the 20th to the
 * 19th, base fees left out. finance_member_months() decides whose: everyone's
 * for an admin, only the caller's own for a member.
 */
export async function loadMemberMonths(): Promise<{ series: MemberSeries[]; error: unknown }> {
  const db = await createClient();
  const { data, error } = await db.rpc("finance_member_months");
  if (error) return { series: [], error };
  type Row = { member_id: string | null; member_name: string; period: string; total_in: unknown; total_out: unknown };
  const series = new Map<string, MemberSeries>();
  for (const r of (data ?? []) as Row[]) {
    const key = r.member_id ?? `name:${r.member_name}`;
    const entry = series.get(key) ?? { key, name: r.member_name, byMonth: {} };
    entry.byMonth[r.period.slice(0, 7)] = { in: num(r.total_in), out: num(r.total_out) };
    series.set(key, entry);
  }
  return { series: [...series.values()], error: null };
}

/**
 * A member's own transactions between two dates, from finance_my_shares():
 * each as their share — the whole amount and anyone else's part stay out.
 * Shaped like an admin's transactions, with `split` saying how many
 * shared it.
 */
export async function loadMyTransactions(from: string, to: string): Promise<{ transactions: Transaction[]; error: unknown }> {
  const db = await createClient();
  const { data, error } = await db.rpc("finance_my_shares", { p_from: from, p_to: to });
  type Row = {
    transaction_id: string;
    occurred_on: string;
    direction: "in" | "out";
    base_fee: boolean;
    reason: string | null;
    created_by_name: string | null;
    created_at: string;
    share_id: string;
    member_id: string;
    member_name: string;
    amount: unknown;
    split: number;
  };
  return {
    error,
    transactions: ((data ?? []) as Row[]).map((r) => ({
      id: r.transaction_id,
      occurred_on: r.occurred_on,
      direction: r.direction,
      amount: num(r.amount),
      base_fee: r.base_fee,
      reason: r.reason,
      created_by: null,
      created_by_name: r.created_by_name,
      created_at: r.created_at,
      shares: [{ id: r.share_id, member_id: r.member_id, member_name: r.member_name, amount: num(r.amount) }],
      split: r.split,
    })),
  };
}
