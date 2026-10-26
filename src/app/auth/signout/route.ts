import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * POST, not GET: a link a browser can prefetch should never end a session,
 * and a GET sign-out is one cross-site image tag away from logging people out
 * of their own finance app.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), {
    // 303 so the browser follows with GET rather than repeating the POST.
    status: 303,
  });
}
