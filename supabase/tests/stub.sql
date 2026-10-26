-- ===========================================================================
-- Stand-ins for what Supabase provides.
--
-- The schema owns everything it uses except Supabase Auth: `auth.users`, the
-- accounts people sign in with, and `auth.uid()`, the caller. This is the
-- smallest version of both the policies can be tested against, plus the API
-- roles and the default privileges Supabase sets on `public`.
-- ===========================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text not null
);

-- Supabase reads this from the request JWT. Here it comes from a GUC, so
-- "acting as" someone is `set test.uid = '…'`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;

grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

-- What Supabase does to every function created in `public`: EXECUTE for each
-- API role by name. `revoke ... from public` does not undo a grant made by
-- name, which is why the schema revokes from anon explicitly.
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
