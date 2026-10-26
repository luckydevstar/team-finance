"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import { currentViewer } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const name = z.string().trim().min(1, "Enter a name.").max(120, "The name is too long.");
const password = z.string().min(8, "Passwords are at least 8 characters.").max(72, "Passwords are at most 72 characters.");
const role = z.enum(["admin", "member"]);

const newMember = z.object({
  name,
  email: z.string().trim().toLowerCase().email("Enter an email address."),
  password,
  role,
});

const NO_KEY = "Set SUPABASE_SERVICE_ROLE_KEY on the server to manage members — see the README.";

/**
 * The admin asking, and the service-role client to act with. Checked through
 * their own session first: the service role is past every policy, so this is
 * the only thing standing between it and anyone signed in.
 */
async function adminOnly() {
  const viewer = await currentViewer();
  if (!viewer?.canWrite) return { ok: false, error: "Only an admin manages members." } as const;
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NO_KEY } as const;
  return { ok: true, viewer, admin } as const;
}

const done = (): Result => {
  // The member list is on every page, through the transaction dialog.
  revalidatePath("/", "layout");
  return { ok: true };
};

/**
 * Adds someone: their sign-in, with the password the admin chose, and their
 * member row. Confirmed at once — there is no invitation email to wait for.
 */
export async function addMember(input: z.input<typeof newMember>): Promise<Result> {
  const ctx = await adminOnly();
  if (!ctx.ok) return ctx;
  const parsed = newMember.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const m = parsed.data;

  const { data, error } = await ctx.admin.auth.admin.createUser({
    email: m.email,
    password: m.password,
    email_confirm: true,
    user_metadata: { name: m.name },
  });
  if (error || !data.user) {
    const taken = /already|exists|registered/i.test(error?.message ?? "");
    return {
      ok: false,
      error: taken
        ? "There's already an account with that email. If it was added in Supabase directly, remove it there first."
        : (error?.message ?? "The account wasn't created."),
    };
  }

  const { error: insertError } = await ctx.admin
    .from("member")
    .insert({ id: data.user.id, name: m.name, email: m.email, role: m.role, active: true });
  if (insertError) {
    // Without its member row the account is a sign-in to nothing; take it back.
    await ctx.admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: insertError.message };
  }
  return done();
}

/** Renames someone or changes their role. Nobody changes their own role — that's how a team loses its last admin. */
export async function updateMember(input: { id: string; name: string; role: "admin" | "member" }): Promise<Result> {
  const ctx = await adminOnly();
  if (!ctx.ok) return ctx;
  const parsed = z.object({ id: z.string().regex(UUID), name, role }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const m = parsed.data;

  const { data: current } = await ctx.admin.from("member").select("role").eq("id", m.id).maybeSingle();
  if (!current) return { ok: false, error: "That member is gone." };
  if (m.id === ctx.viewer.id && m.role !== current.role) {
    return { ok: false, error: "You can't change your own role. Ask another admin." };
  }

  const { error } = await ctx.admin.from("member").update({ name: m.name, role: m.role }).eq("id", m.id);
  if (error) return { ok: false, error: error.message };
  return done();
}

/**
 * Deactivates someone, or brings them back. Their history stays; while off,
 * they can't sign in, and the database shows them nothing even on a session
 * that was already open.
 */
export async function setMemberActive(id: string, active: boolean): Promise<Result> {
  const ctx = await adminOnly();
  if (!ctx.ok) return ctx;
  if (!UUID.test(id)) return { ok: false, error: "That isn't a member." };
  if (id === ctx.viewer.id) return { ok: false, error: "You can't deactivate yourself. Ask another admin." };

  const { data, error } = await ctx.admin.from("member").update({ active }).eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "That member is gone." };
  // Banned rather than deleted: the account, and every share under it, stay.
  const { error: banError } = await ctx.admin.auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : "876000h",
  });
  if (banError) return { ok: false, error: banError.message };
  return done();
}

/** Sets a new password for someone — for a forgotten one, there being no reset email. */
export async function setMemberPassword(id: string, next: string): Promise<Result> {
  const ctx = await adminOnly();
  if (!ctx.ok) return ctx;
  if (!UUID.test(id)) return { ok: false, error: "That isn't a member." };
  const parsed = password.safeParse(next);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the password." };

  const { data: exists } = await ctx.admin.from("member").select("id").eq("id", id).maybeSingle();
  if (!exists) return { ok: false, error: "That member is gone." };
  const { error } = await ctx.admin.auth.admin.updateUserById(id, { password: parsed.data });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
