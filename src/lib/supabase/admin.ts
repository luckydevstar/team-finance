import { createClient } from "@supabase/supabase-js";

/**
 * Supabase with the **service role**: past every policy. For one job only —
 * managing accounts on the Members page, which means creating and changing
 * Supabase Auth users, something no policy can grant.
 *
 * Every caller checks first that the person asking is an admin, through
 * their own session (currentViewer). Import it from server actions only:
 * the key must never reach a browser, which is why it has no NEXT_PUBLIC_
 * prefix and Next leaves it out of client bundles.
 *
 * Null when SUPABASE_SERVICE_ROLE_KEY isn't set; the Members page says so.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
