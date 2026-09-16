# Supabase — prepared, not connected

**No project is provisioned. No migration has been applied. Nothing here has run.**

This directory exists so that connecting Supabase is a matter of provisioning a
project and applying migrations in order, not of designing the schema then.

Everything is transcribed from `RECIPE_NOTEBOOK_IMPLEMENTATION_SPEC.md` →
`CLAUDE CODE HANDOFF` §1 (Database), §2 (Auth), §3 (RLS), §5 (Storage) and
§6 (Security). Where the spec and the Supabase platform disagree, the deviation
is documented in the migration's own header.

## Migrations

| file | contents | work-order step |
|---|---|---|
| `0001_profiles_and_calibrations.sql` | `profiles`, `calibrations`, the new-user trigger, RLS | 1 |
| `0002_recipes.sql` | `recipes`, `ingredients`, `steps`, `issues`, `trials`, `batches`, RLS | 2 |
| `0003_versions_and_private_notes.sql` | `recipe_versions`, `private_notes`, `ingredient_catalog`, RLS | 3–4 |
| `0004_density_table.sql` | `density_table`, `density_data_gaps`, read-only RLS | 1 |
| `0005_density_seed.sql` | **generated** — 34 density rows + 11 known gaps | 1 |

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

## Regenerating the density seed

The seed is generated from the engine, so the database and the client can never
disagree about a professional value:

```bash
npm run build --workspace @recipe-notebook/engine
node supabase/scripts/generate-density-seed.mjs
npm run seed:check          # fails if the file has drifted
```

## When a project is created

1. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `apps/web/.env.local`.
   **Anon key only.** `src/lib/supabase.ts` refuses a `service_role` key and
   there is a test for it.
2. Apply `0001` → `0005` in order.
3. Replace `createLocalDemoRepository()` with a Supabase repository behind the
   same `Repository` interface. No screen changes.
4. Regenerate the types: `supabase gen types typescript --project-id <id> >
   apps/web/src/lib/database.types.ts`, then delete the hand-written notes.

## Not prepared here, on purpose

- **Storage buckets** (HANDOFF §5) — recipe, category and batch photos. Needs
  the private-bucket policy and signed access, plus the server-set timestamp
  §13a requires.
- **The recipe-parsing proxy** (HANDOFF §6). The Claude API key must never reach
  the browser. This is an edge function with a per-user rate limit.
- **Group endpoints** (HANDOFF §4) — invitations, join by code, approvals and
  `save-copy`.
