"use client";

import { Avatar, Tooltip } from "antd";

/** Soft tints, picked by name, so the same person is the same colour everywhere. */
const TINTS = [
  ["#eef2ff", "#4338ca"],
  ["#ecfdf5", "#047857"],
  ["#fef3c7", "#b45309"],
  ["#fce7f3", "#be185d"],
  ["#e0f2fe", "#0369a1"],
  ["#f3e8ff", "#7e22ce"],
  ["#ffedd5", "#c2410c"],
  ["#f1f5f9", "#334155"],
] as const;

function tintOf(name: string) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

/** Up to two initials: "Ana Lopez" → AL, "JCG" → JC. */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

export function MemberAvatar({ name, size = 26, removed = false }: { name: string; size?: number; removed?: boolean }) {
  const [bg, ink] = removed ? (["#f1f5f9", "#94a3b8"] as const) : tintOf(name);
  return (
    <Avatar size={size} style={{ background: bg, color: ink, fontSize: size * 0.4, fontWeight: 600, flex: "none" }}>
      {initials(name)}
    </Avatar>
  );
}

/** A member with their avatar; greyed, and said so, once the account is gone. */
export function MemberName({ name, removed = false }: { name: string; removed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <MemberAvatar name={name} removed={removed} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: removed ? "#94a3b8" : undefined }}>
        {name}
      </span>
      {removed && (
        <Tooltip title="This account was removed; its history stays.">
          <span style={{ fontSize: 11, color: "#94a3b8" }}>(removed)</span>
        </Tooltip>
      )}
    </span>
  );
}
