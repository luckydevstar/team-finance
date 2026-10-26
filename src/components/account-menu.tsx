"use client";

import { KeyOutlined } from "@ant-design/icons";
import { App, Button, Dropdown, Input, Modal, Space, Typography } from "antd";
import { useState } from "react";

import { MemberAvatar } from "@/components/member-avatar";
import { createClient } from "@/lib/supabase/browser";

const label = (text: string) => (
  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>
    {text}
  </Typography.Text>
);

/**
 * Changing your own password. The current one is checked first — by signing
 * in with it again — so a session left open on someone's desk can't be used
 * to take the account over.
 */
function PasswordDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const { message } = App.useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!current) return void message.error("Enter your current password.");
    if (next.length < 8) return void message.error("The new password needs at least 8 characters.");
    if (next !== again) return void message.error("The two new passwords don't match.");
    setSaving(true);
    const supabase = createClient();
    const { error: wrong } = await supabase.auth.signInWithPassword({ email, password: current });
    if (wrong) {
      setSaving(false);
      return void message.error("That isn't your current password.");
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setSaving(false);
    if (error) return void message.error(error.message);
    message.success("Password changed.");
    onClose();
  };

  return (
    <Modal
      title="Change password"
      open
      onCancel={onClose}
      width={420}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={save}>
            Change password
          </Button>
        </Space>
      }
    >
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {/* For password managers: which account this is. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <div>
          {label("Current password")}
          <Input.Password value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
        </div>
        <div>
          {label("New password")}
          <Input.Password
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            maxLength={72}
          />
        </div>
        <div>
          {label("New password, again")}
          <Input.Password value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" maxLength={72} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Who's signed in, in the bar; click for your account. */
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const [changing, setChanging] = useState(false);
  return (
    <>
      <Dropdown
        trigger={["click"]}
        placement="bottomRight"
        menu={{
          items: [
            {
              key: "who",
              disabled: true,
              label: (
                <div style={{ lineHeight: 1.35, padding: "2px 0", color: "#0f172a" }}>
                  <div style={{ fontWeight: 600 }}>{name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{email}</div>
                </div>
              ),
            },
            { type: "divider" },
            { key: "password", icon: <KeyOutlined />, label: "Change password", onClick: () => setChanging(true) },
          ],
        }}
      >
        <Button type="text" style={{ display: "inline-flex", alignItems: "center", gap: 8, paddingInline: 6, height: 36 }} aria-label="Your account">
          <MemberAvatar name={name} size={28} />
          <span className="tw-hide-narrow" style={{ fontWeight: 500, fontSize: 14 }}>
            {name}
          </span>
        </Button>
      </Dropdown>
      {changing && <PasswordDialog email={email} onClose={() => setChanging(false)} />}
    </>
  );
}
