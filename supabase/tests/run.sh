#!/usr/bin/env bash
# Applies supabase/schema.sql to a throwaway Postgres — twice, so a statement
# that isn't idempotent fails loudly here rather than on someone's database —
# then exercises the constraints and the cascade.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA="$(mktemp -d)"
PORT="${PGPORT:-55434}"
export PGHOST="$DATA" PGPORT="$PORT" PGDATABASE=postgres

cleanup() { pg_ctl -D "$DATA/db" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

echo "→ initializing cluster"
initdb -D "$DATA/db" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA/db" -o "-k $DATA -h '' -p $PORT" -l "$DATA/log" start >/dev/null
export PGUSER=postgres

echo "→ installing stubs for Supabase Auth and its roles"
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/stub.sql"

echo "→ applying schema (first pass)"
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/schema.sql"
echo "→ applying schema (second pass — must be idempotent)"
psql -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/schema.sql"

# Granted after the schema exists, the way Supabase grants them to its own
# roles — RLS is never reached without table privileges.
#
# Functions are not granted here: stub.sql sets Supabase's default privileges,
# so each one arrives with EXECUTE for anon and authenticated by name, and the
# schema's own revokes decide the rest. A blanket grant at this point would
# undo them and the anon checks would be testing this script, not the schema.
psql -q -v ON_ERROR_STOP=1 -c "
  grant all on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;"

echo "→ running assertions"
# Captured rather than streamed, because the exit status is not the whole
# story: every assertion is a row printing `t`, and a policy that let
# something through prints `f` while psql exits 0. Reporting success on that
# would make the entire suite decorative — which it briefly was.
output="$(psql -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/schema.sql" 2>&1)"
echo "$output" | grep -v '^SET$\|^RESET$\|^GRANT$\|^INSERT 0\|^UPDATE \|^DO$\|^DELETE \|^CREATE\|Pager usage'

if echo "$output" | grep -qE '\| f$' || echo "$output" | grep -q 'FAIL:'; then
  echo
  echo "✗ at least one assertion failed"
  exit 1
fi

echo
echo "✓ all schema assertions passed"
