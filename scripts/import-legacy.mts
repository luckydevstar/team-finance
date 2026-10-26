/**
 * Loads one team's history from the old finance system into Team Finance:
 * either as a SQL file you run in the team's Supabase SQL editor (--out), or
 * straight into the database with the keys in .env / .env.local (--apply).
 * See SETUP.md, "Importing history from the old finance system".
 *
 *   npm run import:legacy -- --data ../database --out imports/team.sql \
 *     --member JCG=jcg@example.com --member PSR=psr@example.com
 *   npm run import:legacy -- --data ../database --apply \
 *     --member JCG=jcg@example.com --member PSR=psr@example.com
 *
 *   --data    the old system's `database` folder (finance/, users.json,
 *             finance-admin-initials.json)
 *   --out     where to write the SQL
 *   --apply   write to the database directly, with NEXT_PUBLIC_SUPABASE_URL
 *             and SUPABASE_SERVICE_ROLE_KEY from .env.local or .env
 *   --member  OLD=email, once per person: OLD is their old username or
 *             number (1022), email is their Team Finance sign-in
 *   --until   optional, YYYY-MM-DD: leave out records after this day (for
 *             records already entered by hand in Team Finance)
 *
 * What comes over, and how:
 *   - every record that involves at least one of these people. A cost they
 *     shared with others comes over as their part only, with the original
 *     total in the reason ("their part of $233.80 split 14 ways").
 *   - deleted records and records of $0 are left out.
 *   - "Net Fee" records are marked as base fees.
 *   - each person's starting value in the old system (its "initials") is an
 *     "Initial balance" transaction, the day before the history begins.
 *   - the old system split without rounding. Each share here is rounded to
 *     the cent with the remainder carried to that person's next share, so
 *     everyone's final balance equals the old system's, to the cent.
 *
 * Every transaction gets an id derived from the old record's id, so running
 * either again replaces its own earlier import instead of doubling it.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// BigInt constants, not literals: the project compiles for ES2017.
const [ZERO, ONE, TWO, HUNDRED] = [BigInt(0), BigInt(1), BigInt(2), BigInt(100)];

type OldRecord = {
  id: string;
  date: string;
  adminIndices?: number[];
  in?: number | string;
  out?: number | string;
  reason?: string;
  costType?: string;
  createdAt?: string;
  createdByIndex?: number;
  deleted?: boolean;
};
type OldUser = { index: number; username: string };

// ---------------------------------------------------------------- arguments

function parseArgs(argv: string[]) {
  const out = { data: "", out: "", until: "", apply: false, members: [] as Array<{ key: string; email: string }> };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === "--apply") {
      out.apply = true;
      continue;
    }
    if (flag === "--data") out.data = value;
    else if (flag === "--out") out.out = value;
    else if (flag === "--until") out.until = value;
    else if (flag === "--member") {
      const at = value?.indexOf("=") ?? -1;
      if (at < 1) fail(`--member takes OLD=email, got "${value}"`);
      out.members.push({ key: value.slice(0, at).trim(), email: value.slice(at + 1).trim().toLowerCase() });
    } else fail(`Unknown option ${flag}`);
    i++;
  }
  if (!out.data || !(out.out || out.apply) || !out.members.length) {
    fail("Usage: npm run import:legacy -- --data <old database folder> (--out <file.sql> | --apply) --member OLD=email [--member …] [--until YYYY-MM-DD]");
  }
  if (out.until && !/^\d{4}-\d{2}-\d{2}$/.test(out.until)) fail("--until takes a date, YYYY-MM-DD");
  for (const m of out.members) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) fail(`"${m.email}" isn't an email address`);
  return out;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// ------------------------------------------------------------------ money

/** Whole cents from the old files' numbers ("231.4", 1780). Refuses fractions of a cent. */
function cents(value: number | string | undefined): bigint {
  const text = String(value ?? 0).trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) fail(`Not an amount to the cent: "${text}"`);
  const c = BigInt(m[2]) * HUNDRED + BigInt((m[3] ?? "").padEnd(2, "0") || "0");
  return m[1] ? -c : c;
}

const floorDiv = (a: bigint, b: bigint) => (a >= ZERO ? a / b : -((-a + b - ONE) / b));
/** a / b to the nearest whole, halves away from zero — as the old balances were rounded. */
const roundDiv = (a: bigint, b: bigint) => (a >= ZERO ? floorDiv(TWO * a + b, TWO * b) : -floorDiv(-TWO * a + b, TWO * b));
const gcd = (a: bigint, b: bigint): bigint => (b === ZERO ? a : gcd(b, a % b));

function dollars(c: bigint) {
  const sign = c < ZERO ? "-" : "";
  const abs = c < ZERO ? -c : c;
  return `${sign}${(abs / HUNDRED).toLocaleString("en-US")}.${String(abs % HUNDRED).padStart(2, "0")}`;
}
const sqlAmount = (c: bigint) => `${c / HUNDRED}.${String(c % HUNDRED).padStart(2, "0")}`;

// -------------------------------------------------------------------- ids

/** A UUID (v5) from the old record's id: the same record always gets the same id. */
function stableId(name: string) {
  const NAMESPACE = "5b0f2a8e-6f1c-4c3e-9a57-0d7f3c9e2b41";
  const hash = createHash("sha1")
    .update(Buffer.from(NAMESPACE.replace(/-/g, ""), "hex"))
    .update(name)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const q = (value: string | null) => (value === null ? "null" : `'${value.replace(/'/g, "''")}'`);

// ------------------------------------------------------------------- read

const args = parseArgs(process.argv.slice(2));

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    fail(`Couldn't read ${path}: ${(error as Error).message}`);
  }
}

function recordFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "cumulative-by-cycle" ? [] : recordFiles(path);
    return /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name) ? [path] : [];
  });
}

const users = readJson<OldUser[]>(join(args.data, "users.json"));
const initials = readJson<{ byUserIndex: Record<string, number | string> }>(join(args.data, "finance-admin-initials.json")).byUserIndex ?? {};
const records = recordFiles(join(args.data, "finance"))
  .flatMap((file) => readJson<OldRecord[]>(file))
  .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id.localeCompare(b.id));
if (!records.length) fail(`No records under ${join(args.data, "finance")}`);

/** An old person by number, or by username — exact first, then ignoring case if that's unambiguous. */
function oldUser(key: string): OldUser {
  if (/^\d+$/.test(key)) {
    return users.find((u) => u.index === Number(key)) ?? fail(`No old user number ${key}`);
  }
  const exact = users.filter((u) => u.username === key);
  if (exact.length === 1) return exact[0];
  const loose = users.filter((u) => u.username.toLowerCase() === key.toLowerCase());
  if (loose.length === 1) return loose[0];
  if (loose.length > 1) fail(`"${key}" matches ${loose.map((u) => `${u.username} (#${u.index})`).join(" and ")} — use the number instead`);
  fail(`No old user called "${key}". Old usernames: ${users.map((u) => u.username).join(", ")}`);
}

const team = new Map<number, { email: string; old: OldUser }>();
for (const m of args.members) {
  const old = oldUser(m.key);
  if (team.has(old.index)) fail(`${old.username} is listed twice`);
  if ([...team.values()].some((t) => t.email === m.email)) fail(`${m.email} is listed twice`);
  team.set(old.index, { email: m.email, old });
}
const usernameOf = new Map(users.map((u) => [u.index, u.username]));

// ------------------------------------------------------------------- plan

type Tx = {
  id: string;
  date: string;
  direction: "in" | "out";
  baseFee: boolean;
  reason: string | null;
  createdByEmail: string | null;
  createdByName: string;
  createdAt: string;
  parts: Array<{ index: number; cents: bigint }>;
  shared: boolean;
  initial: boolean;
};

const skipped = { deleted: 0, zero: 0, others: 0, after: 0 };
const kept: Array<{ r: OldRecord; ids: number[]; amount: bigint; direction: "in" | "out" }> = [];
for (const r of records) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) fail(`Record ${r.id} has no usable date`);
  if (r.deleted) { skipped.deleted++; continue; }
  if (args.until && r.date > args.until) { skipped.after++; continue; }
  const inn = cents(r.in), out = cents(r.out);
  if (inn < ZERO || out < ZERO || (inn && out)) fail(`Record ${r.id} has both money in and out, or a negative amount`);
  if (!inn && !out) { skipped.zero++; continue; }
  const ids = [...new Set(r.adminIndices ?? [])];
  if (!ids.some((i) => team.has(i))) { skipped.others++; continue; }
  kept.push({ r, ids, amount: inn || out, direction: inn ? "in" : "out" });
}

// Exact shares are fractions of a cent: count them in units of 1/D cent,
// D being divisible by every split size, so the arithmetic stays exact.
const D = kept.reduce((d, k) => (d * BigInt(k.ids.length)) / gcd(d, BigInt(k.ids.length)), ONE);
const exact = new Map<number, bigint>(); // signed, in 1/D cents
const booked = new Map<number, bigint>(); // signed, in cents

const firstDay = kept.length ? kept[0].r.date : records[0].date;
const dayBefore = new Date(`${firstDay}T00:00:00Z`);
dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
const initialDate = dayBefore.toISOString().slice(0, 10);

const txs: Tx[] = [];
for (const index of team.keys()) {
  const start = cents(initials[String(index)]);
  exact.set(index, start * D);
  booked.set(index, start);
  if (start === ZERO) continue;
  txs.push({
    id: stableId(`initial:${index}`),
    date: initialDate,
    direction: start > ZERO ? "in" : "out",
    baseFee: false,
    reason: "Initial balance (carried over from the old finance system)",
    createdByEmail: null,
    createdByName: "old system",
    createdAt: `${initialDate}T00:00:00Z`,
    parts: [{ index, cents: start > ZERO ? start : -start }],
    shared: false,
    initial: true,
  });
}

for (const { r, ids, amount, direction } of kept) {
  const sign = direction === "in" ? ONE : -ONE;
  const each = (amount * D) / BigInt(ids.length); // exact: D is a multiple of ids.length
  const parts = ids
    .filter((i) => team.has(i))
    .map((index) => {
      const after = exact.get(index)! + sign * each;
      const delta = roundDiv(after, D) - booked.get(index)!;
      exact.set(index, after);
      booked.set(index, booked.get(index)! + delta);
      const c = sign * delta;
      if (c <= ZERO) fail(`Record ${r.id}: a share rounds to nothing — split too small to carry over`);
      return { index, cents: c };
    });
  const fee = r.costType === "netFee";
  if (fee && direction === "in") fail(`Record ${r.id} is a Net Fee paid in, which Team Finance can't hold`);
  const shared = parts.length < ids.length;
  let reason = (r.reason ?? "").trim();
  if (shared) {
    const note = `their part of $${dollars(amount)} split ${ids.length} ways`;
    reason = reason ? `${reason} (${note})` : note[0].toUpperCase() + note.slice(1);
  }
  const by = r.createdByIndex;
  txs.push({
    id: stableId(`record:${r.id}`),
    date: r.date,
    direction,
    baseFee: fee,
    reason: reason || null,
    createdByEmail: by !== undefined && team.has(by) ? team.get(by)!.email : null,
    createdByName: by !== undefined ? (usernameOf.get(by) ?? `#${by}`) : "old system",
    createdAt: r.createdAt ?? `${r.date}T12:00:00Z`,
    parts,
    shared,
    initial: false,
  });
}

// The old system's balance for each person: starting value plus every
// share, unrounded, rounded once at the end.
function oldBalance(index: number) {
  let total = cents(initials[String(index)]) * D;
  for (const { ids, amount, direction } of kept) {
    if (ids.includes(index)) total += (direction === "in" ? ONE : -ONE) * ((amount * D) / BigInt(ids.length));
  }
  return roundDiv(total, D);
}
const balances = [...team].map(([index, m]) => {
  const imported = txs.reduce(
    (sum, t) => sum + t.parts.filter((p) => p.index === index).reduce((s, p) => s + (t.direction === "in" ? p.cents : -p.cents), ZERO),
    ZERO,
  );
  return { name: m.old.username, index, email: m.email, old: oldBalance(index), imported };
});
for (const b of balances) {
  if (b.old !== b.imported) fail(`${b.name}: imported ${dollars(b.imported)} doesn't match the old ${dollars(b.old)}`);
}

// ------------------------------------------------------------------ write

const emails = [...team.values()].map((m) => m.email);
const pad = Math.max(...emails.map((e) => e.length));

console.log(`${txs.length} transactions, ${txs.reduce((n, t) => n + t.parts.length, 0)} shares, from ${records.length} old records`);
console.log(`  left out: ${skipped.others} other people's, ${skipped.deleted} deleted, ${skipped.zero} of $0${args.until ? `, ${skipped.after} after ${args.until}` : ""}`);
console.log("  balance after base fees (matches the old system):");
for (const b of balances) console.log(`    ${b.name.padEnd(10)} ${b.email.padEnd(pad)} ${dollars(b.imported).padStart(14)}`);

if (args.out) {
  const lines: string[] = [];
  const emit = (line = "") => lines.push(line);

  emit("-- ===========================================================================");
  emit("-- Team Finance — history imported from the old finance system");
  emit("--");
  emit(`-- Written by scripts/import-legacy.mts on ${new Date().toISOString().slice(0, 10)}, from ${records.length} old records.`);
  emit("--");
  emit("-- Who (old user → Team Finance sign-in):");
  for (const [index, m] of team) emit(`--   ${m.old.username.padEnd(10)} #${index}  →  ${m.email}`);
  emit("--");
  emit(`-- What: ${txs.length} transactions with ${txs.reduce((n, t) => n + t.parts.length, 0)} shares —`);
  emit(`--   ${txs.filter((t) => t.initial).length} initial balances (dated ${initialDate}),`);
  emit(`--   ${txs.filter((t) => t.baseFee).length} base fees (the old "Net Fee"),`);
  emit(`--   ${txs.filter((t) => t.shared).length} costs shared with people outside this list (only their parts).`);
  emit(`-- Left out: ${skipped.others} records of other people only, ${skipped.deleted} deleted, ${skipped.zero} of $0` +
    (args.until ? `, ${skipped.after} after ${args.until}.` : "."));
  emit("--");
  emit("-- Each person's balance after base fees, once imported — the same as the old system's:");
  for (const b of balances) emit(`--   ${b.email.padEnd(pad)}  ${dollars(b.imported).padStart(14)}`);
  emit("--");
  emit("-- BEFORE RUNNING: create every sign-in above in this team's Supabase project");
  emit("-- (SETUP.md, steps 4 and 8). Run this in THAT project's SQL editor.");
  emit("-- Safe to run again: it replaces its own earlier import, and nothing else.");
  emit("-- ===========================================================================");
  emit();
  emit("begin;");
  emit();
  emit("-- Everyone must have a sign-in and a member row first; their names come from there.");
  emit("do $$");
  emit("declare");
  emit("  missing text;");
  emit("begin");
  emit("  select string_agg(e, ', ') into missing");
  emit(`    from unnest(array[${emails.map(q).join(", ")}]) as e`);
  emit("   where not exists (select 1 from member m where lower(m.email) = e);");
  emit("  if missing is not null then");
  emit("    raise exception 'Add these people to the team first, then run this again: %', missing");
  emit("      using hint = 'The admin: Authentication → Users, then select finance_make_admin(email, name). Everyone else: the Members page.';");
  emit("  end if;");
  emit("end $$;");
  emit();
  emit("create temp table legacy_transaction (");
  emit("  id uuid, occurred_on date, direction text, amount numeric(14, 2), base_fee boolean,");
  emit("  reason text, created_by_email text, created_by_name text, created_at timestamptz");
  emit(") on commit drop;");
  emit("create temp table legacy_share (transaction_id uuid, email text, amount numeric(14, 2)) on commit drop;");
  emit();
  emit("insert into legacy_transaction values");
  txs.forEach((t, i) => {
    const total = t.parts.reduce((s, p) => s + p.cents, ZERO);
    emit(`  (${q(t.id)}, ${q(t.date)}, ${q(t.direction)}, ${sqlAmount(total)}, ${t.baseFee}, ${q(t.reason)}, ${q(t.createdByEmail)}, ${q(t.createdByName)}, ${q(t.createdAt)})${i < txs.length - 1 ? "," : ";"}`);
  });
  emit();
  emit("insert into legacy_share values");
  const shareRows = txs.flatMap((t) => t.parts.map((p) => `  (${q(t.id)}, ${q(team.get(p.index)!.email)}, ${sqlAmount(p.cents)})`));
  shareRows.forEach((row, i) => emit(`${row}${i < shareRows.length - 1 ? "," : ";"}`));
  emit();
  emit("-- An earlier run of this import, replaced rather than doubled (its shares go with it).");
  emit("delete from finance_transaction where id in (select id from legacy_transaction);");
  emit();
  emit("insert into finance_transaction (id, occurred_on, direction, amount, base_fee, reason, created_by, created_by_name, created_at)");
  emit("select t.id, t.occurred_on, t.direction, t.amount, t.base_fee, t.reason, m.id, coalesce(m.name, t.created_by_name), t.created_at");
  emit("  from legacy_transaction t");
  emit("  left join member m on lower(m.email) = t.created_by_email;");
  emit();
  emit("insert into finance_share (transaction_id, member_id, member_name, amount)");
  emit("select s.transaction_id, m.id, m.name, s.amount");
  emit("  from legacy_share s");
  emit("  join member m on lower(m.email) = s.email;");
  emit();
  emit("commit;");
  emit();
  emit("-- Check: each person's balance after base fees. Before anything else is");
  emit("-- recorded, these equal the figures at the top of this file.");
  emit("select m.name, m.email,");
  emit("       sum(case when t.direction = 'in' then s.amount else -s.amount end) as after_base_fees");
  emit("  from member m");
  emit("  join finance_share s on s.member_id = m.id");
  emit("  join finance_transaction t on t.id = s.transaction_id");
  emit(` where lower(m.email) in (${emails.map(q).join(", ")})`);
  emit(" group by m.name, m.email");
  emit(" order by m.name;");

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${lines.join("\n")}\n`);

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${lines.join("\n")}\n`);
  console.log(`✓ wrote ${args.out}`);
}

if (args.apply) await applyToDatabase();

// ------------------------------------------------------------------ apply

/**
 * The same import as the SQL file, through Supabase's API with the service
 * role: replace an earlier run's rows, insert the transactions, then their
 * shares — undoing the transactions if the shares fail — and read the shares
 * back to check every balance.
 */
async function applyToDatabase() {
  // .env.local wins over .env, as in Next; neither overrides the shell.
  for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("--apply needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local or .env");

  const rest = async <T,>(path: string, init: { method?: string; body?: unknown; range?: string } = {}): Promise<T> => {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      method: init.method ?? "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
        ...(init.range ? { Range: init.range } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]} → ${response.status} ${text}`);
    return (text ? JSON.parse(text) : null) as T;
  };
  const chunks = <T,>(list: T[], size = 100) =>
    Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

  const host = new URL(url).host;
  console.log(`\napplying to ${host}`);

  const members = await rest<Array<{ id: string; name: string; email: string }>>("member?select=id,name,email");
  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));
  const missing = emails.filter((e) => !byEmail.has(e));
  if (missing.length) fail(`Add these people to the team first (Members page), then run this again: ${missing.join(", ")}`);

  const ids = txs.map((t) => t.id);
  for (const part of chunks(ids)) await rest(`finance_transaction?id=in.(${part.join(",")})`, { method: "DELETE" });

  await rest("finance_transaction", {
    method: "POST",
    body: txs.map((t) => {
      const by = t.createdByEmail ? byEmail.get(t.createdByEmail) : undefined;
      return {
        id: t.id,
        occurred_on: t.date,
        direction: t.direction,
        amount: sqlAmount(t.parts.reduce((s, p) => s + p.cents, ZERO)),
        base_fee: t.baseFee,
        reason: t.reason,
        created_by: by?.id ?? null,
        created_by_name: by?.name ?? t.createdByName,
        created_at: t.createdAt,
      };
    }),
  });
  try {
    await rest("finance_share", {
      method: "POST",
      body: txs.flatMap((t) =>
        t.parts.map((p) => {
          const m = byEmail.get(team.get(p.index)!.email)!;
          return { transaction_id: t.id, member_id: m.id, member_name: m.name, amount: sqlAmount(p.cents) };
        }),
      ),
    });
  } catch (error) {
    for (const part of chunks(ids)) await rest(`finance_transaction?id=in.(${part.join(",")})`, { method: "DELETE" });
    fail(`The shares didn't save, so the transactions were taken back out: ${(error as Error).message}`);
  }

  // Read back exactly what was imported, and add it up per person.
  const direction = new Map(txs.map((t) => [t.id, t.direction]));
  const stored = new Map<string, bigint>();
  let rows = 0;
  for (const part of chunks(ids)) {
    const shares = await rest<Array<{ transaction_id: string; member_id: string; amount: number | string }>>(
      `finance_share?select=transaction_id,member_id,amount&transaction_id=in.(${part.join(",")})`,
      { range: "0-9999" },
    );
    rows += shares.length;
    for (const s of shares) {
      const c = cents(s.amount);
      stored.set(s.member_id, (stored.get(s.member_id) ?? ZERO) + (direction.get(s.transaction_id) === "in" ? c : -c));
    }
  }
  const expectedRows = txs.reduce((n, t) => n + t.parts.length, 0);
  let ok = rows === expectedRows;
  console.log(`✓ ${txs.length} transactions and ${rows} shares in the database`);
  for (const b of balances) {
    const got = stored.get(byEmail.get(b.email)!.id) ?? ZERO;
    ok &&= got === b.imported;
    console.log(`    ${b.email.padEnd(pad)} ${dollars(got).padStart(14)}  ${got === b.imported ? "✓" : `✗ expected ${dollars(b.imported)}`}`);
  }
  if (!ok) fail("What's in the database doesn't match — check it before using the app.");
}
