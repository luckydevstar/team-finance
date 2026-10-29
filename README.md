# Team Finance

A small team's money, by member and by month: what came in, what went out,
the base fees, what each member earned, and where each stands. Next.js on
Supabase; one admin (or a few) records, and each member sees only their own
share.

## What it does

- **Members.** An admin adds people on the **Members** page with an email
  and a password they pass on. There's no sign-up and no invitation email.
  Each person is an **admin** (records transactions, sees everyone, manages
  members) or a **member** (sees their own share). Deactivating someone
  stops their sign-in and keeps their history.
- **Transactions.** A date, money in or out, an amount, a reason, and one or
  more members. Several members **split the amount equally**, to the cent:
  the odd cents go one each to the first members, so the parts always add up
  to the whole. The form previews each share before saving. Every record
  keeps who made it. Initial figures are ordinary transactions too, dated
  where they belong.
- **Base fees.** Money out can be marked as a base fee. It's kept apart: not
  in monthly in, out or net, shown on its own, and taken off only in a
  member's "after base fees" amount.
- **Internal transfers.** Money in or out can be marked as an internal
  transfer instead: money moved within the team, not earned or spent. It's
  counted nowhere: not in monthly in, out or net, not in the chart, not
  before or after base fees. Transfers show on their own (in less out, with
  both on hover) and have their own filter. A transaction is a base fee or a
  transfer, never both.
- **Wallet.** All the money goes through one wallet. On the dashboard an
  admin sets the month it starts (from that month's first day, the 20th of
  the month before) and what it held then. From that day on every
  transaction moves it — money in adds, money out takes away, base fees and
  transfers too, since they're real money through it; earlier ones don't
  count. The dashboard shows what it holds now; the transactions page what
  it held after each transaction and at the month's end. Admins only.
- **Months run from the 20th to the 19th.** "November 2026" is Oct 20 –
  Nov 19: a payment on Oct 19 is October's, one on Oct 20 November's. The
  schema's `finance_period()` and `src/lib/month.ts` both define this, so
  change both if you change it.
- **Dashboard** (`/`). Every member's earnings for a month you pick
  (`?m=2026-11`) in one bar chart: a bar per member, in − out with base fees
  and transfers not counted; hovering shows the in and out. Then each
  month's in, out, base fees, transfers and net, and each member's amount
  before and after their base fees, and their transfers.
- **Transactions** (`/transactions?m=2026-11`). One month: its money in,
  money out and net, and its transactions, filtered by type, member and
  text.

## Who sees what

| | sees | records, edits, removes |
| --- | --- | --- |
| admin | everything: every transaction whole, every member's figures, the wallet | transactions, members and the wallet |
| member | **only their own part**: their share of each transaction (with how many it was split between), their own monthly figures, their own bar in the chart | nothing |
| deactivated, or not a member | nothing | nothing |

A member never sees another member's transactions, income or totals: not
the whole amount of a transaction they share, not the other members in it,
not their bars in the chart. The database enforces this with row-level
security. Whole transactions are readable by admins only. A member reads
only their own shares. Every figure comes from functions
(`finance_month_totals()`, `finance_member_totals()`,
`finance_member_months()`, `finance_my_shares()`) that count everyone's
shares for an admin and only the caller's for a member.

## Setting it up

**[SETUP.md](SETUP.md) has the full step-by-step guide**, from creating the
Supabase project to adding your team, with troubleshooting. In short:

1. Create a Supabase project and run `supabase/schema.sql` in its SQL
   editor.
2. Turn off public sign-up (Authentication → Sign In / Providers).
3. Add your own user (Authentication → Users, with **Auto Confirm User**
   ticked), then run
   `select finance_make_admin('you@example.com', 'Your Name');`.
4. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`), locally in
   `.env.local` or on Vercel, and deploy.
5. Add your team on the **Members** page.

Moving from the old finance system? `npm run import:legacy` loads a
team's history, as a SQL file or straight into the database (`--apply`),
with every balance checked against the old system. See
[SETUP.md](SETUP.md#importing-history-from-the-old-finance-system).

## Checks

```bash
npm run test:core     # the split, money formatting, months
npm run test:schema   # applies schema.sql to a throwaway Postgres, twice
npm run typecheck && npm run lint && npm run build
```

`test:schema` needs PostgreSQL's `initdb` on your PATH. It applies the
schema twice and asserts:

- the split, to the cent
- who may read and write
- that a member sees only their own part
- the 20th-to-19th months
- base fees and transfers kept out of net
- the wallet's balance after each transaction, and that only admins see it
- history surviving a deactivated member or a deleted account
