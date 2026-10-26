"use client";

import { ArrowDownOutlined, ArrowUpOutlined, SearchOutlined, SwapOutlined } from "@ant-design/icons";
import { Alert, Card, Col, Input, Row, Segmented, Select, Typography } from "antd";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { FinanceActions } from "@/components/finance-actions";
import { Signed } from "@/components/figures";
import { MonthSwitcher } from "@/components/month-switcher";
import { shareOf, TransactionsTable, type Focus } from "@/components/transactions-table";
import { money } from "@/lib/money";
import { monthLabel, monthSpan, type Month } from "@/lib/month";
import type { Member, Transaction } from "@/lib/types";

type Kind = "all" | "in" | "out" | "fee";

type Props = {
  canWrite: boolean;
  month: Month;
  setupError: string | null;
  members: Member[];
  transactions: Transaction[];
  /** `?member=` — an account id, or `name:…` for one that's gone. */
  member: string | null;
};

function Figure({ label, value, note, icon, tint, ink }: { label: string; value: ReactNode; note?: ReactNode; icon: ReactNode; tint: string; ink: string }) {
  return (
    <Card variant="borderless" style={{ height: "100%" }} styles={{ body: { padding: "16px 18px" } }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
          {label}
        </Typography.Text>
        <span aria-hidden style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: tint, color: ink }}>
          {icon}
        </span>
      </div>
      <div className="tw-num" style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-0.02em", margin: "6px 0 2px" }}>
        {value}
      </div>
      {note && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {note}
        </Typography.Text>
      )}
    </Card>
  );
}

/**
 * A month's transactions — months run from the 20th to the 19th — with the
 * month's money in, money out and net at the top. Filter by type, member and
 * text; narrowed to one member, the figures and amounts are their share.
 */
export function TransactionsView({ canWrite, month, setupError, members, transactions, member }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");

  // Everyone who appears this month or can be a member today — a removed
  // account can still be looked up by name.
  const memberOptions = useMemo(() => {
    const options = new Map<string, string>(members.map((m) => [m.id, m.name]));
    for (const t of transactions) {
      for (const s of t.shares) {
        const key = s.member_id ?? `name:${s.member_name}`;
        if (!options.has(key)) options.set(key, s.member_id ? s.member_name : `${s.member_name} (removed)`);
      }
    }
    return [...options].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [members, transactions]);

  const focus: Focus = member
    ? member.startsWith("name:")
      ? { id: null, name: member.slice(5) }
      : { id: member, name: memberOptions.find((o) => o.value === member)?.label ?? "Member" }
    : null;

  const setMember = (value: string | undefined) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("member", value);
    else next.delete("member");
    router.push(`${pathname}?${next.toString()}`);
  };

  // The member's part of the month, or the whole month.
  const mine = useMemo(
    () => (focus ? transactions.filter((t) => shareOf(t, focus)) : transactions),
    // focus is derived from `member` each render; its identity changes, its meaning doesn't.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, member],
  );

  /** The month's figures — the same rule as the dashboard: base fees aside, net is in minus out. */
  const totals = useMemo(() => {
    const t = { in: 0, out: 0, fee: 0 };
    for (const tx of mine) {
      const amount = focus ? (shareOf(tx, focus)?.amount ?? 0) : tx.amount;
      if (tx.base_fee) t.fee += amount;
      else if (tx.direction === "in") t.in += amount;
      else t.out += amount;
    }
    return { ...t, net: t.in - t.out };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, member]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine.filter((t) => {
      if (kind === "in" && (t.direction !== "in" || t.base_fee)) return false;
      if (kind === "out" && (t.direction !== "out" || t.base_fee)) return false;
      if (kind === "fee" && !t.base_fee) return false;
      if (!q) return true;
      return (
        (t.reason ?? "").toLowerCase().includes(q) ||
        t.shares.some((s) => s.member_name.toLowerCase().includes(q)) ||
        (t.created_by_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [mine, kind, query]);

  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "12px 16px",
          marginBottom: 20,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={3} style={{ margin: 0, letterSpacing: "-0.02em" }}>
            {monthLabel(month)}
          </Typography.Title>
          <Typography.Text type="secondary">
            {monthSpan(month)}
            {focus ? ` · ${focus.name}'s share` : " · every transaction"}
          </Typography.Text>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <MonthSwitcher month={month} />
          {canWrite && <FinanceActions month={month} members={members} />}
        </div>
      </div>

      {setupError && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="The database isn't set up yet"
          description="Run supabase/schema.sql in the Supabase SQL editor, then reload."
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Figure
            label="In this month"
            value={money(totals.in)}
            note="Base fees not counted"
            icon={<ArrowDownOutlined />}
            tint="#dcfce7"
            ink="#15803d"
          />
        </Col>
        <Col xs={24} sm={8}>
          <Figure
            label="Out this month"
            value={money(totals.out)}
            note={totals.fee ? `Base fees not counted (${money(totals.fee)} this month)` : "Base fees not counted"}
            icon={<ArrowUpOutlined />}
            tint="#fee2e2"
            ink="#b91c1c"
          />
        </Col>
        <Col xs={24} sm={8}>
          <Figure
            label="Net"
            value={<Signed value={totals.net} />}
            note="In minus out — base fees not counted"
            icon={<SwapOutlined />}
            tint="#eef2ff"
            ink="#4338ca"
          />
        </Col>
      </Row>

      <Card
        variant="borderless"
        styles={{ body: { padding: 0 } }}
        title={
          <span>
            Transactions{" "}
            <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
              · {shown.length}
              {shown.length !== mine.length ? ` of ${mine.length}` : ""}
            </Typography.Text>
          </span>
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "12px 16px" }}>
          <Segmented<Kind>
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "All" },
              { value: "in", label: "In" },
              { value: "out", label: "Out" },
              { value: "fee", label: "Base fees" },
            ]}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Every member"
            value={member ?? undefined}
            onChange={setMember}
            options={memberOptions}
            style={{ minWidth: 200 }}
          />
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search reason, member or who recorded it"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: "1 1 220px", maxWidth: 360 }}
          />
        </div>
        <TransactionsTable
          transactions={shown}
          members={members}
          canWrite={canWrite}
          focus={focus}
          empty={mine.length ? "Nothing matches these filters." : `No transactions in ${monthLabel(month)}.`}
        />
      </Card>
    </>
  );
}
