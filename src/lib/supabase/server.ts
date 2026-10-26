import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Supabase as the signed-in user, bound to the request's cookies.
 *
 * The **anon** key, not the service role: every query is filtered by the
 * policies in supabase/schema.sql, so what someone sees and may change is the
 * database's decision, not this app's.
 *
 * Built per request — `cookies()` is request-scoped, so a shared client would
 * serve one user's session to everyone. `cache()` memoises it within one.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components can read cookies but not write them. The proxy
            // refreshes the session on every request and *can* write, so
            // swallowing this is correct rather than merely convenient.
          }
        },
      },
    },
  );
});

/**
 * The signed-in account as this app sees it: who, and whether they may view
 * or also write. Read from `member`, whose policy always lets you read your
 * own row. Null for no session.
 */
export const currentViewer = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims) return null;

  const { data } = await supabase
    .from("member")
    .select("name, role, active")
    .eq("id", claims.sub as string)
    .maybeSingle();

  const active = Boolean(data?.active);
  return {
    id: claims.sub as string,
    email: (claims.email as string) ?? "",
    name: (data?.name as string | null) ?? null,
    // Mirrors finance_can_view() and finance_is_admin().
    canView: active,
    canWrite: active && data?.role === "admin",
  };
});
