import { globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(HERE, 'tokens.css'), 'utf8');

const SRC = join(HERE, '..');
const moduleSheets = (): string[] =>
  globSync('**/*.module.css', { cwd: SRC }).map((f) => join(SRC, f));

/**
 * §16 is a contract. HANDOFF §8 forbids changing the design language without a
 * professional reason, so the token file is asserted against the spec's table.
 */
const SPEC_16_COLOURS: readonly [string, string][] = [
  ['רקע אפליקציה', '#fbfbf9'],
  ['נייר', '#fdfbf6'],
  ['רקע חוץ', '#e9ece8'],
  ['קו', '#cdd4ce'],
  ['ירוק ראשי', '#1e6b4c'],
  ['ירוק רקע', '#e2efe8'],
  ['חום־חול', '#c4a99b'],
  ['ענבר', '#a56a0e'],
  ['ענבר רקע', '#f6ebd6'],
  ['אדום', '#9e362c'],
  ['אדום רקע', '#f6e3e0'],
  ['דיו', '#171a18'],
  ['אפור טקסט', '#6e7a73'],
  ['אפור רקע ניטרלי', '#edefec'],
];

describe('design tokens match spec §16', () => {
  for (const [name, hex] of SPEC_16_COLOURS) {
    it(`${name} = ${hex}`, () => {
      expect(tokens.toLowerCase()).toContain(hex);
    });
  }

  it('declares both spec fonts', () => {
    expect(tokens).toContain('Heebo');
    expect(tokens).toContain('Frank Ruhl Libre');
  });

  it('keeps the 44px minimum hit target (§15)', () => {
    expect(tokens).toMatch(/--hit-min:\s*44px/);
  });

  it('maps every engine Source to a colour, so a badge cannot pick its own', () => {
    for (const s of ['exact', 'personal', 'recipe', 'system', 'estimate', 'unavailable']) {
      expect(tokens).toContain(`--c-source-${s}:`);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('every token a stylesheet uses is actually declared', () => {
  // ADDED IN STAGE 7, after writing a stylesheet against seven tokens that do
  // not exist (`--c-card`, `--c-ink-2`, `--c-clay`, `--r-btn`, `--fs-h1`…).
  // An undefined custom property does not error and does not fall back — the
  // declaration is simply dropped, so the element renders with no background,
  // no radius, no colour, and nothing anywhere says so. Same class of silent
  // failure as a container query naming a container that does not exist.
  const declared = new Set(
    [...tokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!),
  );

  // `absolute: true` is not honoured by Node's fs.globSync here, so the paths
  // come back relative to `cwd` and are joined explicitly.
  const sheets = moduleSheets();

  it('finds the stylesheets to check', () => {
    // A guard on the guard: a broken glob would make every case below pass.
    expect(sheets.length).toBeGreaterThan(3);
  });

  for (const sheet of sheets) {
    const name = sheet.slice(sheet.lastIndexOf('/') + 1);
    it(`${name} uses only declared tokens`, () => {
      const css = readFileSync(sheet, 'utf8');
      const used = new Set(
        [...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]!),
      );
      // A token defined locally in the same sheet is fine too.
      const local = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
      const missing = [...used].filter((t) => !declared.has(t) && !local.has(t));
      expect(missing).toEqual([]);
    });
  }
});

describe('every container query names a container that exists', () => {
  // Also stage 7, for the same reason and from the same stage-6 mistake: an
  // `@container frame (...)` where the shell declares `container-name: app`
  // never matches, so the responsive layout is dead with no error anywhere.
  const names = new Set(
    moduleSheets().flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/container-name:\s*([a-z0-9-]+)/g)].map(
        (m) => m[1]!,
      ),
    ),
  );

  it('at least one container is declared somewhere', () => {
    expect(names.size).toBeGreaterThan(0);
  });

  for (const sheet of moduleSheets()) {
    const short = sheet.slice(sheet.lastIndexOf('/') + 1);
    it(`${short} queries only declared containers`, () => {
      const css = readFileSync(sheet, 'utf8');
      const queried = [...css.matchAll(/@container\s+([a-z0-9-]+)\s*\(/g)].map((m) => m[1]!);
      expect(queried.filter((q) => !names.has(q))).toEqual([]);
    });
  }
});
