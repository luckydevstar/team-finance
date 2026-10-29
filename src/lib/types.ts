/** Someone who can be in a transaction — an active member, admin or not — from finance_members(). */
export type Member = { id: string; name: string; email: string; role: string };

export type Direction = "in" | "out";

/** One member's part of a transaction. member_id is null once the account is gone. */
export type Share = { id: string; member_id: string | null; member_name: string; amount: number };

export type Transaction = {
  id: string;
  occurred_on: string;
  direction: Direction;
  /** The whole amount, before splitting; always positive. */
  amount: number;
  base_fee: boolean;
  /** An internal transfer: money moved within the team, not earned or spent. Never also a base fee. */
  transfer: boolean;
  reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  shares: Share[];
  /**
   * For a member's own view: how many it was split between. Their share is
   * the only one they get, and `amount` is that share, not the whole.
   */
  split?: number;
  /** For an admin: what the wallet held right after this one — null from before the wallet starts. */
  wallet_after?: number | null;
};

/**
 * The figures, the same everywhere: money in and out with base fees and
 * internal transfers aside, the base fees, the transfers in and out, and
 * net — in minus out, base fees and transfers left out.
 */
export type Totals = {
  total_in: number;
  total_out: number;
  base_fee: number;
  transfer_in: number;
  transfer_out: number;
  net: number;
};

/** A month's figures, from finance_month_totals(). `period` is its first day, e.g. 2026-11-01 for November. */
export type MonthTotals = Totals & { period: string; starts_on: string; ends_on: string; transactions: number };

/** A member's figures across every month, from finance_member_totals(). */
export type MemberTotals = Totals & { member_id: string | null; member_name: string };

/**
 * The team's wallet, from finance_wallet(): the day it starts (a month's
 * first day, the 20th), what it held then, every transaction's money in and
 * out since, and what it holds. Admins only.
 */
export type Wallet = {
  starts_on: string;
  opening_balance: number;
  total_in: number;
  total_out: number;
  balance: number;
  updated_by_name: string | null;
  updated_at: string;
};
