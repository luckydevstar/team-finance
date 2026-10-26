import { NotForThisAccount } from "@/components/not-for-this-account";
import { Shell } from "@/components/shell";
import { currentViewer } from "@/lib/supabase/server";

/**
 * Every page of the app: the bar with the two pages and who's signed in.
 * An account without finance access gets the explanation instead — the
 * policies would show it nothing anyway; saying so is kinder.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await currentViewer();
  if (!viewer?.canView) return <NotForThisAccount email={viewer?.email ?? ""} />;
  return (
    <Shell viewer={{ name: viewer.name ?? viewer.email, email: viewer.email, canWrite: viewer.canWrite }}>{children}</Shell>
  );
}
