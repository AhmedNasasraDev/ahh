// Checks apps/web/src/lib/database.types.ts against the applied schema in
// supabase/schema.snapshot.json.
//
// Why this exists: the TS row types are hand-written so they can be NARROWER
// than the database (see the comment in the snapshot). Hand-written types drift.
// This compares the two things that must never drift — the set of columns, and
// which of them are nullable — and leaves the value types alone, since that is
// where the hand-written version is deliberately stricter.
//
// Since stage 6 it also checks the FUNCTIONS, for two reasons that are not
// about types at all:
//
//   1. PostgREST passes RPC arguments BY NAME. A renamed argument is not a type
//      error anywhere — it is "function not found" at runtime, from a client
//      whose types all check out.
//   2. The grants. `CREATE FUNCTION` grants EXECUTE to PUBLIC by default and
//      Supabase adds `anon` on top, which is how six stage-5 functions ended up
//      answering unauthenticated callers (fixed in 0010). A loosened grant
//      should be a failing check, not something noticed months later.
//
//   node supabase/scripts/check-types-against-schema.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = join(ROOT, 'apps/web/src/lib/database.types.ts');
const SNAPSHOT = join(ROOT, 'supabase/schema.snapshot.json');

const src = readFileSync(TYPES, 'utf8');
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));

// table name -> the interface that types its Row, read out of the Database map
// so a renamed interface is caught here rather than by a confusing type error.
const tableToInterface = new Map();
for (const [, table, iface] of src.matchAll(
  /^\s{6}(\w+):\s*Table<(\w+)>;/gm,
)) {
  tableToInterface.set(table, iface);
}
// density_data_gaps is typed inline, with no named interface
const INLINE = { density_data_gaps: { name: 'required' } };

/** Pulls the field name and nullability out of one interface body. */
function fieldsOf(iface) {
  // Row types are type aliases, not interfaces — see the note in
  // database.types.ts for why that distinction is load-bearing.
  const m = src.match(
    new RegExp(`export type ${iface} = \\{([\\s\\S]*?)\\n\\};`),
  );
  if (!m) return null;
  const fields = {};
  // `name: type;` — comments and doc blocks are skipped by the anchor on \n
  // Groups: 1 = name, 2 = the optional `?` marker, 3 = the type.
  for (const [, name, , type] of m[1].matchAll(/\n  (\w+)(\??): ([^;]+);/g)) {
    fields[name] = / \| null$|^null \| /.test(type.trim()) ? 'nullable' : 'required';
  }
  return fields;
}

const problems = [];

for (const [table, expected] of Object.entries(snapshot)) {
  if (table.startsWith('_')) continue;

  const actual = INLINE[table] ?? (() => {
    const iface = tableToInterface.get(table);
    if (!iface) {
      problems.push(`${table}: no entry in the Database.public.Tables map`);
      return null;
    }
    const f = fieldsOf(iface);
    if (!f) problems.push(`${table}: interface ${iface} not found`);
    return f;
  })();
  if (!actual) continue;

  for (const [col, nullability] of Object.entries(expected)) {
    if (!(col in actual)) {
      problems.push(`${table}.${col}: in the database, missing from the types`);
    } else if (actual[col] !== nullability) {
      problems.push(
        `${table}.${col}: database says ${nullability}, types say ${actual[col]}`,
      );
    }
  }
  for (const col of Object.keys(actual)) {
    if (!(col in expected)) {
      problems.push(`${table}.${col}: in the types, missing from the database`);
    }
  }
}

for (const table of tableToInterface.keys()) {
  if (!(table in snapshot)) {
    problems.push(`${table}: typed but not present in the applied schema`);
  }
}

// ── functions ───────────────────────────────────────────────────────────────
const fnSnapshot = snapshot['_functions'] ?? {};

// The argument names each function is DECLARED with in the Functions map.
// `Args: { p_recipe_id: string }` -> ['p_recipe_id'], in source order, because
// order is part of what a positional call in psql depends on.
const declaredFns = new Map();
const fnBlock = src.match(/\n    Functions: \{([\s\S]*?)\n    \};/);
if (!fnBlock) {
  problems.push('Functions: block not found in database.types.ts');
} else {
  // Each entry is `name: { Args: {...}; Returns: ... };`, possibly across lines.
  for (const [, name, args] of fnBlock[1].matchAll(
    /(\w+):\s*\{\s*Args:\s*\{([\s\S]*?)\}\s*;?\s*Returns:/g,
  )) {
    declaredFns.set(name, [...args.matchAll(/(\w+)\s*:/g)].map((m) => m[1]));
  }
}

for (const [name, args] of declaredFns) {
  const actual = fnSnapshot[name];
  if (!actual) {
    problems.push(`${name}(): declared in the types, not present in the applied schema`);
    continue;
  }
  if (args.join(',') !== actual.args.join(',')) {
    problems.push(
      `${name}(): argument names differ — database has (${actual.args.join(', ')}), ` +
        `types declare (${args.join(', ')}). PostgREST calls by name, so this breaks at runtime.`,
    );
  }
  if (actual.authenticated_execute !== true) {
    problems.push(
      `${name}(): declared for the client to call, but \`authenticated\` has no EXECUTE on it`,
    );
  }
}

// The security posture, over EVERY function and not only the declared ones.
for (const [name, fn] of Object.entries(fnSnapshot)) {
  if (fn.anon_execute) {
    problems.push(
      `${name}(): callable by \`anon\`. Every RPC here needs a signed-in caller ` +
        `— see migrations 0006 and 0010.`,
    );
  }
  if (fn.security_definer && (fn.authenticated_execute || fn.anon_execute)) {
    problems.push(
      `${name}(): SECURITY DEFINER and directly callable by a client role. ` +
        `A definer function runs as its owner, so it must only ever be reached ` +
        `through the trigger or function that owns the decision.`,
    );
  }
}

if (problems.length) {
  console.error('database.types.ts does not match the applied schema:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const tables = Object.keys(snapshot).filter((k) => !k.startsWith('_'));
const columns = tables.reduce((n, t) => n + Object.keys(snapshot[t]).length, 0);
console.log(
  `database.types.ts matches the applied schema: ${tables.length} tables, ` +
    `${columns} columns, ${declaredFns.size} declared functions ` +
    `(${Object.keys(fnSnapshot).length} checked for grants).`,
);
