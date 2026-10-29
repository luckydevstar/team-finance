"use client";

import { InfoCircleOutlined } from "@ant-design/icons";
import { App, Button, Checkbox, DatePicker, InputNumber, Input, Modal, Segmented, Select, Space, Tooltip, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState, type ReactNode } from "react";

import { saveTransaction } from "@/app/actions";
import { money, splitEvenly } from "@/lib/money";
import type { Direction, Member, Transaction } from "@/lib/types";

type Draft = {
  id: string | null;
  date: Dayjs;
  direction: Direction;
  amount: number | null;
  members: string[];
  baseFee: boolean;
  transfer: boolean;
  reason: string;
};

export function draftFrom(transaction: Transaction | null, defaultDate: Dayjs): Draft {
  if (!transaction) {
    return { id: null, date: defaultDate, direction: "out", amount: null, members: [], baseFee: false, transfer: false, reason: "" };
  }
  return {
    id: transaction.id,
    date: dayjs(transaction.occurred_on),
    direction: transaction.direction,
    amount: transaction.amount,
    members: transaction.shares.map((s) => s.member_id).filter((id): id is string => Boolean(id)),
    baseFee: transaction.base_fee,
    transfer: transaction.transfer,
    reason: transaction.reason ?? "",
  };
}

/** One of the special kinds a transaction can be marked as: a checkbox with what it means under it. */
function KindOption({
  checked,
  disabled = false,
  onChange,
  title,
  note,
  edge,
  tint,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  note: ReactNode;
  edge: string;
  tint: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${checked ? edge : "#e2e8f0"}`,
        background: checked ? tint : "#fff",
      }}
    >
      <Checkbox checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 1 }}>
        <span style={{ fontWeight: 500 }}>{title}</span>
        <div style={{ fontSize: 12, color: "#64748b" }}>{note}</div>
      </Checkbox>
    </div>
  );
}

/**
 * Adding or editing a transaction: when, in or out, how much, for whom, and
 * why. Several members split the amount equally — the preview shows each
 * share before saving, to the cent. A base fee or an internal transfer is
 * marked here — one or the other — and kept out of monthly earnings.
 */
export function TransactionDialog({
  open,
  initial,
  members,
  onClose,
}: {
  open: boolean;
  initial: Draft;
  members: Member[];
  onClose: (saved: boolean) => void;
}) {
  const { message } = App.useApp();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const patch = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));

  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const shares = splitEvenly(draft.amount ?? 0, draft.members.length);
  const uneven = shares.length > 1 && shares[0] !== shares[shares.length - 1];

  const save = async () => {
    if (!draft.amount || draft.amount <= 0) return void message.error("Enter an amount above zero.");
    if (!draft.members.length) return void message.error("Choose at least one member.");
    if (shares.length && shares[shares.length - 1] <= 0) {
      return void message.error("That amount is too small to split between that many members.");
    }
    setSaving(true);
    const result = await saveTransaction({
      id: draft.id,
      occurredOn: draft.date.format("YYYY-MM-DD"),
      direction: draft.direction,
      amount: draft.amount,
      baseFee: draft.baseFee,
      transfer: draft.transfer,
      reason: draft.reason,
      members: draft.members,
    });
    setSaving(false);
    if (!result.ok) return void message.error(result.error);
    message.success(draft.id ? "Transaction updated." : "Transaction added.");
    onClose(true);
  };

  const label = (text: string, required = false) => (
    <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>
      {text}
      {required && <span style={{ color: "#dc2626" }}> *</span>}
    </Typography.Text>
  );

  return (
    <Modal
      title={draft.id ? "Edit transaction" : "Add transaction"}
      open={open}
      onCancel={() => onClose(false)}
      width={560}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={() => onClose(false)}>Cancel</Button>
          <Tooltip title="Ctrl + Enter">
            <Button type="primary" loading={saving} onClick={save}>
              {draft.id ? "Save changes" : "Add transaction"}
            </Button>
          </Tooltip>
        </Space>
      }
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save();
        }}
      >
        <Segmented<Direction>
          block
          value={draft.direction}
          // A base fee is always money out, so switching to "in" unmarks it.
          onChange={(direction) => patch(direction === "in" ? { direction, baseFee: false } : { direction })}
          options={[
            { value: "in", label: <span style={{ color: draft.direction === "in" ? "#16a34a" : undefined }}>Money in</span> },
            { value: "out", label: <span style={{ color: draft.direction === "out" ? "#dc2626" : undefined }}>Money out</span> },
          ]}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            {label("Date", true)}
            <DatePicker
              value={draft.date}
              allowClear={false}
              format="MMM D, YYYY"
              style={{ width: "100%" }}
              onChange={(date) => date && patch({ date })}
            />
          </div>
          <div>
            {label("Amount", true)}
            <InputNumber<number>
              autoFocus
              value={draft.amount}
              min={0.01}
              step={10}
              precision={2}
              prefix="$"
              placeholder="0.00"
              style={{ width: "100%" }}
              formatter={(v) => (v === undefined || v === null || `${v}` === "" ? "" : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ","))}
              parser={(v) => Number((v ?? "").replace(/[^\d.]/g, ""))}
              onChange={(amount) => patch({ amount: amount ?? null })}
            />
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            {label("Members", true)}
            <Space size={4}>
              <Button size="small" type="link" style={{ paddingInline: 4 }} onClick={() => patch({ members: members.map((m) => m.id) })}>
                Everyone
              </Button>
              <Button size="small" type="link" style={{ paddingInline: 4 }} disabled={!draft.members.length} onClick={() => patch({ members: [] })}>
                Clear
              </Button>
            </Space>
          </div>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Who is it for? Pick one or several"
            style={{ width: "100%" }}
            value={draft.members}
            onChange={(next) => patch({ members: next })}
            maxTagCount="responsive"
            options={members.map((m) => ({ value: m.id, label: m.name }))}
          />
          <div
            style={{
              marginTop: 8,
              padding: "8px 12px",
              borderRadius: 10,
              background: "#f8fafc",
              fontSize: 13,
              color: "#475569",
            }}
          >
            {!draft.members.length ? (
              "Pick members — several split the amount equally."
            ) : draft.members.length === 1 ? (
              <>
                All of it to <b>{nameOf.get(draft.members[0])}</b>
                {draft.amount ? <> · {money(draft.amount)}</> : null}
              </>
            ) : (
              <>
                Split between <b>{draft.members.length}</b>
                {draft.amount ? (
                  <>
                    {" "}
                    — <b>{money(shares[shares.length - 1])}</b> each
                    {uneven && (
                      <Tooltip title="Cents don't always divide evenly: the first members get one cent more, so the shares add up to the whole.">
                        <span style={{ color: "#94a3b8" }}>
                          {" "}
                          (+1¢ for {shares.filter((s) => s > shares[shares.length - 1]).length}) <InfoCircleOutlined />
                        </span>
                      </Tooltip>
                    )}
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* One or the other, or neither: marking one unmarks the other. */}
        <div style={{ display: "grid", gap: 8 }}>
          <KindOption
            checked={draft.baseFee}
            disabled={draft.direction === "in"}
            onChange={(baseFee) => patch(baseFee ? { baseFee, transfer: false } : { baseFee })}
            title="Base fee"
            note={
              draft.direction === "in"
                ? "Only money out can be a base fee."
                : "A special fee: not counted in monthly in, out or net — taken off only in “after base fees”."
            }
            edge="#fcd34d"
            tint="#fffbeb"
          />
          <KindOption
            checked={draft.transfer}
            onChange={(transfer) => patch(transfer ? { transfer, baseFee: false } : { transfer })}
            title="Internal transfer"
            note="Money moved within the team: not counted in monthly in, out or net, or in anyone's earnings — shown on its own."
            edge="#67e8f9"
            tint="#ecfeff"
          />
        </div>

        <div>
          {label("Reason")}
          <Input.TextArea
            value={draft.reason}
            onChange={(e) => patch({ reason: e.target.value })}
            placeholder="e.g. IPRoyal proxies, client payment, Upwork connects"
            autoSize={{ minRows: 2, maxRows: 5 }}
            maxLength={2000}
          />
        </div>
      </div>
    </Modal>
  );
}
