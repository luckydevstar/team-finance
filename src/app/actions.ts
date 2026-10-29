"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, currentViewer } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const transactionInput = z.object({
  id: z.string().regex(UUID).nullable(),
  occurredOn: z.string().regex(DAY, "Pick a date."),
  direction: z.enum(["in", "out"]),
  amount: z.number().positive("Enter an amount above zero.").max(1_000_000_000),
  baseFee: z.boolean(),
  transfer: z.boolean(),
  reason: z.string().max(2000, "The reason is too long."),
  members: z.array(z.string().regex(UUID)).min(1, "Choose at least one member.").max(500),
}).refine((t) => !(t.baseFee && t.transfer), "A transaction is a base fee or an internal transfer, not both.");

const walletInput = z.object({
  startsOn: z.string().regex(DAY, "Pick the month it starts."),
  openingBalance: z.number().min(0, "The starting balance can't be below zero.").max(1_000_000_000),
});

/** Only an admin writes; the database says so too, this just says it first. */
async function writer() {
  const viewer = await currentViewer();
  return viewer?.canWrite ? viewer : null;
}

/**
 * Records a transaction, or saves an edit to one. The split between members
 * happens in the database (finance_save_transaction), in one statement, so
 * a transaction is never left without its shares.
 */
export async function saveTransaction(input: z.input<typeof transactionInput>): Promise<Result> {
  if (!(await writer())) return { ok: false, error: "Only an admin records transactions." };
  const parsed = transactionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const t = parsed.data;

  const db = await createClient();
  const { error } = await db.rpc("finance_save_transaction", {
    p_id: t.id,
    p_occurred_on: t.occurredOn,
    p_direction: t.direction,
    p_amount: Math.round(t.amount * 100) / 100,
    p_base_fee: t.baseFee,
    p_reason: t.reason,
    p_members: t.members,
    p_transfer: t.transfer,
  });
  if (error) return { ok: false, error: error.message };
  // Both pages read these.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteTransaction(id: string): Promise<Result> {
  if (!(await writer())) return { ok: false, error: "Only an admin removes transactions." };
  if (!UUID.test(id)) return { ok: false, error: "That isn't a transaction." };
  const db = await createClient();
  const { data, error } = await db.from("finance_transaction").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "That transaction is already gone." };
  // Both pages read these.
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Sets where the wallet starts — a month's first day, the 20th — and what it
 * held then. Every transaction from that day on moves it.
 */
export async function saveWallet(input: z.input<typeof walletInput>): Promise<Result> {
  if (!(await writer())) return { ok: false, error: "Only an admin sets the wallet." };
  const parsed = walletInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };

  const db = await createClient();
  const { error } = await db.rpc("finance_set_wallet", {
    p_starts_on: parsed.data.startsOn,
    p_opening_balance: Math.round(parsed.data.openingBalance * 100) / 100,
  });
  if (error) return { ok: false, error: error.message };
  // Both pages read it.
  revalidatePath("/", "layout");
  return { ok: true };
}
