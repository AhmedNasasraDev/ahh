// Checks apps/web/src/lib/database.types.ts against the applied schema in
// supabase/schema.snapshot.json.
//
// Why this exists: the TS row types are hand-written so they can be NARROWER
// than the database (see the comment in the snapshot). Hand-written types drift.
// This compares the two things that must never drift — the set of columns, and
// which of them are nullable — and leaves the value types alone, since that is
// where the hand-written version is deliberately stricter.
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

if (problems.length) {
  console.error('database.types.ts does not match the applied schema:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const tables = Object.keys(snapshot).filter((k) => !k.startsWith('_'));
const columns = tables.reduce((n, t) => n + Object.keys(snapshot[t]).length, 0);
console.log(
  `database.types.ts matches the applied schema: ${tables.length} tables, ${columns} columns.`,
);
