import { TransactionsView } from "@/components/transactions-view";
import { loadMembers, loadMyTransactions, toTransactions, TRANSACTION_SELECT } from "@/lib/load";
import { currentMonth, monthRange, parseMonth } from "@/lib/month";
import { createClient, currentViewer } from "@/lib/supabase/server";

export const metadata = { title: "Transactions" };

/** Every transaction in the range, whole, with every share — an admin's view. */
async function loadAllTransactions(from: string, to: string) {
  const db = await createClient();
  const { data, error } = await db
    .from("finance_transaction")
    .select(TRANSACTION_SELECT)
    .gte("occurred_on", from)
    .lt("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  return { transactions: toTransactions(data), error };
}

/**
 * One month's transactions (`?m=2026-11` — Oct 20 to Nov 19), optionally for
 * one member (`&member=`). Filtering by type and text happens in the page.
 */
export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const viewer = (await currentViewer())!;
  const params = await searchParams;
  const month = parseMonth(typeof params.m === "string" ? params.m : null) ?? currentMonth();
  const { from, to } = monthRange(month);

  // An admin reads whole transactions; a member, only their own
  // share of each — the database gives them nothing more.
  const [{ members, error }, { transactions, error: transactionsError }] = await Promise.all([
    loadMembers(),
    viewer.canWrite ? loadAllTransactions(from, to) : loadMyTransactions(from, to),
  ]);

  return (
    <TransactionsView
      canWrite={viewer.canWrite}
      month={month}
      setupError={error || transactionsError ? "missing" : null}
      members={members}
      transactions={transactions}
      member={typeof params.member === "string" ? params.member : null}
    />
  );
}
