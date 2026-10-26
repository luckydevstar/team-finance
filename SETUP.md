# Setting up Team Finance

This guide takes you from nothing to a working Team Finance site your team
can sign in to. It takes about 20–30 minutes. You don't need to write any code.

When you're done you will have:

- a Supabase project holding the data and the sign-ins
- the app running on Vercel (or your own server) at an address you choose
- yourself as the first **admin**, ready to add your team

Contents:

1. [What you need](#what-you-need)
2. [Create the Supabase project](#1-create-the-supabase-project)
3. [Create the database](#2-create-the-database)
4. [Turn off public sign-up](#3-turn-off-public-sign-up)
5. [Create the first admin](#4-create-the-first-admin)
6. [Collect the keys](#5-collect-the-keys)
7. [Try it on your computer (optional)](#6-try-it-on-your-computer-optional)
8. [Deploy on Vercel](#7-deploy-on-vercel)
9. [Add your team](#8-add-your-team)
10. [Start recording](#9-start-recording)

After setup: [Importing old history](#importing-history-from-the-old-finance-system) ·
[Updating](#updating-to-a-new-version) ·
[Customising](#customising) · [Backups](#backups) ·
[Troubleshooting](#troubleshooting) · [Security](#security-checklist)

---

## What you need

| | Why | Cost |
| --- | --- | --- |
| A [Supabase](https://supabase.com) account | Holds the database and the sign-ins | Free plan is enough |
| A [Vercel](https://vercel.com) account | Runs the website | Free (Hobby) plan is enough |
| A [GitHub](https://github.com) account with access to this repository | Vercel deploys from it | Free |
| *Only to run it on your own computer:* [Node.js](https://nodejs.org) 20.9 or newer (22 LTS recommended), npm and git | Building and running the app | Free |

You can host the app somewhere other than Vercel; see
[Other hosts](#other-hosts).

---

## 1. Create the Supabase project

1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) and
   click **New project**.
2. Choose an organization, then fill in:
   - **Project name**: anything, e.g. `team-finance`.
   - **Database password**: click **Generate a password** and save it in
     your password manager. The app doesn't need it, but you will for
     backups or direct database access.
   - **Region**: the one closest to your team.
3. Leave the security options at their defaults. The **Data API** must stay
   enabled, because the app reads and writes through it.
4. Click **Create new project** and wait a minute or two until the
   dashboard shows the project as ready.

> **One project per team.** Use a new, empty project for Team Finance. The
> schema creates tables named `member`, `finance_transaction` and
> `finance_share` in the `public` schema. Don't install it into a project
> that already uses those names.

---

## 2. Create the database

1. In the project, open **SQL Editor** (left sidebar) and click
   **New query** (or the **+** tab).
2. Open [`supabase/schema.sql`](supabase/schema.sql) from this repository,
   copy **the whole file** and paste it into the editor.
3. Click **Run** (or press Ctrl/Cmd + Enter).
4. You should see **Success. No rows returned**. Notices such as
   `relation … does not exist, skipping` are normal.

Check it worked: open **Table Editor**. You should see three tables:
`member`, `finance_transaction` and `finance_share`. All three are empty,
with RLS shown as enabled.

The file is safe to run again; it updates what's there without losing
data. You will re-run it whenever you update the app (see
[Updating](#updating-to-a-new-version)).

---

## 3. Turn off public sign-up

Only admins add people. Nobody should be able to create their own account.

1. Go to **Authentication → Sign In / Providers**. On some dashboard
   versions this is under **Authentication → Providers** or
   **Authentication → Settings**.
2. Under **User Signups**, turn **off** "Allow new users to sign up".
3. Make sure the **Email** provider is enabled. People sign in with email
   and password. It is enabled by default.
4. Click **Save**.

**Optional: password rules.** The app requires at least 8 characters. If you
set stricter rules under **Authentication → Providers → Email** (minimum
length, required characters), Supabase applies them too. A password that
breaks them is refused with Supabase's explanation.

---

## 4. Create the first admin

Two steps: create your sign-in, then make it an admin.

**4a. Create your sign-in**

1. Go to **Authentication → Users** and click **Add user → Create new
   user**.
2. Enter your email and a password.
3. **Tick "Auto Confirm User".** Without it you can't sign in until you
   confirm by email, and the app doesn't send emails.
4. Click **Create user**.

**4b. Make it an admin**

Back in the **SQL Editor**, run (with your own email and name):

```sql
select finance_make_admin('you@example.com', 'Your Name');
```

It returns one row with an id. To check:

```sql
select name, email, role, active from member;
```

You should see yourself with role `admin`.

Every other person is added from the app's **Members** page. You only use
SQL for this first account.

---

## 5. Collect the keys

The app needs three values from Supabase. Keep this tab open; you'll paste
them in step 6 or 7.

| Variable | What to copy | Where in Supabase |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The project URL, like `https://abcdefghijkl.supabase.co` | **Project Settings → Data API** (or the **Connect** button at the top) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The **publishable** key (`sb_publishable_…`), or on older projects the legacy **anon** key | **Project Settings → API Keys** |
| `SUPABASE_SERVICE_ROLE_KEY` | A **secret** key (`sb_secret_…`), or on older projects the legacy **service_role** key | **Project Settings → API Keys** (click to reveal) |

Optional:

| Variable | What it does | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_TIME_ZONE` | The time zone "today" is read in: which month is current, and a new transaction's default date. An [IANA name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) such as `Europe/London` or `Asia/Singapore` | `America/New_York` |

> **Keep the secret key secret.** It bypasses all of the database's access
> rules. It only ever goes in server settings (`.env.local`, Vercel's
> environment variables). Never paste it into a chat, a commit, or a variable
> whose name starts with `NEXT_PUBLIC_`. The app uses it on the server, only
> for the Members page (creating sign-ins, setting passwords, deactivating).

The publishable (anon) key is safe in the browser. Every request made with
it runs as the signed-in person, and the database's rules decide what they
see.

---

## 6. Try it on your computer (optional)

This is a quick way to check the Supabase side before deploying. Skip to
step 7 if you'd rather go straight to Vercel.

```bash
git clone https://github.com/luckydevstar/team-finance.git
cd team-finance
cp .env.example .env.local
```

Open `.env.local` in a text editor and fill in the values from step 5:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
# NEXT_PUBLIC_TIME_ZONE=Europe/London
```

`.env.local` is ignored by git, so it never gets committed. Then:

```bash
npm ci        # install exactly the versions in package-lock.json
npm run dev   # start on http://localhost:3200
```

Open <http://localhost:3200> and sign in with the account from step 4.
You should land on an empty **Dashboard** with **Members** in the top bar.
Stop the server with Ctrl + C.

---

## 7. Deploy on Vercel

1. Sign in at [vercel.com](https://vercel.com) and click
   **Add New… → Project**.
2. Under **Import Git Repository**, find `team-finance` and click
   **Import**. If it isn't listed, click **Adjust GitHub App Permissions**
   and give Vercel access to the repository; it's private.
3. **Framework Preset** should say **Next.js**. Leave the build and output
   settings as they are.
4. Open **Environment Variables** and add each variable from step 5:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_TIME_ZONE` (optional)
5. Click **Deploy** and wait for it to finish (a couple of minutes).
6. Click the preview to open your site (`https://team-finance-….vercel.app`)
   and sign in.

**Your own address (optional).** In the Vercel project, open
**Settings → Domains**, add e.g. `finance.yourcompany.com`, and create the
DNS record Vercel shows you at your domain provider. HTTPS is set up
automatically.

**Then, in Supabase,** set **Authentication → URL Configuration → Site
URL** to your site's address. The app sends no emails, but this keeps any
Supabase email or link from pointing at `localhost`.

**Changing a variable later.** Vercel applies new values only to new
deployments. `NEXT_PUBLIC_` values are also built into the pages. After
changing one, go to **Deployments**, open the latest one's **⋯** menu and
choose **Redeploy**.

**Automatic deploys.** Every push to the `main` branch redeploys the site.

### Other hosts

Any host that runs Node.js 20.9+ works:

```bash
npm ci
npm run build
npx next start -p 3000   # or whatever port your host gives you
```

Set the same environment variables on the host *before* `npm run build`.
The `NEXT_PUBLIC_` ones are read at build time. Put it behind HTTPS.

---

## 8. Add your team

Signed in as an admin, open **Members** in the top bar.

1. Click **Add member**.
2. Enter their **name**, their **email** (what they'll sign in with), a
   **role**, and a starting **password**.
3. Click **Add member**. Their account is ready immediately; there's no
   invitation email.
4. Send them the site address, their email and the password, privately (not
   in a group chat). They can change the password themselves: click their
   name in the top-right corner, then **Change password**.

**Roles**

| Role | Can see | Can do |
| --- | --- | --- |
| **Admin** | Everything: every transaction in full, every member's figures | Record, edit and remove transactions; add and manage members |
| **Member** | Only their own part: their share of each transaction (and how many it was split between), their own monthly figures, their own bar in the chart | Nothing; view only |

A member never sees another member's transactions, income or totals. The
database enforces this; it isn't only hidden in the page.

**Managing people.** Use the **⋯** menu on a member's row to:

- **Edit name or role.** You can't change your own role, so a team always
  keeps an admin. Ask another admin.
- **Set a new password.** Use this when someone forgets theirs.
- **Deactivate.** This blocks their sign-in at once and removes them from
  the list for new transactions. Their history stays, under their name.
  **Reactivate** brings them back with their old password.

People are never deleted from the app, so history always stays readable.

---

## 9. Start recording

- **Add transaction** (Dashboard or Transactions): the date, **money in** or
  **money out**, the amount, one or more members, and a reason.
  - Several members **split the amount equally**, to the cent. If the cents
    don't divide evenly, the first members get one cent more, so the parts
    always add up to the whole. The form shows each share before you save.
  - Tick **Base fee** for the special fee that shouldn't count in monthly
    earnings. It's shown separately and only taken off in a member's "after
    base fees" figure.
- **Months run from the 20th to the 19th.** "November" is Oct 20 – Nov 19:
  a payment on Oct 19 counts in October, one on Oct 20 in November.
  [Customising](#customising) explains how to change this.
- **Starting balances.** There's no separate "opening balance". Enter what
  each member starts with as ordinary transactions, dated in your first
  month.
- **Dashboard.** Shows a chart of every member's earnings for a month (in
  minus out, base fees not counted; hover a bar for its in and out), the
  totals by month, and each member's totals before and after base fees.
- **Transactions.** Shows one month's transactions with its in, out and net,
  filterable by type, member and text.

---

## Importing history from the old finance system

If the team kept its money in the old finance system, you can bring its
history over. Each person's balance comes out exactly as the old system
showed it. You run a script on your computer that writes a SQL file, then
you run that file in the team's Supabase SQL editor. The script never
connects to a database itself.

**You need:** the old system's `database` folder (with `finance/`,
`users.json` and `finance-admin-initials.json` inside), Node.js, and this
repository with `npm ci` done (step 6).

1. **Create everyone's sign-in first** in the team's project: the admin
   with step 4, everyone else on the Members page (step 8). The import
   finds people by email and takes their names from there.
2. **Write the SQL.** List each person once, as their old username (or old
   user number) and the email they sign in with now:

   ```bash
   npm run import:legacy -- --data ../database --out imports/myteam.sql \
     --member JCG=admin@example.com \
     --member PSR=psr@example.com \
     --member SGS=sgs@example.com \
     --member KCS=kch@example.com
   ```

   It prints how many records it found and each person's balance. Those
   balances are checked against the old system, and the script stops if
   any differs.
3. **Run it.** Open `imports/myteam.sql`, copy all of it into the team's
   **SQL Editor** and click **Run**. The last result lists each person's
   balance after base fees. It should match the figures at the top of the
   file.

What comes over:

- **Records involving the listed people.** If a cost was shared with
  someone not on the list, only the listed people's parts come over. The
  reason keeps the original total, e.g. "IPRoyal (their part of $233.80
  split 14 ways)". Records involving only other people are left out.
- **"Net Fee" records** become base fees.
- **Each person's starting value** in the old system becomes an "Initial
  balance" transaction, dated the day before the history begins.
- **Left out:** deleted records and records of $0.
- **"Recorded by"** shows the person's current name if they're on the
  list; otherwise their old username.
- **Months:** the old system's months ran from the 18th to the 17th. Team
  Finance's run from the 20th to the 19th, so a record dated the 18th or
  19th lands in the next month here. Totals are unchanged.

**Running it again is safe.** Each record keeps the same id every time, so
a second run replaces the first import instead of doubling it. Anything
recorded by hand in the app is left alone.

**Already recording in the app?** Add `--until 2026-10-19` (or whichever
day the old system stops counting) so records you've already entered by
hand aren't imported twice.

The `imports/` folder is ignored by git, because it holds the team's real
figures. Keep the SQL file private, and delete it once it's run.

---

## Updating to a new version

When this repository gets new changes:

1. **Database first.** If `supabase/schema.sql` changed, run the whole file
   again in the SQL Editor, as in step 2. It's safe to re-run and keeps your
   data. If you're not sure whether it changed, run it anyway.
2. **Then the app.** Vercel redeploys on its own when `main` changes. On
   another host, pull, then `npm ci && npm run build` and restart.

Running the SQL first matters: a new version of the app may use something
the old database doesn't have yet.

---

## Customising

**Time zone.** Set `NEXT_PUBLIC_TIME_ZONE` (see step 5) and redeploy.

**The day a month starts (the 20th).** This is written in two files, which
must agree:

- `src/lib/month.ts`: `START_DAY = 20`.
- `supabase/schema.sql`:
  - `finance_period()`: the `>= 20` in it.
  - `finance_month_totals()`: the `+ 19` (the month's first day, the 20th)
    and `+ 18` (its last day, the 19th).

Change both files, run `npm run test:core && npm run test:schema` (and fix
the expected dates in the tests), re-run the schema in Supabase, and deploy.

**Port for local development.** In `package.json`, `dev` and `start` use
port 3200; change `--port` if that's taken.

---

## Backups

Your data lives in Supabase. Check what your plan includes under
**Database → Backups**; the free plan's backups are limited. To keep your
own copy:

- **Quick:** in **Table Editor**, open `finance_transaction`,
  `finance_share` and `member` in turn and use **Export → CSV**.
- **Complete:** with PostgreSQL's tools installed, take a full dump using
  the connection string from the **Connect** button (Session pooler) and
  your database password from step 1:

  ```bash
  pg_dump "postgresql://postgres.abcdefghijkl:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres" \
    --schema=public --file=team-finance-backup.sql
  ```

---

## Troubleshooting

| What you see | Why | What to do |
| --- | --- | --- |
| **"Invalid login credentials"** when signing in | Wrong email or password, or no such account | Check for typos. An admin can **Set a new password** on the Members page. If the only admin is locked out, see [Locked out](#locked-out) below. |
| **"Email not confirmed"** | "Auto Confirm User" wasn't ticked in step 4a | In the SQL Editor: `update auth.users set email_confirmed_at = now() where email = 'you@example.com';` |
| **"User is banned"** | The account was deactivated | An admin reactivates it on the Members page. |
| **"This account isn't on the team"** after signing in | The sign-in exists but isn't a member: step 4b wasn't run, or the account was deactivated | For the first admin, run step 4b. For anyone else, an admin adds or reactivates them on the Members page. |
| **"The database isn't set up yet"** on the Dashboard | `schema.sql` hasn't been run, or the app points at a different Supabase project | Run step 2. Check that `NEXT_PUBLIC_SUPABASE_URL` is this project's URL. |
| **"Members can't be changed from here yet"** and the Members buttons are greyed out | `SUPABASE_SERVICE_ROLE_KEY` isn't set on the server | Add it (step 5) to `.env.local` or Vercel, then restart or redeploy. |
| **"There's already an account with that email"** when adding a member | That email already has a sign-in, e.g. created by hand under Authentication → Users | Either delete it under **Authentication → Users** and add the person again from the Members page, or make the existing sign-in a member in SQL (see below). |
| **"No account with that email"** from `finance_make_admin` | Step 4a wasn't done, or the email differs | Create the user first; check the spelling. |
| **"permission denied for table …"** or **"… function …"** | The database is from an older version of `schema.sql` | Run the current `schema.sql` again (step 2). |
| You sign in and get sent straight back to the sign-in page | The URL or key in the environment variables is wrong, or from another project | Check the three values from step 5, then redeploy (Vercel) or restart (`npm run dev`). |
| The site worked, then everything fails after a quiet week | Free Supabase projects pause after a period without use | Open the project in the Supabase dashboard and click **Restore**. |
| A Vercel build fails | Usually a missing environment variable or a typo in one | Check step 7.4, then **Redeploy**. The build log names the problem. |

**Making an existing sign-in a member**, in the SQL Editor (change the
name, email and role):

```sql
insert into member (id, name, email, role)
select id, 'Their Name', lower(email), 'member'
  from auth.users where lower(email) = lower('them@example.com');
```

### Locked out

If no admin can sign in, set a new password directly in the SQL Editor:

```sql
update auth.users
   set encrypted_password = extensions.crypt('a-new-long-password', extensions.gen_salt('bf'))
 where email = 'you@example.com';
```

Then sign in and change it from the account menu. To make another existing
member an admin, run `select finance_make_admin('them@example.com', 'Their Name');`.

---

## Security checklist

- [ ] Public sign-up is **off** (step 3).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is only in server settings: never in a
      `NEXT_PUBLIC_` variable, never committed, never shared.
- [ ] `.env.local` stays out of git (it is ignored by default).
- [ ] Starting passwords are sent privately, and people change them after
      first sign-in.
- [ ] People who leave are **deactivated**, not left active.
- [ ] If the secret key may have leaked: in **Project Settings → API Keys**,
      create a new secret key (or roll the legacy service_role key). Update
      `SUPABASE_SERVICE_ROLE_KEY` on Vercel, redeploy, then delete the old
      key.

Access rules live in the database (row-level security in
`supabase/schema.sql`), not just in the pages. A member using the API
directly still gets only their own share. `npm run test:schema` checks
these rules against a real PostgreSQL. The README's
[Checks](README.md#checks) section explains how to run it.
