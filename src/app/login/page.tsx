import { Suspense } from "react";

import { LoginCard } from "./login-card";

export const metadata = { title: "Sign in · Team Finance" };

export default function LoginPage() {
  // LoginForm reads `next` through useSearchParams, which opts its subtree
  // into client rendering; without this boundary Next refuses to prerender
  // the page at all.
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  );
}
