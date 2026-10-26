"use client";

import { AppstoreOutlined, HistoryOutlined, LogoutOutlined, SafetyOutlined, TeamOutlined } from "@ant-design/icons";
import { Button, Tag, Tooltip } from "antd";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { AccountMenu } from "@/components/account-menu";

const PAGES = [
  { href: "/", label: "Dashboard", icon: <AppstoreOutlined /> },
  { href: "/transactions", label: "Transactions", icon: <HistoryOutlined /> },
  { href: "/members", label: "Members", icon: <TeamOutlined />, adminOnly: true },
];

/**
 * The bar over every page: the app, its pages (Members for an admin), and
 * who's signed in. The month in view stays with Transactions, so coming back
 * keeps your place.
 */
export function Shell({
  viewer,
  children,
}: {
  viewer: { name: string; email: string; canWrite: boolean };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const month = params.get("m");
  // The dashboard is every month; only Transactions takes one.
  const carry = (href: string) => (month && href === "/transactions" ? `${href}?m=${month}` : href);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
          height: 60,
          background: "rgba(255,255,255,0.86)",
          backdropFilter: "saturate(180%) blur(12px)",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <Link href={carry("/")} style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "inherit" }}>
          <span
            aria-hidden
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              display: "grid",
              placeItems: "center",
              background: "var(--tw-gradient)",
              color: "#fff",
              fontWeight: 700,
              boxShadow: "0 6px 16px -6px rgba(139, 92, 246, 0.7)",
            }}
          >
            T
          </span>
          <span className="tw-hide-narrow" style={{ fontWeight: 650, fontSize: 15, letterSpacing: "-0.02em" }}>
            Team <span style={{ opacity: 0.5, fontWeight: 500 }}>Finance</span>
          </span>
        </Link>

        <nav aria-label="Pages" style={{ display: "flex", gap: 4, marginLeft: 12, flex: 1 }}>
          {PAGES.filter((page) => !page.adminOnly || viewer.canWrite).map((page) => {
            const active = page.href === "/" ? pathname === "/" : pathname.startsWith(page.href);
            return (
              <Link
                key={page.href}
                href={carry(page.href)}
                aria-current={active ? "page" : undefined}
                aria-label={page.label}
                className={`tw-tab${active ? " tw-tab-active" : ""}`}
              >
                {page.icon}
                <span className="tw-tab-label">{page.label}</span>
              </Link>
            );
          })}
        </nav>

        <Tag
          bordered={false}
          color={viewer.canWrite ? "purple" : "default"}
          icon={viewer.canWrite ? <SafetyOutlined /> : undefined}
          className="tw-hide-narrow"
          style={{ borderRadius: 999, marginInlineEnd: 0 }}
        >
          {viewer.canWrite ? "Admin" : "Member"}
        </Tag>
        <AccountMenu name={viewer.name} email={viewer.email} />
        <form action="/auth/signout" method="post">
          <Tooltip title="Sign out">
            <Button htmlType="submit" type="text" icon={<LogoutOutlined />} aria-label="Sign out" />
          </Tooltip>
        </form>
      </header>

      <main style={{ maxWidth: 1360, margin: "0 auto", padding: "24px 20px 48px" }}>{children}</main>
    </div>
  );
}
