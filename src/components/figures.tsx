"use client";

import { Tooltip } from "antd";

import { money, signedMoney } from "@/lib/money";

/** A figure coloured by its sign: green gained, red spent, a dash for nothing. */
export function Signed({ value, strong = false }: { value: number; strong?: boolean }) {
  const cls = value > 0 ? "tw-in" : value < 0 ? "tw-out" : "tw-zero";
  return (
    <span className={`tw-num ${cls}`} style={strong ? { fontWeight: 600 } : undefined}>
      {value === 0 ? "—" : signedMoney(value)}
    </span>
  );
}

/** A plain amount, faint when there's nothing. */
export function Plain({ value, className }: { value: number; className?: string }) {
  return <span className={`tw-num ${value ? (className ?? "") : "tw-zero"}`}>{value ? money(value) : "—"}</span>;
}

/**
 * Internal transfers, kept apart from earnings: what came in less what went
 * out, in their own colour, with both on hover — so transfers that cancel out
 * still show as $0.00 rather than as nothing.
 */
export function Transfers({ in: received, out: sent }: { in: number; out: number }) {
  if (!received && !sent) return <span className="tw-num tw-zero">—</span>;
  return (
    <Tooltip title={`${money(received)} in · ${money(sent)} out`}>
      <span className="tw-num tw-transfer">{signedMoney(received - sent)}</span>
    </Tooltip>
  );
}
