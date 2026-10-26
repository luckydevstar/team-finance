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
- **Months run from the 20th to the 19th.** "November 2026" is Oct 20 –
  Nov 19: a payment on Oct 19 is October's, one on Oct 20 November's. The
  schema's `finance_period()` and `src/lib/month.ts` both define this, so
  change both if you change it.
- **Dashboard** (`/`). Every member's earnings for a month you pick
  (`?m=2026-11`) in one bar chart: a bar per member, in − out with base fees
  not counted; hovering shows the in and out. Then each month's in, out,
  base fees and net, and each member's amount before and after their base
  fees.
- **Transactions** (`/transactions?m=2026-11`). One month: its money in,
  money out and net, and its transactions, filtered by type, member and
  text.

## Who sees what

| | sees | records, edits, removes |
| --- | --- | --- |
| admin | everything: every transaction whole, every member's figures | transactions and members |
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

You need a Supabase project and somewhere to run Next.js (Vercel works).

1. **Create a Supabase project.**
2. **Run the schema.** Open the SQL editor, paste all of
   `supabase/schema.sql` and run it. It's safe to run again after an update.
3. **Turn off sign-ups.** In Authentication → Sign In / Providers, turn off
   **Allow new users to sign up**. Only admins add people.
4. **Create the first admin.**
   1. In Authentication → Users, choose **Add user → Create new user**.
      Enter your email and a password, and tick **Auto Confirm User**.
   2. Back in the SQL editor, run:

      ```sql
      select finance_make_admin('you@example.com', 'Your Name');
      ```
5. **Configure the app.** Copy `.env.example` to `.env.local` and fill in the
   values from Project settings → API keys:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   - `SUPABASE_SERVICE_ROLE_KEY`. The Members page uses it to create
     sign-ins and set passwords. It stays on the server and is never sent to
     a browser.
   - Optionally, `NEXT_PUBLIC_TIME_ZONE`, which decides which day "today" is
     (default `America/New_York`).
6. **Run it.** `npm ci`, then `npm run dev` (port 3200), and sign in. To
   deploy on Vercel, import the repository and set the same variables.
7. **Add your team** on the Members page.

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
- base fees kept out of net
- history surviving a deactivated member or a deleted account
