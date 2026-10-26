import { notFound } from "next/navigation";

import { MembersView, type MemberRow } from "@/components/members-view";
import { createClient, currentViewer } from "@/lib/supabase/server";

export const metadata = { title: "Members" };

/**
 * Who's on the team, for an admin: add people, change roles, reset a
 * password, deactivate someone who's left. Read through the admin's own
 * session (member_select lets an admin read every row); changed through the
 * actions beside this page, with the service role.
 */
export default async function MembersPage() {
  const viewer = (await currentViewer())!;
  if (!viewer.canWrite) notFound();

  const db = await createClient();
  const { data, error } = await db
    .from("member")
    .select("id, name, email, role, active, created_at")
    .order("active", { ascending: false })
    .order("role")
    .order("name");

  return (
    <MembersView
      me={viewer.id}
      rows={(data ?? []) as MemberRow[]}
      setupError={error ? error.message : null}
      canManage={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)}
    />
  );
}
