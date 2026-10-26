"use client";

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
