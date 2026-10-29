import { Dashboard } from "@/components/dashboard";
import type { EarningsMember } from "@/components/member-earnings";
import { loadMemberMonths, loadMembers, loadTotals, loadWallet } from "@/lib/load";
import { currentMonth, monthKey, parseMonth } from "@/lib/month";
import { currentViewer } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

/**
 * Everything so far: every member's earnings for the chosen month in one
 * chart, each month's figures, each member's totals. The layout has already
 * turned away anyone without finance access.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const viewer = (await currentViewer())!;
  const params = await searchParams;
  // The chart's month (`?m=2026-11` — Oct 20 to Nov 19); this one by default.
  const month = parseMonth(typeof params.m === "string" ? params.m : null) ?? currentMonth();
  const [{ members, error: membersError }, { months, members: memberTotals, error }, earnings, wallet] = await Promise.all([
    loadMembers(),
    loadTotals(),
    loadMemberMonths(),
    // The wallet is the whole team's money: admins only.
    viewer.canWrite ? loadWallet() : null,
  ]);

  // Every member today, then anyone with history who isn't one any more —
  // their month's in and out, base fees and transfers aside.
  const key = monthKey(month);
  const byKey = new Map(earnings.series.map((s) => [s.key, s]));
  const current = new Set(members.map((m) => m.id));
  const chartMembers: EarningsMember[] = [
    ...members.map((m) => ({ key: m.id, name: m.name, removed: false })),
    ...earnings.series
      .filter((s) => !current.has(s.key) && s.byMonth[key])
      .map((s) => ({ key: s.key, name: s.name, removed: true })),
  ].map((m) => ({ ...m, ...(byKey.get(m.key)?.byMonth[key] ?? { in: 0, out: 0 }) }));

  return (
    <Dashboard
      canWrite={viewer.canWrite}
      // The schema not run yet shows as a missing function, not as nothing recorded.
      setupError={error || membersError || earnings.error || wallet?.error ? "missing" : null}
      members={members}
      months={months}
      memberTotals={memberTotals}
      chartMonth={month}
      chartMembers={chartMembers}
      wallet={wallet?.wallet ?? null}
    />
  );
}
