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
  reason: z.string().max(2000, "The reason is too long."),
  members: z.array(z.string().regex(UUID)).min(1, "Choose at least one member.").max(500),
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
