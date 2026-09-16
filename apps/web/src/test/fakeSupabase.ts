// An in-memory stand-in for the Supabase client.
//
// Why this exists: this environment's egress policy blocks *.supabase.co, so no
// test here can reach the real project. The isolation proof against the live
// database is supabase/tests/rls-isolation.sql, run through the management API
// and reported in the stage-3 report. These tests cover the OTHER half — that
// the repository issues correctly scoped queries and maps rows faithfully — and
// for that a double is actually better than a live database, because a test can
// assert on the queries themselves.
//
// It is not a PostgREST reimplementation. It supports exactly the query shapes
// data/supabaseRepository.ts uses, and throws on anything else rather than
// silently returning an empty result — a test must never pass because the
// double quietly did nothing.
//
// It DOES emulate the row-level policies from migrations 0001-0004, one function
// per table, mirroring the SQL. That makes a test like "user A's repository
// cannot read user B's recipe" meaningful: remove the `.eq('owner_id', userId)`
// from the repository and `policyFor` still hides the row, which is the property
// the real system has.

export type Row = Record<string, unknown>;
export type FakeDb = Record<string, Row[]>;

export interface PostgrestLikeError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface FakeResult<T> {
  data: T;
  error: PostgrestLikeError | null;
}

/** Everything a test may want to know about what the repository actually did. */
export interface FakeLog {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete';
  select?: string | undefined;
  filters: [string, unknown][];
  rowsIn?: number | undefined;
  rowsOut?: number;
}

export interface FakeSupabaseOptions {
  db: FakeDb;
  /** the signed-in user, as `auth.uid()` would report it; null means anonymous */
  authUid: string | null;
  /** forces every request to fail, for the offline-fallback paths */
  failWith?: PostgrestLikeError | null;
}

let idCounter = 0;
const newId = (prefix: string) => `${prefix}-${++idCounter}`;

/** Resets the id sequence so ids are stable within one test. */
export function resetFakeIds(): void {
  idCounter = 0;
}

// ── the emulated policies ──────────────────────────────────────────────────
// One entry per table with RLS enabled. Each mirrors the USING clause of the
// policy in supabase/migrations.

type Policy = (row: Row, uid: string | null, db: FakeDb) => boolean;

const ownsRecipe: Policy = (row, uid, db) => {
  if (!uid) return false;
  const parent = (db['recipes'] ?? []).find((r) => r['id'] === row['recipe_id']);
  return parent?.['owner_id'] === uid;
};

const POLICIES: Record<string, Policy> = {
  // profiles_own / calibrations_own / private_notes_own: user_id = auth.uid()
  profiles: (row, uid) => Boolean(uid) && row['user_id'] === uid,
  calibrations: (row, uid) => Boolean(uid) && row['user_id'] === uid,
  private_notes: (row, uid) => Boolean(uid) && row['user_id'] === uid,
  // recipes_own: owner_id = auth.uid()
  recipes: (row, uid) => Boolean(uid) && row['owner_id'] === uid,
  // the five child tables: public.owns_recipe(recipe_id)
  ingredients: ownsRecipe,
  steps: ownsRecipe,
  issues: ownsRecipe,
  trials: ownsRecipe,
  batches: ownsRecipe,
  recipe_versions: ownsRecipe,
  // shared reference data: SELECT to authenticated, and no write policy at all
  density_table: (_row, uid) => Boolean(uid),
  density_data_gaps: (_row, uid) => Boolean(uid),
};

const READ_ONLY_TABLES = new Set(['density_table', 'density_data_gaps']);

/**
 * Column defaults the database fills in on INSERT.
 *
 * Without these the double hands back rows that no real Postgres would produce
 * — a `recipes` row with no `created_at`, for instance — and a test then fails
 * for a reason that could never happen in production. Modelling the defaults
 * keeps the double honest in the other direction too: it cannot excuse a mapper
 * that depends on a column the schema does not guarantee.
 */
const INSERT_DEFAULTS: Record<string, () => Row> = {
  recipes: () => ({ created_at: NOW, updated_at: NOW }),
  profiles: () => ({ created_at: NOW, updated_at: NOW }),
  calibrations: () => ({ created_at: NOW }),
  private_notes: () => ({ updated_at: NOW }),
  recipe_versions: () => ({ created_at: NOW }),
  batches: () => ({ created_at: NOW }),
  ingredient_catalog: () => ({ created_at: NOW, updated_at: NOW }),
};

const NOW = '2026-04-01T12:00:00Z';

const RLS_DENIED: PostgrestLikeError = {
  message: 'new row violates row-level security policy',
  code: '42501',
};

/** `ingredients (*)` inside a select string — the nested-embed syntax. */
function embeddedTables(select: string | undefined): string[] {
  if (!select) return [];
  return [...select.matchAll(/(\w+)\s*\(\s*\*\s*\)/g)].map((m) => m[1]!);
}

export interface FakeSupabase {
  client: unknown;
  db: FakeDb;
  log: FakeLog[];
  /** swap the signed-in user, for the two-user isolation tests */
  setAuthUid(uid: string | null): void;
  setFailWith(error: PostgrestLikeError | null): void;
}

export function createFakeSupabase(opts: FakeSupabaseOptions): FakeSupabase {
  const db = opts.db;
  const log: FakeLog[] = [];
  let authUid = opts.authUid;
  let failWith = opts.failWith ?? null;

  const visible = (table: string, rows: Row[]): Row[] => {
    const policy = POLICIES[table];
    if (!policy) return rows; // a table with RLS off would be a bug, not a default
    return rows.filter((r) => policy(r, authUid, db));
  };

  const matches = (row: Row, filters: [string, unknown][]): boolean =>
    filters.every(([col, val]) => row[col] === val);

  class Builder implements PromiseLike<FakeResult<unknown>> {
    private op: FakeLog['op'] = 'select';
    private selectStr: string | undefined;
    private filters: [string, unknown][] = [];
    private payload: Row | Row[] | null = null;
    private cardinality: 'many' | 'one' | 'maybe' = 'many';
    private orderBy: { column: string; ascending: boolean } | null = null;

    constructor(private table: string) {}

    select(cols?: string): this {
      // `.select()` after an insert is a RETURNING clause, not a new query
      if (this.op === 'select') this.op = 'select';
      this.selectStr = cols ?? '*';
      return this;
    }
    insert(payload: Row | Row[]): this {
      this.op = 'insert';
      this.payload = payload;
      return this;
    }
    update(payload: Row): this {
      this.op = 'update';
      this.payload = payload;
      return this;
    }
    delete(): this {
      this.op = 'delete';
      return this;
    }
    eq(column: string, value: unknown): this {
      this.filters.push([column, value]);
      return this;
    }
    order(column: string, o?: { ascending?: boolean }): this {
      this.orderBy = { column, ascending: o?.ascending !== false };
      return this;
    }
    single(): this {
      this.cardinality = 'one';
      return this;
    }
    maybeSingle(): this {
      this.cardinality = 'maybe';
      return this;
    }

    private embed(rows: Row[]): Row[] {
      const children = embeddedTables(this.selectStr);
      if (!children.length) return rows;
      return rows.map((r) => {
        const out: Row = { ...r };
        for (const child of children) {
          out[child] = visible(child, db[child] ?? []).filter(
            (c) => c['recipe_id'] === r['id'],
          );
        }
        return out;
      });
    }

    private run(): FakeResult<unknown> {
      const entry: FakeLog = {
        table: this.table,
        op: this.op,
        select: this.selectStr,
        filters: [...this.filters],
      };

      if (failWith) {
        log.push({ ...entry, rowsOut: 0 });
        return { data: null, error: failWith };
      }

      const all = (db[this.table] ??= []);

      if (this.op === 'insert') {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload!];
        entry.rowsIn = incoming.length;
        if (READ_ONLY_TABLES.has(this.table)) {
          log.push({ ...entry, rowsOut: 0 });
          return { data: null, error: RLS_DENIED };
        }
        const created: Row[] = [];
        const defaults = INSERT_DEFAULTS[this.table]?.() ?? {};
        for (const raw of incoming) {
          const row: Row = { id: newId(this.table), ...defaults, ...raw };
          // WITH CHECK: a row the policy would not admit is refused outright,
          // which is how the real database reports it too.
          const policy = POLICIES[this.table];
          if (policy && !policy(row, authUid, db)) {
            log.push({ ...entry, rowsOut: 0 });
            return { data: null, error: RLS_DENIED };
          }
          all.push(row);
          created.push(row);
        }
        log.push({ ...entry, rowsOut: created.length });
        return this.shape(created);
      }

      const candidates = visible(this.table, all).filter((r) => matches(r, this.filters));

      if (this.op === 'update') {
        if (READ_ONLY_TABLES.has(this.table)) {
          log.push({ ...entry, rowsOut: 0 });
          return { data: null, error: null }; // no policy admits it: zero rows
        }
        for (const row of candidates) Object.assign(row, this.payload);
        log.push({ ...entry, rowsOut: candidates.length });
        return this.shape(candidates);
      }

      if (this.op === 'delete') {
        for (const row of candidates) {
          const i = all.indexOf(row);
          if (i >= 0) all.splice(i, 1);
          // ON DELETE CASCADE, for the one relationship the repository relies on
          if (this.table === 'recipes') {
            for (const child of [
              'ingredients',
              'steps',
              'issues',
              'trials',
              'batches',
              'recipe_versions',
              'private_notes',
            ]) {
              db[child] = (db[child] ?? []).filter((c) => c['recipe_id'] !== row['id']);
            }
          }
        }
        log.push({ ...entry, rowsOut: candidates.length });
        return this.shape(candidates);
      }

      let rows = this.embed(candidates);
      if (this.orderBy) {
        const { column, ascending } = this.orderBy;
        rows = [...rows].sort((a, b) => {
          const x = a[column] as string | number | undefined;
          const y = b[column] as string | number | undefined;
          if (x === y) return 0;
          const less = (x ?? '') < (y ?? '');
          return (less ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      log.push({ ...entry, rowsOut: rows.length });
      return this.shape(rows);
    }

    private shape(rows: Row[]): FakeResult<unknown> {
      if (this.cardinality === 'many') return { data: rows, error: null };
      if (rows.length === 1) return { data: rows[0]!, error: null };
      if (this.cardinality === 'maybe' && rows.length === 0) {
        return { data: null, error: null };
      }
      return {
        data: null,
        error: {
          message:
            rows.length === 0
              ? 'JSON object requested, multiple (or no) rows returned'
              : 'multiple rows returned',
          code: 'PGRST116',
        },
      };
    }

    then<R1 = FakeResult<unknown>, R2 = never>(
      onfulfilled?: ((v: FakeResult<unknown>) => R1 | PromiseLike<R1>) | null,
      onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): PromiseLike<R1 | R2> {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    }
  }

  const client = {
    from(table: string) {
      return new Builder(table);
    },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
    },
  };

  return {
    client,
    db,
    log,
    setAuthUid(uid) {
      authUid = uid;
    },
    setFailWith(error) {
      failWith = error;
    },
  };
}

// ── fixtures ───────────────────────────────────────────────────────────────

export const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** A profile row as migration 0001's trigger creates it for a new account. */
export function newProfileRow(userId: string, over: Row = {}): Row {
  return {
    user_id: userId,
    profile: 'pro',
    pro: true,
    units: ['g', 'kg', 'ml', 'l', 'unit'],
    tools: { cup: 240, tbsp: 15, tsp: 5 },
    touched_units: false,
    locale: 'he',
    onboarding_done: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

export function recipeRow(id: string, ownerId: string, over: Row = {}): Row {
  return {
    id,
    owner_id: ownerId,
    group_id: null,
    name: 'מתכון',
    category: 'אחר',
    tags: [],
    is_sub: false,
    locked: false,
    yield_units: 0,
    unit_weight: 0,
    yield_actual: null,
    weight_before: null,
    weight_after: null,
    dough_mode: false,
    ddt: null,
    flour_temp: null,
    room_temp: null,
    friction: null,
    target_fc: 0,
    shelf_life: '',
    storage: '',
    freezing: '',
    thawing: '',
    equipment: '',
    notes: '',
    manual_allergens: [],
    pan: null,
    version_of: null,
    version_note: '',
    saved_from_item_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

export function ingredientRow(recipeId: string, over: Row = {}): Row {
  return {
    id: newId('ing'),
    recipe_id: recipeId,
    ord: 0,
    name: 'קמח לבן',
    ingredient_key: 'flour.white',
    qty: 500,
    unit: 'גרם',
    flour: true,
    liquid: false,
    water_pct: null,
    unit_weight: null,
    g_per_100: null,
    price: null,
    price_unit: null,
    sub_recipe_id: null,
    note: '',
    ...over,
  };
}
