"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase in the browser, for what has to happen there: signing in, so the
 * session lands in cookies the server can then read, and changing your own
 * password. Everything else goes through the server.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
