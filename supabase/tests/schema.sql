-- ===========================================================================
-- Assertions against supabase/schema.sql. Each check prints `t`; anything
-- else fails the run (see run.sh). PASS/FAIL notices come from DO blocks that
-- expect an error.
-- ===========================================================================

\set ON_ERROR_STOP on
\pset pager off

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a0', 'boss@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'outsider@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'ana@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@example.com'),
  ('00000000-0000-0000-0000-0000000000b3', 'cy@example.com'),
  ('00000000-0000-0000-0000-0000000000b4', 'dee@example.com');

\echo ''
\echo '=== 1. the first admin, and who is a member ==='
select 'finance_make_admin turns an account into an admin' as check,
       finance_make_admin(' Boss@Example.com ', 'Boss') = '00000000-0000-0000-0000-0000000000a0' as expect_true;
select 'running it again changes nothing' as check,
       finance_make_admin('boss@example.com', 'Boss') is not null
       and (select count(*) from member) = 1
       and (select role from member) = 'admin'
       and (select email from member) = 'boss@example.com' as expect_true;
do $$
begin
  perform finance_make_admin('nobody@example.com', 'Nobody');
  raise exception 'FAIL: an admin was made without an account';
exception
  when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: finance_make_admin needs an existing account';
end $$;
-- Members are added by the app's server, with the service role.
insert into member (id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000b1', 'Ana', 'ana@example.com', 'member', true),
  ('00000000-0000-0000-0000-0000000000b2', 'Ben', 'ben@example.com', 'member', true),
  ('00000000-0000-0000-0000-0000000000b3', 'Cy', 'cy@example.com', 'member', true),
  ('00000000-0000-0000-0000-0000000000b4', 'Dee', 'dee@example.com', 'member', false);
do $$
begin
  insert into member (id, name, email) values ('00000000-0000-0000-0000-0000000000a2', '  ', 'outsider@example.com');
  raise exception 'FAIL: a member without a name';
exception
  when check_violation then raise notice 'PASS: a member needs a name';
end $$;

set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a0';
select 'the admin may view and write' as check, finance_can_view() and finance_is_admin() as expect_true;
select 'the admin sees every active member, admins first' as check,
       (select array_agg(name) from finance_members()) = array['Boss', 'Ana', 'Ben', 'Cy'] as expect_true;
select 'and every member row, active or not' as check,
       (select count(*) from member) = 5 as expect_true;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
select 'a member may view, not write' as check,
       finance_can_view() and not finance_is_admin() as expect_true;
select 'a member reads only their own member row' as check,
       (select array_agg(name) from member) = array['Ana'] as expect_true;
set test.uid = '00000000-0000-0000-0000-0000000000b4';
select 'a deactivated member sees nothing' as check,
       not finance_can_view() and (select count(*) from finance_members()) = 0 as expect_true;
set test.uid = '00000000-0000-0000-0000-0000000000a2';
select 'an account that is not a member sees nothing' as check,
       not finance_can_view() and (select count(*) from finance_members()) = 0
       and (select count(*) from member) = 0 as expect_true;
with changed as (update member set role = 'admin' returning 1)
select 'nobody promotes themselves' as check, count(*) = 0 as expect_true from changed;
do $$
begin
  insert into member (id, name, email, role) values ('00000000-0000-0000-0000-0000000000a2', 'Me', 'outsider@example.com', 'admin');
  raise exception 'FAIL: an account made itself an admin';
exception
  when insufficient_privilege then raise notice 'PASS: nor joins by inserting a row';
end $$;
do $$
begin
  perform finance_make_admin('outsider@example.com', 'Me');
  raise exception 'FAIL: finance_make_admin ran through the API';
exception
  when insufficient_privilege then raise notice 'PASS: finance_make_admin is for the SQL editor only';
end $$;
reset role;

\echo ''
\echo '=== 2. months run from the 20th to the 19th ==='
select 'Oct 19 is October' as check, finance_period('2026-10-19') = '2026-10-01' as expect_true;
select 'Oct 20 is November' as check, finance_period('2026-10-20') = '2026-11-01' as expect_true;
select 'Nov 19 is still November' as check, finance_period('2026-11-19') = '2026-11-01' as expect_true;
select 'Dec 20 is next January' as check, finance_period('2026-12-20') = '2027-01-01' as expect_true;
select 'Jan 31 is February' as check, finance_period('2027-01-31') = '2027-02-01' as expect_true;

\echo ''
\echo '=== 3. splitting: equal shares, to the cent, adding up to the whole ==='
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a0';
select finance_save_transaction(
  null, '2026-10-05', 'out', 100.00, false, 'Proxies',
  array['00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2',
        '00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b1']::uuid[]
) as proxies \gset
select 'a duplicate member counts once' as check,
       (select count(*) from finance_share where transaction_id = :'proxies') = 3 as expect_true;
select 'the odd cent goes to the first member' as check,
       array_agg(amount order by member_name collate "C") = array[33.34, 33.33, 33.33]::numeric[] as expect_true
  from finance_share where transaction_id = :'proxies';
select 'the shares add up to the whole' as check,
       sum(amount) = 100.00 as expect_true from finance_share where transaction_id = :'proxies';
select 'the record says who made it' as check,
       created_by = '00000000-0000-0000-0000-0000000000a0' and created_by_name = 'Boss' as expect_true
  from finance_transaction where id = :'proxies';
select 'the admin can be a member of a transaction' as check,
       finance_save_transaction(null, '2026-10-06', 'in', 10, false, 'For the admin',
         array['00000000-0000-0000-0000-0000000000a0']::uuid[]) is not null as expect_true;

do $$
begin
  perform finance_save_transaction(null, '2026-10-05', 'out', 0.02, false, null,
    array['00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2',
          '00000000-0000-0000-0000-0000000000b3']::uuid[]);
  raise exception 'FAIL: two cents were split three ways';
exception
  when check_violation then raise notice 'PASS: an amount too small to split is refused';
end $$;
do $$
begin
  perform finance_save_transaction(null, '2026-10-05', 'in', 10.005, false, null,
    array['00000000-0000-0000-0000-0000000000b1']::uuid[]);
  raise exception 'FAIL: a fraction of a cent was accepted';
exception
  when check_violation then raise notice 'PASS: amounts are to the cent';
end $$;
do $$
begin
  perform finance_save_transaction(null, '2026-10-05', 'in', 10, true, null,
    array['00000000-0000-0000-0000-0000000000b1']::uuid[]);
  raise exception 'FAIL: money in was a base fee';
exception
  when check_violation then raise notice 'PASS: only money out is a base fee';
end $$;
do $$
begin
  perform finance_save_transaction(null, '2026-10-05', 'in', 10, false, null, array[]::uuid[]);
  raise exception 'FAIL: a transaction with no member was recorded';
exception
  when check_violation then raise notice 'PASS: a transaction needs a member';
end $$;
do $$
begin
  perform finance_save_transaction(null, '2026-10-05', 'in', 10, false, null,
    array['00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2']::uuid[]);
  raise exception 'FAIL: an account that is not a member was put in a transaction';
exception
  when check_violation then raise notice 'PASS: only members are in transactions';
end $$;
do $$
begin
  perform finance_save_transaction(null, '2026-10-05', 'in', 10, false, null,
    array['00000000-0000-0000-0000-0000000000b4']::uuid[]);
  raise exception 'FAIL: a deactivated member was put in a transaction';
exception
  when check_violation then raise notice 'PASS: nor deactivated ones';
end $$;

-- Edited: the members change, and the shares with them.
select finance_save_transaction(
  :'proxies', '2026-10-05', 'out', 100.00, false, 'Proxies, two people',
  array['00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1']::uuid[]
) is not null as edited \gset
select 'editing replaces the split' as check,
       array_agg(member_name order by member_name) = array['Ana', 'Ben'] and sum(amount) = 100.00 as expect_true
  from finance_share where transaction_id = :'proxies';
reset role;

\echo ''
\echo '=== 4. only an admin writes ==='
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b3';
select 'a member with no part in anything reads nothing' as check,
       (select count(*) from finance_transaction) = 0 and (select count(*) from finance_share) = 0 as expect_true;
do $$
begin
  perform finance_save_transaction(null, '2026-10-06', 'in', 50, false, null,
    array['00000000-0000-0000-0000-0000000000b3']::uuid[]);
  raise exception 'FAIL: a member recorded a transaction';
exception
  when insufficient_privilege then raise notice 'PASS: a member cannot record';
end $$;
do $$
begin
  insert into finance_transaction (direction, amount) values ('in', 5);
  raise exception 'FAIL: a member inserted a row directly';
exception
  when insufficient_privilege then raise notice 'PASS: nor insert past the function';
end $$;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
with changed as (update finance_transaction set amount = 1 returning 1)
select 'nor change a record' as check, count(*) = 0 as expect_true from changed;
with changed as (update finance_share set amount = 1000 returning 1)
select 'nor their own share' as check, count(*) = 0 as expect_true from changed;
with gone as (delete from finance_share returning 1)
select 'nor delete a share' as check, count(*) = 0 as expect_true from gone;

set test.uid = '00000000-0000-0000-0000-0000000000a2';
select 'an account that is not a member reads nothing' as check,
       (select count(*) from finance_transaction) = 0 and (select count(*) from finance_share) = 0
       and (select count(*) from finance_month_totals()) = 0
       and (select count(*) from finance_member_totals()) = 0
       and (select count(*) from finance_member_months()) = 0
       and (select count(*) from finance_my_shares('2000-01-01', '2100-01-01')) = 0 as expect_true;
reset role;

set role anon;
do $$
begin
  perform finance_month_totals();
  raise exception 'FAIL: anon ran the totals';
exception
  when insufficient_privilege then raise notice 'PASS: signed out, nothing runs';
end $$;
do $$
begin
  perform 1 from member;
  raise exception 'FAIL: anon read the member table';
exception
  when insufficient_privilege then raise notice 'PASS: signed out, no table is readable';
end $$;
reset role;

\echo ''
\echo '=== 5. totals: by month and by member, base fees and transfers kept out of net ==='
delete from finance_transaction;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a0';
-- Initial data, dated in October (up to the 19th)…
select finance_save_transaction(null, '2026-10-10', 'in', 500, false, 'Initial',
  array['00000000-0000-0000-0000-0000000000b1']::uuid[]) is not null as a \gset
select finance_save_transaction(null, '2026-10-19', 'out', 80, false, 'Initial',
  array['00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2']::uuid[]) is not null as b \gset
-- …and fresh from the 20th, which is November.
select finance_save_transaction(null, '2026-10-20', 'in', 300, false, 'Client paid',
  array['00000000-0000-0000-0000-0000000000b1']::uuid[]) is not null as c \gset
select finance_save_transaction(null, '2026-11-02', 'out', 30, true, 'Base fee',
  array['00000000-0000-0000-0000-0000000000b1']::uuid[]) is not null as d \gset
select finance_save_transaction(null, '2026-11-05', 'out', 20, false, 'Proxies',
  array['00000000-0000-0000-0000-0000000000b2']::uuid[]) is not null as e \gset
-- Internal transfers: the admin hands Ana 200, and sends 50 out.
select finance_save_transaction(null, '2026-11-03', 'in', 200, false, 'From the admin',
  array['00000000-0000-0000-0000-0000000000b1']::uuid[], true) is not null as f \gset
select finance_save_transaction(null, '2026-11-03', 'out', 50, false, 'Moved to savings',
  array['00000000-0000-0000-0000-0000000000a0']::uuid[], true) is not null as g \gset

do $$
begin
  perform finance_save_transaction(null, '2026-11-03', 'out', 10, true, null,
    array['00000000-0000-0000-0000-0000000000b1']::uuid[], true);
  raise exception 'FAIL: a base fee was also a transfer';
exception
  when check_violation then raise notice 'PASS: a transaction is a base fee or a transfer, not both';
end $$;

select 'October holds the initial data: in 500, out 80, net 420' as check,
       total_in = 500 and total_out = 80 and base_fee = 0 and net = 420 and transactions = 2
       and starts_on = '2026-09-20' and ends_on = '2026-10-19' as expect_true
  from finance_month_totals() where period = '2026-10-01';
select 'November starts on the 20th: in 300, out 20, base fee 30 and transfers 200 in, 50 out aside, net 280' as check,
       total_in = 300 and total_out = 20 and base_fee = 30 and transfer_in = 200 and transfer_out = 50 and net = 280
       and transactions = 5
       and starts_on = '2026-10-20' and ends_on = '2026-11-19' as expect_true
  from finance_month_totals() where period = '2026-11-01';
select 'months come newest first' as check,
       array_agg(period) = array['2026-11-01', '2026-10-01']::date[] as expect_true from finance_month_totals();
select 'Ana across every month: in 800, out 40, base fee 30, net 760 — the 200 transfer on its own' as check,
       total_in = 800 and total_out = 40 and base_fee = 30 and transfer_in = 200 and transfer_out = 0 and net = 760 as expect_true
  from finance_member_totals() where member_name = 'Ana';
select 'the admin''s transfer out costs them nothing' as check,
       total_out = 0 and transfer_out = 50 and net = 0 as expect_true
  from finance_member_totals() where member_name = 'Boss';
select 'a member''s own transactions say which are transfers' as check,
       (select bool_and(transfer) from finance_my_shares('2026-10-20', '2026-11-20')) as expect_true;
select 'Ben: out 40 and 20, net −60' as check,
       total_in = 0 and total_out = 60 and net = -60 as expect_true
  from finance_member_totals() where member_name = 'Ben';
select 'the chart: Ana in November is in 300, out 0 — the base fee and the transfer left out' as check,
       total_in = 300 and total_out = 0 as expect_true
  from finance_member_months() where member_name = 'Ana' and period = '2026-11-01';
select 'the chart leaves transfers out: no bar for the admin' as check,
       not exists (select 1 from finance_member_months() where member_name = 'Boss') as expect_true;
reset role;

\echo ''
\echo '=== 6. a member sees their own part, never anyone else''s ==='
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000b2';
select 'Ben reads only his own shares' as check,
       (select count(*) from finance_share) = 2
       and not exists (select 1 from finance_share where member_id <> auth.uid()) as expect_true;
select 'and no whole transaction — not even one he shares' as check,
       (select count(*) from finance_transaction) = 0 as expect_true;
select 'the member list is only himself' as check,
       (select array_agg(name) from finance_members()) = array['Ben'] as expect_true;
select 'his totals are his share: out 40 + 20' as check,
       (select array_agg(member_name) from finance_member_totals()) = array['Ben']
       and (select net from finance_member_totals()) = -60 as expect_true;
select 'his months are his share, not the team''s' as check,
       (select total_out from finance_month_totals() where period = '2026-10-01') = 40
       and (select total_out from finance_month_totals() where period = '2026-11-01') = 20
       and (select total_in from finance_month_totals() where period = '2026-10-01') = 0 as expect_true;
select 'the chart has only his bars' as check,
       (select count(distinct member_id) from finance_member_months()) = 1
       and not exists (select 1 from finance_member_months() where member_id <> auth.uid()) as expect_true;
select 'his transactions show his part and the split, not the whole' as check,
       (select array_agg(amount order by occurred_on) from finance_my_shares('2026-09-20', '2026-12-20')) = array[40, 20]::numeric[]
       and (select split from finance_my_shares('2026-09-20', '2026-11-20') where occurred_on = '2026-10-19') = 2
       and not exists (select 1 from finance_my_shares('2000-01-01', '2100-01-01') where member_id <> auth.uid()) as expect_true;
reset role;

\echo ''
\echo '=== 7. history outlives the member ==='
update member set active = false where id = '00000000-0000-0000-0000-0000000000b1';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000b2';
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a0';
select 'a deactivated member leaves the member list' as check,
       not exists (select 1 from finance_members() where name = 'Ana') as expect_true;
select 'but keeps their totals, under their name' as check,
       net = 760 as expect_true from finance_member_totals() where member_name = 'Ana';
select 'a deleted account''s shares keep their name' as check,
       member_id is null and net = -60 as expect_true from finance_member_totals() where member_name = 'Ben';
select 'and the team''s months are unchanged' as check,
       (select net from finance_month_totals() where period = '2026-11-01') = 280 as expect_true;
set test.uid = '00000000-0000-0000-0000-0000000000b1';
select 'once deactivated, Ana reads nothing — not even her own' as check,
       (select count(*) from finance_share) = 0
       and (select count(*) from finance_member_totals()) = 0
       and (select count(*) from finance_my_shares('2000-01-01', '2100-01-01')) = 0 as expect_true;
reset role;

\echo ''
\echo '=== 8. names: the schema creates exactly its four tables ==='
select 'member, finance_transaction, finance_share and finance_wallet — nothing else' as check,
       array_agg(tablename::text order by tablename) = array['finance_share', 'finance_transaction', 'finance_wallet', 'member'] as expect_true
  from pg_tables where schemaname = 'public';

\echo ''
\echo '=== 9. the wallet: every transaction from its start, admins only ==='
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a0';
select 'no wallet until it is set' as check, (select count(*) from finance_wallet()) = 0 as expect_true;
do $$
begin
  perform finance_set_wallet('2026-11-01', 1000);
  raise exception 'FAIL: the wallet started mid-month';
exception
  when check_violation then raise notice 'PASS: the wallet starts on a 20th';
end $$;
select finance_set_wallet('2026-09-20', 5);
-- November (from Oct 20), with 1000 in it. Setting it again replaces it.
select finance_set_wallet('2026-10-20', 1000);
select 'one wallet, signed by who set it' as check,
       (select count(*) from finance_wallet) = 1
       and (select updated_by_name from finance_wallet) = 'Boss' as expect_true;
-- November: +300, −30 base fee, +200 and −50 transfers, −20 → +400. October's don't count.
select 'it holds 1000 + 500 in − 100 out = 1400 — base fees and transfers count here' as check,
       starts_on = '2026-10-20' and opening_balance = 1000 and total_in = 500 and total_out = 100 and balance = 1400 as expect_true
  from finance_wallet();
select 'up to its start, it holds what it started with' as check,
       balance = 1000 as expect_true from finance_wallet('2026-10-20');
select 'the balance after each, in the order they happened' as check,
       array_agg(b.balance order by t.occurred_on, t.created_at) = array[1300, 1270, 1470, 1420, 1400]::numeric[] as expect_true
  from finance_wallet_balances('2026-10-20', '2026-11-20') b
  join finance_transaction t on t.id = b.transaction_id;
select 'transactions before it starts have no balance' as check,
       not exists (select 1 from finance_wallet_balances('2026-09-20', '2026-10-20')) as expect_true;
set test.uid = '00000000-0000-0000-0000-0000000000b3';
select 'a member sees no wallet' as check,
       (select count(*) from finance_wallet()) = 0
       and (select count(*) from finance_wallet_balances('2000-01-01', '2100-01-01')) = 0
       and (select count(*) from finance_wallet) = 0 as expect_true;
do $$
begin
  perform finance_set_wallet('2026-10-20', 1);
  raise exception 'FAIL: a member set the wallet';
exception
  when insufficient_privilege then raise notice 'PASS: only an admin sets the wallet';
end $$;
reset role;
