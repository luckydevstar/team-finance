-- ===========================================================================
-- Team Finance — schema
--
-- A team's money, by member and by month. Run this file in your Supabase
-- project's SQL editor (Database → SQL editor). Safe to run again: every
-- statement converges, and supabase/tests/run.sh applies it twice to prove it.
--
-- The model:
--
--   member               who uses the app: a Supabase Auth account, with a
--                        name and a role — `admin` (records everything, sees
--                        everything) or `member` (sees their own part).
--   finance_transaction  one entry as it was recorded: a date, money in or
--                        out, the whole amount, why, and who recorded it.
--                        Flagged `base_fee` for the special fee that is kept
--                        out of earnings.
--   finance_share        each member's part of it. Several members on one
--                        transaction split the amount equally, to the cent
--                        (the odd cents go to the first few, so the parts
--                        always add up to the whole).
--
-- Months run from the 20th to the 19th: "November" is Oct 20 – Nov 19. See
-- finance_period() — and src/lib/month.ts, which says the same.
--
-- Who sees what: an admin sees and writes everything. A member sees only
-- their own part — their share of each transaction, their own totals — never
-- another member's. A deactivated member sees nothing.
--
-- First admin: create your account in Supabase (Authentication → Users → Add
-- user), then run, here:
--
--   select finance_make_admin('you@example.com', 'Your Name');
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

create table if not exists member (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  email      text not null,
  role       text not null default 'member' check (role in ('admin', 'member')),
  -- Off takes someone out of the app without losing their history.
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

create table if not exists finance_transaction (
  id              uuid primary key default gen_random_uuid(),
  occurred_on     date not null default current_date,
  direction       text not null check (direction in ('in', 'out')),
  -- The whole amount, before it is split between members. Always positive;
  -- the direction gives the sign.
  amount          numeric(14, 2) not null check (amount > 0),
  -- A base fee is real money, but kept out of earnings: totals show it apart.
  base_fee        boolean not null default false,
  reason          text check (reason is null or char_length(reason) <= 2000),
  created_by      uuid default auth.uid() references member (id) on delete set null,
  -- Kept, so the record still says who made it after the member is gone.
  created_by_name text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists finance_share (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references finance_transaction (id) on delete cascade,
  -- Null once the member is deleted; the name below keeps the history readable.
  member_id      uuid references member (id) on delete set null,
  member_name    text not null,
  amount         numeric(14, 2) not null check (amount > 0),
  unique (transaction_id, member_id)
);

create index if not exists finance_transaction_date_idx on finance_transaction (occurred_on desc, created_at desc);
create index if not exists finance_share_transaction_idx on finance_share (transaction_id);
create index if not exists finance_share_member_idx on finance_share (member_id);

-- ---------------------------------------------------------------------------
-- Months
-- ---------------------------------------------------------------------------

/**
 * The month a date counts in, as that month's first day. Months run from the
 * 20th to the 19th: Oct 19 is October, Oct 20 is November, Dec 20 is next
 * January. src/lib/month.ts says the same; change both.
 */
create or replace function public.finance_period(d date)
returns date
language sql
immutable
as $$
  select (date_trunc('month', d) + case when extract(day from d) >= 20 then interval '1 month' else interval '0' end)::date
$$;

-- ---------------------------------------------------------------------------
-- Who may do what
--
-- SECURITY DEFINER so a policy can ask about the caller's member row without
-- the member table's own policies getting in the way.
-- ---------------------------------------------------------------------------

create or replace function public.finance_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from member where id = auth.uid() and role = 'admin' and active)
$$;

create or replace function public.finance_can_view()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from member where id = auth.uid() and active)
$$;

/**
 * Who can be in a transaction: every active member. An admin gets the whole
 * list; a member gets only themselves, so not even the names behind other
 * members' money reach them.
 */
create or replace function public.finance_members()
returns table (id uuid, name text, email text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.name, m.email, m.role
    from member m
   where finance_can_view()
     and m.active
     and (finance_is_admin() or m.id = auth.uid())
   order by m.role = 'admin' desc, lower(m.name)
$$;

/** The caller's own name, to sign what they record. */
create or replace function public.finance_my_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select name from member where id = auth.uid()
$$;

/**
 * Makes an existing Supabase Auth account an admin — how the first admin is
 * made. Run it in the SQL editor; nobody can call it through the API.
 */
create or replace function public.finance_make_admin(p_email text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'No account with that email — add the user under Authentication → Users first.';
  end if;
  insert into member (id, name, email, role, active)
  values (v_id, btrim(p_name), lower(btrim(p_email)), 'admin', true)
  on conflict (id) do update set role = 'admin', active = true, name = excluded.name;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table member enable row level security;
alter table finance_transaction enable row level security;
alter table finance_share enable row level security;

-- A member reads their own row; an admin reads everyone's. Changes go through
-- the app's server with the service role (adding someone means creating
-- their account), so there is no write policy at all.
drop policy if exists member_select on member;
create policy member_select on member
  for select using (id = auth.uid() or finance_is_admin());

-- Whole transactions — their total, every member's part — are an admin's to
-- read. A member reads their own shares, and the transactions behind them
-- through finance_my_shares(), which leaves the rest out.
drop policy if exists finance_transaction_select on finance_transaction;
create policy finance_transaction_select on finance_transaction
  for select using (finance_is_admin());

drop policy if exists finance_transaction_write on finance_transaction;
create policy finance_transaction_write on finance_transaction
  for all using (finance_is_admin()) with check (finance_is_admin());

drop policy if exists finance_share_select on finance_share;
create policy finance_share_select on finance_share
  for select using (finance_is_admin() or (finance_can_view() and member_id = auth.uid()));

drop policy if exists finance_share_write on finance_share;
create policy finance_share_write on finance_share
  for all using (finance_is_admin()) with check (finance_is_admin());

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------

/**
 * Records a transaction, or replaces one (`p_id`), with its members' shares —
 * in one statement, so a transaction is never left without its split.
 *
 * SECURITY INVOKER: the write policies above decide, so only an admin gets
 * past the first insert. The amount is divided equally in cents; the
 * remainder goes one cent at a time to the first members, in the order given.
 */
create or replace function public.finance_save_transaction(
  p_id          uuid,
  p_occurred_on date,
  p_direction   text,
  p_amount      numeric,
  p_base_fee    boolean,
  p_reason      text,
  p_members     uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id      uuid := p_id;
  v_members uuid[];
  v_count   integer;
  v_cents   bigint;
  v_each    bigint;
  v_extra   bigint;
  i         integer;
begin
  if not finance_is_admin() then
    raise exception using errcode = 'insufficient_privilege', message = 'Only an admin records transactions.';
  end if;
  if p_direction not in ('in', 'out') then
    raise exception using errcode = 'check_violation', message = 'Choose in or out.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception using errcode = 'check_violation', message = 'The amount must be above zero, to the cent.';
  end if;
  if coalesce(p_base_fee, false) and p_direction <> 'out' then
    raise exception using errcode = 'check_violation', message = 'Only money out can be a base fee.';
  end if;

  -- Distinct, in the order given.
  select array_agg(m order by first_at)
    into v_members
    from (
      select m, min(ord) as first_at
        from unnest(p_members) with ordinality as x(m, ord)
       where m is not null
       group by m
    ) d;
  v_count := coalesce(array_length(v_members, 1), 0);
  if v_count = 0 then
    raise exception using errcode = 'check_violation', message = 'Choose at least one member.';
  end if;
  if exists (
    select 1 from unnest(v_members) as g(m)
     where not exists (select 1 from member mm where mm.id = g.m and mm.active)
  ) then
    raise exception using errcode = 'check_violation', message = 'Members must be active members of the team.';
  end if;

  v_cents := round(p_amount * 100)::bigint;
  if v_cents < v_count then
    raise exception using errcode = 'check_violation', message = 'The amount is too small to split between that many members.';
  end if;

  if v_id is null then
    insert into finance_transaction (occurred_on, direction, amount, base_fee, reason, created_by, created_by_name)
    values (coalesce(p_occurred_on, current_date), p_direction, p_amount, coalesce(p_base_fee, false),
            nullif(btrim(p_reason), ''), auth.uid(), finance_my_name())
    returning id into v_id;
  else
    update finance_transaction
       set occurred_on = coalesce(p_occurred_on, occurred_on),
           direction   = p_direction,
           amount      = p_amount,
           base_fee    = coalesce(p_base_fee, false),
           reason      = nullif(btrim(p_reason), ''),
           updated_at  = now()
     where id = v_id;
    if not found then
      raise exception using errcode = 'no_data_found', message = 'That transaction is gone.';
    end if;
    delete from finance_share where transaction_id = v_id;
  end if;

  v_each := v_cents / v_count;
  v_extra := v_cents - v_each * v_count;
  for i in 1 .. v_count loop
    insert into finance_share (transaction_id, member_id, member_name, amount)
    select v_id, mm.id, mm.name, (v_each + case when i <= v_extra then 1 else 0 end)::numeric / 100
      from member mm
     where mm.id = v_members[i];
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading
--
-- The same four figures everywhere:
--
--   total_in   money in, base fees aside
--   total_out  money out, base fees aside
--   base_fee   base fees, as a positive amount
--   net        total_in − total_out: what was earned, base fees left out
--
-- For an admin, across everyone. For a member, across their own shares only
-- — the same functions, so the pages ask one way and the database decides how
-- much they get. SECURITY DEFINER for that choice; each checks
-- finance_can_view() first, so a deactivated member gets nothing.
-- ---------------------------------------------------------------------------

/** The shares the caller may count: everyone's for an admin, their own otherwise. */
create or replace function public.finance_visible_shares()
returns table (
  member_id   uuid,
  member_name text,
  amount      numeric,
  occurred_on date,
  direction   text,
  base_fee    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.member_id, s.member_name, s.amount, t.occurred_on, t.direction, t.base_fee
    from finance_share s
    join finance_transaction t on t.id = s.transaction_id
   where finance_can_view()
     and (finance_is_admin() or s.member_id = auth.uid())
$$;

/**
 * Each month with any record, newest first: its range and its four figures.
 * An admin's are the whole team's, counted by transaction; a member's are
 * their own share of each.
 */
create or replace function public.finance_month_totals()
returns table (
  period       date,
  starts_on    date,
  ends_on      date,
  transactions bigint,
  total_in     numeric,
  total_out    numeric,
  base_fee     numeric,
  net          numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select t.occurred_on, t.direction, t.base_fee, t.amount
      from finance_transaction t
     where finance_is_admin()
    union all
    select v.occurred_on, v.direction, v.base_fee, v.amount
      from finance_visible_shares() v
     where not finance_is_admin()
  )
  select finance_period(r.occurred_on) as period,
         (finance_period(r.occurred_on) - interval '1 month')::date + 19 as starts_on,
         finance_period(r.occurred_on) + 18 as ends_on,
         count(*),
         coalesce(sum(r.amount) filter (where r.direction = 'in' and not r.base_fee), 0),
         coalesce(sum(r.amount) filter (where r.direction = 'out' and not r.base_fee), 0),
         coalesce(sum(r.amount) filter (where r.base_fee), 0),
         coalesce(sum(case when r.direction = 'in' then r.amount else -r.amount end) filter (where not r.base_fee), 0)
    from rows r
   group by 1
   order by 1 desc
$$;

/** Each member's figures across every month — every member for an admin, only themselves for a member. */
create or replace function public.finance_member_totals()
returns table (
  member_id   uuid,
  member_name text,
  total_in    numeric,
  total_out   numeric,
  base_fee    numeric,
  net         numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select v.member_id,
         coalesce(max(m.name), max(v.member_name)),
         coalesce(sum(v.amount) filter (where v.direction = 'in' and not v.base_fee), 0),
         coalesce(sum(v.amount) filter (where v.direction = 'out' and not v.base_fee), 0),
         coalesce(sum(v.amount) filter (where v.base_fee), 0),
         coalesce(sum(case when v.direction = 'in' then v.amount else -v.amount end) filter (where not v.base_fee), 0)
    from finance_visible_shares() v
    left join finance_members() m on m.id = v.member_id
   group by v.member_id, case when v.member_id is null then v.member_name end
   order by lower(coalesce(max(m.name), max(v.member_name)))
$$;

/** Each member's money in and out per month, base fees aside — for the dashboard's chart. */
create or replace function public.finance_member_months()
returns table (
  member_id   uuid,
  member_name text,
  period      date,
  total_in    numeric,
  total_out   numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select v.member_id,
         coalesce(max(m.name), max(v.member_name)),
         finance_period(v.occurred_on),
         coalesce(sum(v.amount) filter (where v.direction = 'in'), 0),
         coalesce(sum(v.amount) filter (where v.direction = 'out'), 0)
    from finance_visible_shares() v
    left join finance_members() m on m.id = v.member_id
   where not v.base_fee
   group by v.member_id, case when v.member_id is null then v.member_name end, finance_period(v.occurred_on)
$$;

/**
 * The caller's own transactions between two dates, as their share: the date,
 * in or out, base fee or not, why, who recorded it, their part, and how many
 * it was split between — never the whole amount or anyone else's part. For a
 * member's own view; an admin reads the tables themselves.
 */
create or replace function public.finance_my_shares(p_from date, p_to date)
returns table (
  transaction_id  uuid,
  occurred_on     date,
  direction       text,
  base_fee        boolean,
  reason          text,
  created_by_name text,
  created_at      timestamptz,
  share_id        uuid,
  member_id       uuid,
  member_name     text,
  amount          numeric,
  split           integer
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.occurred_on, t.direction, t.base_fee, t.reason, t.created_by_name, t.created_at,
         s.id, s.member_id, s.member_name, s.amount,
         (select count(*)::integer from finance_share x where x.transaction_id = t.id)
    from finance_share s
    join finance_transaction t on t.id = s.transaction_id
   where finance_can_view()
     and s.member_id = auth.uid()
     and t.occurred_on >= p_from
     and t.occurred_on < p_to
   order by t.occurred_on desc, t.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Grants
--
-- Tables: what each API role may attempt; the policies above decide what it
-- gets. Granted here by name rather than left to Supabase's defaults, which a
-- project can turn off (Data API → "automatically expose new tables"), and
-- an app with no table privileges fails with "permission denied" before a
-- policy is ever asked. Signed-in people go through RLS; the service role is
-- the Members page's; nobody signed out gets anything.
--
-- Functions: Supabase grants EXECUTE on new functions to anon by name;
-- nobody signed out has any business here, so each is revoked from anon and
-- public explicitly. finance_make_admin() is for the SQL editor only: no API
-- role may call it.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on member, finance_transaction, finance_share to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant select, insert, update, delete on member, finance_transaction, finance_share to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on member, finance_transaction, finance_share from anon;
  end if;
end $$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.finance_is_admin()',
    'public.finance_can_view()',
    'public.finance_members()',
    'public.finance_my_name()',
    'public.finance_save_transaction(uuid, date, text, numeric, boolean, text, uuid[])',
    'public.finance_visible_shares()',
    'public.finance_month_totals()',
    'public.finance_member_totals()',
    'public.finance_member_months()',
    'public.finance_my_shares(date, date)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', fn);
    end if;
  end loop;

  execute 'revoke all on function public.finance_make_admin(text, text) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.finance_make_admin(text, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.finance_make_admin(text, text) from authenticated';
  end if;
end $$;
