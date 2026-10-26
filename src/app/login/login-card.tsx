"use client";

import { App, Button, Card, Form, Input, Typography } from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/browser";

/**
 * Client, not server: antd's compound subcomponents (`Typography.Title`,
 * `Input.Password`) are undefined when antd is imported from a Server
 * Component, and the failure is an opaque "Element type is invalid" at render
 * time rather than a type error.
 */
export function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const { message } = App.useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: failure } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (failure) {
      // Supabase's own wording for a wrong password is "Invalid login
      // credentials", which is the right amount to say: naming which half was
      // wrong would confirm whether an address has an account.
      setError(failure.message);
      return;
    }

    message.success("Signed in.");
    // Only ever a same-origin path. `next` comes from the query string, and
    // taken as-is a crafted link (`?next=//elsewhere.example`) would send a
    // freshly signed-in user to another site.
    const raw = params.get("next");
    const next = raw?.startsWith("/") && !raw.startsWith("//") ? raw : "/";
    // refresh() so the server re-reads the cookie the sign-in just set;
    // push() alone can render the destination from a cache that predates it.
    router.replace(next);
    router.refresh();
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        // Two soft brand glows behind the card.
        background: `
          radial-gradient(60rem 40rem at 10% -10%, rgba(99, 102, 241, 0.18), transparent 60%),
          radial-gradient(50rem 36rem at 110% 110%, rgba(139, 92, 246, 0.16), transparent 60%),
          #f5f7fb`,
      }}
    >
      <Card
        variant="borderless"
        style={{
          width: "100%",
          maxWidth: 400,
          boxShadow:
            "0 1px 2px rgba(15, 23, 42, 0.04), 0 24px 48px -24px rgba(15, 23, 42, 0.25)",
        }}
        styles={{ body: { padding: 32 } }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 22,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              display: "grid",
              placeItems: "center",
              background: "var(--tw-gradient)",
              boxShadow: "0 8px 20px -8px rgba(139, 92, 246, 0.7)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 17,
            }}
          >
            T
          </span>
          <Typography.Title level={4} style={{ margin: 0, letterSpacing: "-0.02em" }}>
            Team <span style={{ opacity: 0.5, fontWeight: 500 }}>Finance</span>
          </Typography.Title>
        </div>

        <Typography.Title level={3} style={{ margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          Welcome back
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
          Sign in with the email and password your admin gave you. There&apos;s
          no sign-up: an admin adds each member.
        </Typography.Paragraph>

        {/* Labelled above each field: a
            placeholder is gone the moment someone starts typing, and is no
            name at all to a screen reader. A real form, so Enter submits. */}
        <Form layout="vertical" requiredMark={false} onFinish={submit}>
          <Form.Item label="Email" htmlFor="email" style={{ marginBottom: 14 }}>
            <Input
              id="email"
              autoFocus
              size="large"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Password" htmlFor="password" style={{ marginBottom: 18 }}>
            <Input.Password
              id="password"
              size="large"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Form.Item>

          {error && (
            <div style={{ color: "#dc2626", fontSize: 13, margin: "-6px 0 14px" }}>{error}</div>
          )}

          <Button
            type="primary"
            size="large"
            block
            loading={busy}
            htmlType="submit"
          >
            Sign in
          </Button>
        </Form>
      </Card>
    </main>
  );
}
