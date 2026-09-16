# Supabase — connected

**Project:** `qxdpsomelzpvphkhkqrw` — "Recipe Notebook", region `eu-central-1`,
organization `irainiamjxzwcvqxxwfn`, free plan.
**API URL:** `https://qxdpsomelzpvphkhkqrw.supabase.co`

Migrations `0001`–`0006` are applied. Row Level Security is on for every table
that holds user data, and the isolation is verified rather than assumed — see
[Verifying isolation](#verifying-isolation).

The keys live in `apps/web/.env.local`, which is not committed. **Publishable
key only.** `src/lib/supabase.ts` refuses both a legacy `service_role` JWT and a
modern `sb_secret_…` key, and there are tests for both.

Everything is transcribed from `RECIPE_NOTEBOOK_IMPLEMENTATION_SPEC.md` →
`CLAUDE CODE HANDOFF` §1 (Database), §2 (Auth), §3 (RLS), §5 (Storage) and
§6 (Security). Where the spec and the Supabase platform disagree, the deviation
is documented in the migration's own header and listed below.

## Migrations

| file | contents | work-order step |
|---|---|---|
| `0001_profiles_and_calibrations.sql` | `profiles`, `calibrations`, the new-user trigger, RLS | 1 |
| `0002_recipes.sql` | `recipes`, `ingredients`, `steps`, `issues`, `trials`, `batches`, RLS | 2 |
| `0003_versions_and_private_notes.sql` | `recipe_versions`, `private_notes`, `ingredient_catalog`, RLS | 3–4 |
| `0004_density_table.sql` | `density_table`, `density_data_gaps`, read-only RLS | 1 |
| `0005_density_seed.sql` | **generated** — 34 density rows + 11 known gaps | 1 |
| `0006_revoke_execute_on_trigger_functions.sql` | closes the advisor finding on `handle_new_user` | — |

13 tables, 136 columns. `supabase/schema.snapshot.json` is the schema read back
out of the live database after `0006`.

Deliberately absent: `groups`, `group_members`, `group_invites`, `courses`,
`lessons`, `group_recipe_items`. Groups are a later stage, and the endpoint that
matters most there — `save-copy` — has to be server-side (HANDOFF §4).

## Documented deviations from the spec's schema

1. **`users` → `auth.users`.** The spec lists `users(id, email, created_at, locale)`.
   Supabase already owns that table and an application must not shadow it, so
   `auth.users` plays that role and `locale` moves to `profiles`.
2. **Deferred foreign keys.** `recipes.group_id`, `recipes.saved_from_item_id`
   and `private_notes.group_item_id` exist as nullable `uuid` columns without
   their constraints, because their target tables are not created yet. The groups
   migration adds the constraints; the columns are here now so nothing has to be
   back-filled later.
3. **Batch temperatures.** The spec's §1.1 sketch says `tempIn`/`tempOut`; §13a
   reasons about core and chill temperature explicitly, and `haccpOf()` depends
   on knowing which is which. The explicit names win: `core_temp`, `chill_temp`.
4. **`density_table` grew three columns.** The spec sketched
   `(ingredient_key, g_per_100, confidence)`. The stage-1 merge added
   `resolution`, `sources` and `needs_review`, and `g_per_100` is nullable — 12
   of the 34 rows deliberately carry no value. See `packages/engine/CONFLICTS.md`.
5. **No `status` column on `batches`.** §13a requires the HACCP status to be
   derived and never stored, so there is nowhere to write a false one.

## Deviations introduced while applying

Platform-level, not schema-level. Each is in its migration's header too.

1. **`(select auth.uid())` in every policy predicate**, rather than bare
   `auth.uid()`. Identical meaning. Postgres hoists the subquery into an InitPlan
   and evaluates it once per query instead of once per row, which is the
   difference between a fast and a slow notebook once an account has hundreds of
   recipes.
2. **`set search_path = ''` on every function**, with table names fully
   qualified. A `SECURITY DEFINER` function that inherits the caller's
   `search_path` can be pointed at a different table by the caller.
3. **`0006` revokes EXECUTE** on `handle_new_user` and `touch_updated_at`. Both
   are trigger functions, so nothing calls them by name, but `CREATE FUNCTION`
   had granted EXECUTE to `PUBLIC` and the advisor flagged `handle_new_user` as
   an anon-reachable `SECURITY DEFINER` function. `owns_recipe` keeps EXECUTE for
   `authenticated`, because the child-table policies call it.

After `0006`, `get_advisors(security)` returns an empty list.

## Verifying isolation

`supabase/tests/rls-isolation.sql` creates two throwaway accounts, gives each one
a recipe, a private note and a calibration, then queries **without** the
application's own `owner_id` filter — as an attacker would — and also tries a
cross-account UPDATE, DELETE and INSERT. It reproduces PostgREST's security
context exactly: `set local role authenticated` plus the JWT payload in
`request.jwt.claims`, which is what `auth.uid()` reads.

It covers `recipes`, `ingredients`, `private_notes`, `calibrations` and
`profiles`, in both directions, plus an anonymous caller, plus that no client can
rewrite a professional density value. It removes its fixtures at the end and the
last assertion is that nothing was left behind.

Last run: **27/27 pass**, 0 fixture rows remaining.

The role switch is the load-bearing line. `postgres` owns these tables and
therefore bypasses RLS; a version of that script without
`set local role authenticated` would report perfect isolation while testing
nothing at all.

## Regenerating the density seed

The seed is generated from the engine, so the database and the client can never
disagree about a professional value:

```bash
npm run build --workspace @recipe-notebook/engine
node supabase/scripts/generate-density-seed.mjs
npm run seed:check          # fails if the file has drifted
```

After applying it, the 34 rows in the database were digested and compared against
a digest of `DENSITY_TABLE` in the engine. They matched, which is what rules out
a transcription error in reference data that clinical decisions — pricing, in
this case — depend on.

## Keeping the types honest

`apps/web/src/lib/database.types.ts` is hand-written and stays that way.
`supabase gen types` widens every CHECK constraint to `string` and every `jsonb`
column to `Json`, which discards exactly the unions this app runs on: `ToolId`,
`PriceUnit`, `temp_unit 'C' | 'F'`, and the four density resolution states.

The safety net is mechanical rather than diligence:

```bash
npm run schema:check
```

compares the column names and nullability in the types against
`schema.snapshot.json`. Refresh the snapshot after a migration.

One trap worth knowing about, because it fails silently: those row types must be
`type` aliases, not `interface`s. postgrest-js constrains a table's
`Row`/`Insert`/`Update` to `Record<string, unknown>`, TypeScript gives an object
type literal an implicit index signature and gives an interface none. Declared as
interfaces, `Database['public']` quietly fails postgrest's `GenericSchema` check,
the client's `Schema` parameter resolves to `never`, and every insert in the
repository is rejected as `never` with no hint why.

## Not prepared here, on purpose

- **Storage buckets** (HANDOFF §5) — recipe, category and batch photos. Needs
  the private-bucket policy and signed access, plus the server-set timestamp
  §13a requires.
- **The recipe-parsing proxy** (HANDOFF §6). The Claude API key must never reach
  the browser. This is an edge function with a per-user rate limit.
- **Group endpoints** (HANDOFF §4) — invitations, join by code, approvals and
  `save-copy`.
- **Email templates and the redirect URL** for confirmation. The app reads
  whichever setting the project has (`signUp` returning a user with no session
  means "confirm first") and says the right thing either way, but the templates
  themselves are untouched Supabase defaults.
