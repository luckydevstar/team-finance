"use client";

import { EditOutlined, WalletOutlined } from "@ant-design/icons";
import { App, Button, Card, DatePicker, InputNumber, Modal, Space, Typography } from "antd";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { saveWallet } from "@/app/actions";
import { Plain } from "@/components/figures";
import { money } from "@/lib/money";
import { currentMonth, monthKey, monthLabel, monthOf, monthRange, monthSpan, type Month } from "@/lib/month";
import type { Wallet } from "@/lib/types";

/** Oct 20, 2026 */
const day = (date: string) => dayjs(date).format("MMM D, YYYY");

/** What the wallet holds: red below zero, plain otherwise — it's a balance, not a gain. */
export function Balance({ value }: { value: number }) {
  return <span className={`tw-num ${value < 0 ? "tw-out" : ""}`}>{money(value)}</span>;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
        {label}
      </Typography.Text>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{children}</span>
    </div>
  );
}

/**
 * Where the wallet starts — a month, which begins on the 20th of the one
 * before — and what it held then. November by default when nothing is set
 * yet, or whichever month is the current one.
 */
function WalletDialog({ wallet, onClose }: { wallet: Wallet | null; onClose: (saved: boolean) => void }) {
  const { message } = App.useApp();
  const [month, setMonth] = useState<Month>(wallet ? monthOf(wallet.starts_on) : currentMonth());
  const [amount, setAmount] = useState<number | null>(wallet ? wallet.opening_balance : null);
  const [saving, setSaving] = useState(false);
  const { from } = monthRange(month);

  const save = async () => {
    if (amount === null) return void message.error("Enter what the wallet held then — 0 if it was empty.");
    setSaving(true);
    const result = await saveWallet({ startsOn: from, openingBalance: amount });
    setSaving(false);
    if (!result.ok) return void message.error(result.error);
    message.success("Wallet set.");
    onClose(true);
  };

  const label = (text: string) => (
    <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>
      {text}
    </Typography.Text>
  );

  return (
    <Modal
      title="Wallet's starting balance"
      open
      onCancel={() => onClose(false)}
      width={460}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={() => onClose(false)}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={save}>
            Save
          </Button>
        </Space>
      }
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save();
        }}
      >
        <div>
          {label("Starts in")}
          <DatePicker
            picker="month"
            allowClear={false}
            format="MMMM YYYY"
            value={dayjs(`${monthKey(month)}-01`)}
            onChange={(date) => date && setMonth({ year: date.year(), month: date.month() + 1 })}
            style={{ width: "100%" }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {monthSpan(month)} — the wallet starts on {day(from)}
          </Typography.Text>
        </div>
        <div>
          {label("What it held then")}
          <InputNumber<number>
            autoFocus
            value={amount}
            min={0}
            step={100}
            precision={2}
            prefix="$"
            placeholder="0.00"
            style={{ width: "100%" }}
            formatter={(v) => (v === undefined || v === null || `${v}` === "" ? "" : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ","))}
            parser={(v) => Number((v ?? "").replace(/[^\d.]/g, ""))}
            onChange={(value) => setAmount(value ?? null)}
          />
        </div>
        <div style={{ padding: "8px 12px", borderRadius: 10, background: "#f8fafc", fontSize: 13, color: "#475569" }}>
          Every transaction from {day(from)} on moves it: money in adds, money out takes away — base fees and transfers
          too. Earlier ones don&apos;t count.
        </div>
      </div>
    </Modal>
  );
}

/**
 * The team's one wallet, on the dashboard: what it holds after every
 * transaction so far, what it started with, and what came in and went out
 * since. Admins only — it's everyone's money at once.
 */
export function WalletCard({ wallet }: { wallet: Wallet | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | null>(null);

  return (
    <Card
      variant="borderless"
      style={{ marginBottom: 16 }}
      title={
        <span>
          <WalletOutlined style={{ color: "#4f46e5", marginRight: 8 }} />
          Wallet
        </span>
      }
      extra={
        wallet && (
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(Date.now())}>
            Starting balance
          </Button>
        )
      }
    >
      {wallet ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "16px 32px" }}>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              In the wallet now
            </Typography.Text>
            <div style={{ fontSize: 30, fontWeight: 650, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
              <Balance value={wallet.balance} />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              After every transaction since {day(wallet.starts_on)}, the start of {monthLabel(monthOf(wallet.starts_on))}
            </Typography.Text>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 28px" }}>
            <Stat label="Started with">
              <span className="tw-num">{money(wallet.opening_balance)}</span>
            </Stat>
            <Stat label="In since">
              <Plain value={wallet.total_in} className="tw-in" />
            </Stat>
            <Stat label="Out since">
              <Plain value={wallet.total_out} className="tw-out" />
            </Stat>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <Typography.Text type="secondary">
            Set what the wallet held when a month began, and it shows what&apos;s in it after every transaction.
          </Typography.Text>
          <Button type="primary" onClick={() => setEditing(Date.now())}>
            Set starting balance
          </Button>
        </div>
      )}

      {editing !== null && (
        <WalletDialog
          key={editing}
          wallet={wallet}
          onClose={(saved) => {
            setEditing(null);
            if (saved) router.refresh();
          }}
        />
      )}
    </Card>
  );
}
