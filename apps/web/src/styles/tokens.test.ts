import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(HERE, 'tokens.css'), 'utf8');

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
