"use client";

import { EditOutlined, KeyOutlined, MoreOutlined, PlusOutlined, SafetyOutlined, StopOutlined, UndoOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Dropdown, Empty, Input, Modal, Segmented, Space, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { addMember, setMemberActive, setMemberPassword, updateMember } from "@/app/(app)/members/actions";
import { MemberAvatar } from "@/components/member-avatar";

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  active: boolean;
  created_at: string;
};

type Role = MemberRow["role"];

type Editing =
  | { kind: "add" }
  | { kind: "edit"; member: MemberRow }
  | { kind: "password"; member: MemberRow }
  | null;

const ROLE_HELP: Record<Role, string> = {
  admin: "Records transactions, sees everyone's figures, manages members.",
  member: "Sees only their own share of each transaction and their own figures.",
};

const label = (text: string, required = false) => (
  <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 500, display: "block", marginBottom: 4 }}>
    {text}
    {required && <span style={{ color: "#dc2626" }}> *</span>}
  </Typography.Text>
);

function RolePicker({ value, onChange, disabled }: { value: Role; onChange: (role: Role) => void; disabled?: boolean }) {
  return (
    <div>
      {label("Role", true)}
      <Segmented<Role>
        block
        value={value}
        onChange={onChange}
        disabled={disabled}
        options={[
          { value: "member", label: "Member" },
          { value: "admin", label: "Admin" },
        ]}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
        {disabled ? "You can't change your own role — another admin can." : ROLE_HELP[value]}
      </Typography.Text>
    </div>
  );
}

/** A new member, or a new password: name, email and role for one; a password for both. */
function MemberDialog({ editing, me, onClose }: { editing: Exclude<Editing, null>; me: string; onClose: (saved: boolean) => void }) {
  const { message } = App.useApp();
  const member = editing.kind === "add" ? null : editing.member;
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState<Role>(member?.role ?? "member");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const result =
      editing.kind === "add"
        ? await addMember({ name, email, password, role })
        : editing.kind === "edit"
          ? await updateMember({ id: editing.member.id, name, role })
          : await setMemberPassword(editing.member.id, password);
    setSaving(false);
    if (!result.ok) return void message.error(result.error);
    message.success(
      editing.kind === "add"
        ? `${name.trim()} added. Send them the address and password.`
        : editing.kind === "edit"
          ? "Saved."
          : `New password set for ${editing.member.name}.`,
    );
    onClose(true);
  };

  const passwordField = (
    <div>
      {label(editing.kind === "password" ? "New password" : "Password", true)}
      <Input.Password
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        placeholder="At least 8 characters"
        maxLength={72}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
        Share it with them yourself; they can change it from their account once signed in.
      </Typography.Text>
    </div>
  );

  return (
    <Modal
      title={editing.kind === "add" ? "Add member" : editing.kind === "edit" ? `Edit ${editing.member.name}` : `New password for ${editing.member.name}`}
      open
      onCancel={() => onClose(false)}
      width={480}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={() => onClose(false)}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={save}>
            {editing.kind === "add" ? "Add member" : editing.kind === "edit" ? "Save" : "Set password"}
          </Button>
        </Space>
      }
    >
      <form
        style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {editing.kind !== "password" && (
          <>
            <div>
              {label("Name", true)}
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus placeholder="e.g. Ana Lopez" />
            </div>
            <div>
              {label("Email", editing.kind === "add")}
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={editing.kind === "edit"}
                autoComplete="off"
                placeholder="ana@example.com"
              />
              {editing.kind === "add" && (
                <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
                  What they sign in with.
                </Typography.Text>
              )}
            </div>
            <RolePicker value={role} onChange={setRole} disabled={editing.kind === "edit" && editing.member.id === me} />
          </>
        )}
        {editing.kind !== "edit" && passwordField}
        {/* Enter submits. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/**
 * The team, for an admin. Members are added with a password the admin picks
 * and passes on; there's no sign-up and no invitation email. Deactivating
 * keeps someone's history and stops their sign-in.
 */
export function MembersView({
  me,
  rows,
  setupError,
  canManage,
}: {
  me: string;
  rows: MemberRow[];
  setupError: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const [editing, setEditing] = useState<Editing>(null);

  const toggle = (m: MemberRow) => {
    const turningOff = m.active;
    modal.confirm({
      title: turningOff ? `Deactivate ${m.name}?` : `Reactivate ${m.name}?`,
      content: turningOff
        ? "They won't be able to sign in, and can't be added to new transactions. Their history stays, under their name."
        : "They can sign in again with their password, and be added to transactions.",
      okText: turningOff ? "Deactivate" : "Reactivate",
      okButtonProps: turningOff ? { danger: true } : undefined,
      onOk: async () => {
        const result = await setMemberActive(m.id, !m.active);
        if (!result.ok) {
          message.error(result.error);
          return;
        }
        message.success(turningOff ? `${m.name} deactivated.` : `${m.name} is back.`);
        router.refresh();
      },
    });
  };

  const active = rows.filter((r) => r.active).length;

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
            Members
          </Typography.Title>
          <Typography.Text type="secondary">
            Admins record transactions and see everyone. Members see only their own share.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} disabled={!canManage} onClick={() => setEditing({ kind: "add" })}>
          Add member
        </Button>
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
      {!canManage && !setupError && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="Members can't be changed from here yet"
          description="Adding people and setting passwords needs SUPABASE_SERVICE_ROLE_KEY on the server (Supabase → Project settings → API keys). Set it, redeploy, and these buttons work."
        />
      )}

      <Card
        variant="borderless"
        styles={{ body: { padding: 0 } }}
        title="Team"
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {active} active{rows.length > active ? ` · ${rows.length - active} deactivated` : ""}
          </Typography.Text>
        }
      >
        <Table<MemberRow>
          rowKey="id"
          size="middle"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 640 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nobody yet." /> }}
          columns={[
            {
              title: "Name",
              key: "name",
              render: (_, m) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10, opacity: m.active ? 1 : 0.55 }}>
                  <MemberAvatar name={m.name} size={28} removed={!m.active} />
                  <span style={{ lineHeight: 1.3 }}>
                    <span style={{ fontWeight: 600 }}>{m.name}</span>
                    {m.id === me && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {" "}
                        · you
                      </Typography.Text>
                    )}
                    <br />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {m.email}
                    </Typography.Text>
                  </span>
                </span>
              ),
            },
            {
              title: "Role",
              key: "role",
              width: 130,
              render: (_, m) =>
                m.role === "admin" ? (
                  <Tag bordered={false} color="purple" icon={<SafetyOutlined />}>
                    Admin
                  </Tag>
                ) : (
                  <Tag bordered={false}>Member</Tag>
                ),
            },
            {
              title: "Status",
              key: "status",
              width: 130,
              render: (_, m) =>
                m.active ? (
                  <Tag bordered={false} color="green">
                    Active
                  </Tag>
                ) : (
                  <Tag bordered={false}>Deactivated</Tag>
                ),
            },
            {
              title: "Added",
              dataIndex: "created_at",
              width: 130,
              render: (v: string) => <span className="tw-num">{dayjs(v).format("MMM D, YYYY")}</span>,
            },
            {
              title: "",
              key: "actions",
              width: 56,
              align: "right",
              render: (_, m) => (
                <Dropdown
                  trigger={["click"]}
                  disabled={!canManage}
                  menu={{
                    items: [
                      { key: "edit", icon: <EditOutlined />, label: "Edit name or role", onClick: () => setEditing({ kind: "edit", member: m }) },
                      { key: "password", icon: <KeyOutlined />, label: "Set a new password", onClick: () => setEditing({ kind: "password", member: m }) },
                      ...(m.id === me
                        ? []
                        : [
                            { type: "divider" as const },
                            m.active
                              ? { key: "off", icon: <StopOutlined />, label: "Deactivate", danger: true, onClick: () => toggle(m) }
                              : { key: "on", icon: <UndoOutlined />, label: "Reactivate", onClick: () => toggle(m) },
                          ]),
                    ],
                  }}
                >
                  <Button type="text" icon={<MoreOutlined />} aria-label={`Manage ${m.name}`} />
                </Dropdown>
              ),
            },
          ]}
        />
      </Card>

      {editing && (
        <MemberDialog
          editing={editing}
          me={me}
          onClose={(saved) => {
            setEditing(null);
            if (saved) router.refresh();
          }}
        />
      )}
    </>
  );
}
