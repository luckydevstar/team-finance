"use client";

import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { App, Button, Empty, Popconfirm, Space, Table, Tag, Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { deleteTransaction } from "@/app/actions";
import { Signed } from "@/components/figures";
import { MemberAvatar, MemberName } from "@/components/member-avatar";
import { draftFrom, TransactionDialog } from "@/components/transaction-dialog";
import { Balance } from "@/components/wallet";
import { money } from "@/lib/money";
import type { Member, Share, Transaction } from "@/lib/types";

/** Whose share to show when the list is narrowed to one member: by account, or by name once it's gone. */
export type Focus = { id: string | null; name: string } | null;

export const shareOf = (t: Transaction, focus: Focus): Share | undefined =>
  focus ? t.shares.find((s) => (focus.id ? s.member_id === focus.id : !s.member_id && s.member_name === focus.name)) : undefined;

/**
 * Transactions as a table, for the history page. An admin edits and
 * removes from here. With a `focus`, amounts are that member's share, "of"
 * the whole. `showWallet` adds what the wallet held after each.
 */
export function TransactionsTable({
  transactions,
  members,
  canWrite,
  showWallet = false,
  focus = null,
  empty,
}: {
  transactions: Transaction[];
  members: Member[];
  canWrite: boolean;
  showWallet?: boolean;
  focus?: Focus;
  empty: ReactNode;
}) {
  const router = useRouter();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<{ key: number; transaction: Transaction } | null>(null);

  const remove = async (t: Transaction) => {
    const result = await deleteTransaction(t.id);
    if (!result.ok) return void message.error(result.error);
    message.success("Transaction removed.");
    router.refresh();
  };

  return (
    <>
      <Table<Transaction>
        rowKey="id"
        size="middle"
        dataSource={transactions}
        pagination={transactions.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
        scroll={{ x: showWallet ? 1120 : 980 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} /> }}
        columns={[
          {
            title: "Date",
            dataIndex: "occurred_on",
            width: 110,
            sorter: (a, b) => a.occurred_on.localeCompare(b.occurred_on),
            render: (v: string) => (
              <span className="tw-num">{dayjs(v).format(dayjs(v).year() === dayjs().year() ? "MMM D" : "MMM D, YYYY")}</span>
            ),
          },
          {
            title: "Type",
            key: "type",
            width: 150,
            render: (_, t) => (
              <Space size={4} wrap>
                <Tag color={t.direction === "in" ? "green" : "red"} bordered={false}>
                  {t.direction === "in" ? "In" : "Out"}
                </Tag>
                {t.base_fee && (
                  <Tag color="gold" bordered={false}>
                    Base fee
                  </Tag>
                )}
                {t.transfer && (
                  <Tooltip title="Internal transfer — not counted in earnings">
                    <Tag color="cyan" bordered={false}>
                      Transfer
                    </Tag>
                  </Tooltip>
                )}
              </Space>
            ),
          },
          {
            title: focus ? (
              <Tooltip title={`${focus.name}'s share of each, with the whole amount under it`}>
                <span>Their share</span>
              </Tooltip>
            ) : (
              "Amount"
            ),
            dataIndex: "amount",
            align: "right",
            width: 140,
            sorter: (a, b) => (a.direction === "in" ? 1 : -1) * a.amount - (b.direction === "in" ? 1 : -1) * b.amount,
            render: (v: number, t) => {
              const sign = t.direction === "in" ? 1 : -1;
              // Narrowed to one member: their part of it, which is what their figures add up.
              const share = shareOf(t, focus);
              if (!share || t.shares.length === 1) return <Signed value={sign * v} strong />;
              return (
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.3 }}>
                  <Signed value={sign * share.amount} strong />
                  <Typography.Text type="secondary" className="tw-num" style={{ fontSize: 11 }}>
                    of {money(v)}
                  </Typography.Text>
                </span>
              );
            },
          },
          ...(showWallet
            ? [
                {
                  title: (
                    <Tooltip title="What the wallet held right after each — every transaction counts, whoever it's for">
                      <span>Wallet after</span>
                    </Tooltip>
                  ),
                  key: "wallet",
                  align: "right" as const,
                  width: 140,
                  render: (_: unknown, t: Transaction) =>
                    t.wallet_after == null ? (
                      <Tooltip title="From before the wallet starts">
                        <span className="tw-num tw-zero">—</span>
                      </Tooltip>
                    ) : (
                      <Balance value={t.wallet_after} />
                    ),
                },
              ]
            : []),
          {
            title: "Members",
            key: "members",
            width: 300,
            render: (_, t) =>
              t.shares.length === 1 ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {/* A member's own view: their share, and how many shared it. */}
                  <MemberName name={t.shares[0].member_name} removed={!t.shares[0].member_id} />
                  {t.split && t.split > 1 ? (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      your share · split {t.split} ways
                    </Typography.Text>
                  ) : null}
                </span>
              ) : (
                <Tooltip
                  title={
                    <div style={{ display: "grid", gap: 2 }}>
                      {t.shares.map((s) => (
                        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                          <span>{s.member_name}</span>
                          <span className="tw-num">{money(s.amount)}</span>
                        </div>
                      ))}
                    </div>
                  }
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ display: "inline-flex" }}>
                      {t.shares.slice(0, 5).map((s, i) => (
                        <span key={s.id} style={{ marginLeft: i ? -6 : 0, borderRadius: 999, boxShadow: "0 0 0 2px #fff" }}>
                          <MemberAvatar name={s.member_name} removed={!s.member_id} />
                        </span>
                      ))}
                    </span>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {t.shares.length} members · {money(t.shares[t.shares.length - 1].amount)} each
                    </Typography.Text>
                  </span>
                </Tooltip>
              ),
          },
          {
            title: "Reason",
            dataIndex: "reason",
            ellipsis: { showTitle: true },
            render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: "Recorded by",
            key: "by",
            width: 150,
            render: (_: unknown, t: Transaction) => (
              <Tooltip title={dayjs(t.created_at).format("MMM D, YYYY h:mm A")}>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {t.created_by_name ?? "—"}
                </Typography.Text>
              </Tooltip>
            ),
          },
          ...(canWrite
            ? [
                {
                  title: "",
                  key: "actions",
                  width: 92,
                  fixed: "right" as const,
                  render: (_: unknown, t: Transaction) => (
                    <Space size={0}>
                      <Tooltip title="Edit">
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          aria-label="Edit"
                          onClick={() => setEditing({ key: Date.now(), transaction: t })}
                        />
                      </Tooltip>
                      <Popconfirm
                        title="Remove this transaction?"
                        description="Every member's share of it goes too."
                        okText="Remove"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => remove(t)}
                      >
                        <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove" />
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />

      {editing && (
        <TransactionDialog
          key={editing.key}
          open
          initial={draftFrom(editing.transaction, dayjs())}
          members={members}
          onClose={(saved) => {
            setEditing(null);
            if (saved) router.refresh();
          }}
        />
      )}
    </>
  );
}
