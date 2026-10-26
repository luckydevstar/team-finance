"use client";

import { Button, Result } from "antd";

/**
 * Shown to someone signed in who isn't an active member: an account with no
 * member row, or one an admin has deactivated.
 *
 * Client, because antd's Result is rendered here alongside a form; antd's
 * compound components are undefined in a Server Component.
 */
export function NotForThisAccount({ email }: { email: string }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <Result
        status="403"
        title="This account isn't on the team"
        subTitle={
          email
            ? `${email} is signed in, but isn't an active member. Ask an admin to add you, or to reactivate you.`
            : "This account isn't an active member. Ask an admin to add you, or to reactivate you."
        }
        extra={
          <form action="/auth/signout" method="post">
            <Button type="primary" htmlType="submit">
              Sign out
            </Button>
          </form>
        }
      />
    </main>
  );
}
