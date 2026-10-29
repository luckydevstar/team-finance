"use client";

import { RightOutlined } from "@ant-design/icons";
import { Alert, Card, Empty, Table, Tooltip, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { FinanceActions } from "@/components/finance-actions";
import { Plain, Signed, Transfers } from "@/components/figures";
import { MemberName } from "@/components/member-avatar";
import { MemberEarnings, type EarningsMember } from "@/components/member-earnings";
import { money } from "@/lib/money";
import { currentMonth, monthKey, monthLabel, monthSpan, type Month } from "@/lib/month";
import type { Member, MemberTotals, MonthTotals, Totals } from "@/lib/types";

type Props = {
  canWrite: boolean;
  /** Set when the schema hasn't been run yet. */
  setupError: string | null;
  members: Member[];
  months: MonthTotals[];
  memberTotals: MemberTotals[];
  /** The chart's month, and each member's in and out for it. */
  chartMonth: Month;
  chartMembers: EarningsMember[];
};

/** Internal transfers: in less out, never counted anywhere else. */
const transfersColumn = <T extends Totals>() => ({
  title: (
    <Tooltip title="Internal transfers, in less out — not counted in In, Out, Net or anyone's earnings; hover for both">
      <span>Transfers</span>
    </Tooltip>
  ),
  key: "transfers",
  align: "right" as const,
  sorter: (a: T, b: T) => a.transfer_in - a.transfer_out - (b.transfer_in - b.transfer_out),
  render: (_: unknown, r: T) => <Transfers in={r.transfer_in} out={r.transfer_out} />,
});

/** In, out, base fees, transfers and net, for the months table. */
const figureColumns = <T extends Totals>() => [
  {
    title: "In",
    dataIndex: "total_in",
    align: "right" as const,
    sorter: (a: T, b: T) => a.total_in - b.total_in,
    render: (v: number) => <Plain value={v} className="tw-in" />,
  },
  {
    title: "Out",
    dataIndex: "total_out",
    align: "right" as const,
    sorter: (a: T, b: T) => a.total_out - b.total_out,
    render: (v: number) => <Plain value={v} className="tw-out" />,
  },
  {
    title: (
      <Tooltip title="Not counted in In, Out or Net — shown here only">
        <span>Base fees</span>
      </Tooltip>
    ),
    dataIndex: "base_fee",
    align: "right" as const,
    sorter: (a: T, b: T) => a.base_fee - b.base_fee,
    render: (v: number) => <Plain value={v} className="tw-fee" />,
  },
  transfersColumn<T>(),
  {
    title: (
      <Tooltip title="In minus out — base fees and transfers not counted">
        <span>Net</span>
      </Tooltip>
    ),
    dataIndex: "net",
    align: "right" as const,
    sorter: (a: T, b: T) => a.net - b.net,
    render: (v: number) => <Signed value={v} strong />,
  },
];

/**
 * The dashboard: everything so far. Every member's earnings for a chosen
 * month in one chart, each month's figures — months run from the 20th to the 19th — and
 * what each member comes to, before and after their base fees. A month
 * opens its transactions; so does a member, for the current month.
 */
export function Dashboard({ canWrite, setupError, members, months, memberTotals, chartMonth, chartMembers }: Props) {
  const router = useRouter();
  const now = currentMonth();

  // A member missing from today's list has stopped being one, or was removed.
  const memberIds = new Set(members.map((m) => m.id));

  /**
   * Every member today — admins first — with nothing
   * yet showing as zeros, and after them anyone who has history but isn't a
   * member any more.
   */
  const memberRows = useMemo(() => {
    const byId = new Map(memberTotals.filter((r) => r.member_id).map((r) => [r.member_id!, r]));
    const current: MemberTotals[] = members.map(
      (m) =>
        byId.get(m.id) ?? {
          member_id: m.id,
          member_name: m.name,
          total_in: 0,
          total_out: 0,
          base_fee: 0,
          transfer_in: 0,
          transfer_out: 0,
          net: 0,
        },
    );
    const former = memberTotals.filter((r) => !r.member_id || !memberIds.has(r.member_id));
    return [...current, ...former];
    // memberIds is derived from members.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, memberTotals]);

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
            Dashboard
          </Typography.Title>
          <Typography.Text type="secondary">
            {canWrite ? "Every month so far." : "Your own figures — your share of each transaction."} Months run from
            the 20th to the 19th — this one is {monthLabel(now)}, {monthSpan(now)}.
          </Typography.Text>
        </div>
        {canWrite && <FinanceActions month={now} members={members} />}
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

      <MemberEarnings month={chartMonth} members={chartMembers} />

      <Card variant="borderless" style={{ marginTop: 16 }} styles={{ body: { padding: 0 } }} title="By month">
        <Table<MonthTotals>
          rowKey="period"
          size="middle"
          dataSource={months}
          pagination={months.length > 24 ? { pageSize: 24, showSizeChanger: false } : false}
          scroll={{ x: 860 }}
          onRow={(m) => ({
            // period is the month's first day, 2026-11-01 — its key is 2026-11.
            onClick: () => router.push(`/transactions?m=${m.period.slice(0, 7)}`),
            style: { cursor: "pointer" },
          })}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing recorded yet." /> }}
          columns={[
            {
              title: "Month",
              key: "month",
              width: 260,
              render: (_, m) => {
                const month = { year: Number(m.period.slice(0, 4)), month: Number(m.period.slice(5, 7)) };
                return (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{monthLabel(month)}</span>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {monthSpan(month)}
                    </Typography.Text>
                  </span>
                );
              },
            },
            {
              title: "Records",
              dataIndex: "transactions",
              align: "right",
              width: 100,
              render: (v: number) => <span className="tw-num">{v}</span>,
            },
            ...figureColumns<MonthTotals>(),
            { title: "", key: "go", width: 40, render: () => <RightOutlined style={{ color: "#cbd5e1" }} /> },
          ]}
        />
      </Card>

      <Card
        variant="borderless"
        style={{ marginTop: 16 }}
        styles={{ body: { padding: 0 } }}
        title="Members"
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Every month so far · click for this month&apos;s transactions
          </Typography.Text>
        }
      >
        <Table<MemberTotals>
          rowKey={(r) => r.member_id ?? `removed:${r.member_name}`}
          size="middle"
          dataSource={memberRows}
          pagination={false}
          scroll={{ x: 720 }}
          onRow={(r) => ({
            onClick: () =>
              router.push(
                `/transactions?m=${monthKey(now)}&member=${encodeURIComponent(r.member_id ?? `name:${r.member_name}`)}`,
              ),
            style: { cursor: "pointer" },
          })}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={canWrite ? "Nothing recorded yet — add the first transaction." : "Nothing recorded yet."}
              />
            ),
          }}
          columns={[
            {
              title: "Member",
              key: "member",
              width: 260,
              sorter: (a, b) => a.member_name.localeCompare(b.member_name),
              render: (_, r) => <MemberName name={r.member_name} removed={!r.member_id || !memberIds.has(r.member_id)} />,
            },
            {
              title: (
                <Tooltip title="In minus out — base fees not taken off, transfers not counted">
                  <span>Before base fees</span>
                </Tooltip>
              ),
              key: "before",
              align: "right" as const,
              sorter: (a: MemberTotals, b: MemberTotals) => a.net - b.net,
              render: (_: unknown, r: MemberTotals) => <Signed value={r.net} />,
            },
            {
              title: (
                <Tooltip title="In minus out, then minus their base fees — transfers not counted">
                  <span>After base fees</span>
                </Tooltip>
              ),
              key: "after",
              align: "right" as const,
              sorter: (a: MemberTotals, b: MemberTotals) => a.net - a.base_fee - (b.net - b.base_fee),
              render: (_: unknown, r: MemberTotals) => (
                <Tooltip title={r.base_fee ? `${money(r.base_fee)} in base fees taken off` : "No base fees"}>
                  <span>
                    <Signed value={r.net - r.base_fee} strong />
                  </span>
                </Tooltip>
              ),
            },
            transfersColumn<MemberTotals>(),
            { title: "", key: "go", width: 40, render: () => <RightOutlined style={{ color: "#cbd5e1" }} /> },
          ]}
        />
      </Card>
    </>
  );
}
