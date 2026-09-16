import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DENSITY_CONFLICTS,
  DENSITY_TABLE,
  FALLBACK_DIVERGENCES,
  LEGACY_CUP_ML,
  LEGACY_INVENTED_FALLBACKS,
  SUSPECT_TERMS,
  densityFor,
  lookupDensity,
} from '../src/index.js';
import { PROTOTYPE_DIR, loadLegacy, prefsWithCup } from './helpers.js';

const P240 = prefsWithCup(240);

describe('B2 — one table, and nothing lost on the way in', () => {
  it('every entry carries at least one recorded legacy source', () => {
    for (const e of DENSITY_TABLE) {
      expect(Object.keys(e.sources).length).toBeGreaterThan(0);
    }
  });

  it('every row in the legacy measure.TABLE survived', () => {
    const legacy = loadLegacy().PN_MEASURE;
    const legacyTable: Array<{ keys: string[]; per100: number }> =
      legacy.UNITS ? [] : [];
    // measure.js does not export TABLE, so read the terms straight from source
    const src = readFileSync(join(PROTOTYPE_DIR, 'measure.js'), 'utf8');
    const block = src.slice(src.indexOf('const TABLE = ['), src.indexOf('function tableLookup'));
    const terms = [...block.matchAll(/keys:\s*\[([^\]]+)\]/g)].map((m) =>
      [...m[1]!.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((t) => t[1]!.replace(/\\'/g, "'")),
    );
    expect(terms.length).toBe(25);
    for (const group of terms) {
      for (const term of group) {
        expect(
          lookupDensity(term),
          `legacy term "${term}" no longer resolves`,
        ).not.toBeNull();
      }
      void legacyTable;
    }
  });

  it('every legacy engine.CUP_DRY ingredient still resolves', () => {
    for (const term of [
      'קמח', 'סוכר חום', 'דמררה', 'אבקת סוכר', 'קקאו', 'סוכר', 'חמאה',
      'שקד', 'אגוז', 'פיסטוק', 'פקאן', 'אורז', 'מלח', 'שיבולת שועל',
      'קוואקר', 'שוקולד',
    ]) {
      expect(lookupDensity(term), `"${term}" missing`).not.toBeNull();
    }
  });

  it('every legacy engine.DENS liquid still resolves, including the two it alone had', () => {
    for (const term of [
      'שמן', 'קנולה', 'זית', 'חמניות', 'דבש', 'סילאן', 'גלוקוז', 'אינוורט',
      'מייפל', 'סירופ', 'מולסה', 'חלב', 'ביצה', 'ביצים', 'חלמון',
      'שמנת', 'קרם פרש', 'ליקר', 'רום', 'ברנדי', 'וודקה', 'מיץ', 'פירה', 'פולפה',
    ]) {
      expect(lookupDensity(term), `"${term}" missing`).not.toBeNull();
    }
    // these two existed ONLY in engine.js
    expect(lookupDensity('סירופ')?.key).toBe('syrup.thick');
    expect(lookupDensity('ביצים')?.key).toBe('egg');
  });

  it('keys are unique and every value is a positive g/100ml', () => {
    const keys = DENSITY_TABLE.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of DENSITY_TABLE) {
      expect(e.gPer100).toBeGreaterThan(0);
      expect(e.gPer100).toBeLessThan(250);
      expect(['system', 'estimate']).toContain(e.confidence);
    }
  });

  it('lookup is order based, so specific terms beat general ones', () => {
    expect(lookupDensity('קמח מלא')?.key).toBe('flour.wholemeal');
    expect(lookupDensity('קמח לחם 13% חלבון')?.key).toBe('flour.white');
    expect(lookupDensity('סוכר חום בהיר')?.key).toBe('sugar.brown');
    expect(lookupDensity('אבקת סוכר')?.key).toBe('sugar.powdered');
  });
});

describe('the conflict report (requirement §8)', () => {
  it('reports the disagreements instead of hiding them', () => {
    const byKey = Object.fromEntries(DENSITY_CONFLICTS.map((c) => [c.key, c]));
    expect(Object.keys(byKey).sort()).toEqual(
      ['alcohol', 'cocoa', 'egg', 'flour.wholemeal', 'nuts', 'rice', 'syrup.thick'].sort(),
    );
  });

  it('nuts is the largest conflict and is not silently resolved', () => {
    const nuts = DENSITY_CONFLICTS.find((c) => c.key === 'nuts')!;
    expect(nuts.maxDeltaPct).toBeGreaterThan(50);
    expect(nuts.resolved).toBe(42);
    expect(nuts.authority).toBe('measure.TABLE');
    expect(nuts.disagreements.map((d) => d.source).sort()).toEqual([
      'engine.CUP_DRY',
      'parser.DRY',
    ]);
    expect(nuts.reviewNote).toContain('דורש הכרעה מקצועית');
  });

  it('cocoa, rice and alcohol are all recorded with their deltas', () => {
    const c = (k: string) => DENSITY_CONFLICTS.find((x) => x.key === k)!;
    expect(c('cocoa').maxDeltaPct).toBeCloseTo(9.1, 1);
    expect(c('rice').maxDeltaPct).toBeCloseTo(13.4, 1);
    expect(c('alcohol').maxDeltaPct).toBeCloseTo(4.1, 1);
  });

  it('single-sourced rows that need a second opinion are listed too', () => {
    for (const k of ['syrup.thick', 'egg']) {
      const hit = DENSITY_CONFLICTS.find((x) => x.key === k)!;
      expect(hit.disagreements).toHaveLength(0);
      expect(hit.reviewNote.length).toBeGreaterThan(10);
    }
  });

  it('the conflict report is derived from the table, so it cannot drift', () => {
    for (const c of DENSITY_CONFLICTS) {
      const entry = DENSITY_TABLE.find((e) => e.key === c.key)!;
      expect(c.resolved).toBe(entry.gPer100);
      expect(entry.needsReview).toBe(true);
    }
  });

  it('every reviewed row is reachable from the conflict report', () => {
    const reviewed = DENSITY_TABLE.filter((e) => e.needsReview).map((e) => e.key);
    const reported = DENSITY_CONFLICTS.map((c) => c.key);
    expect(reviewed.sort()).toEqual(reported.sort());
  });

  it('fallback divergences and suspect terms are documented', () => {
    expect(FALLBACK_DIVERGENCES.length).toBeGreaterThanOrEqual(6);
    const corn = FALLBACK_DIVERGENCES.find((f) => f.key === 'starch.corn')!;
    expect(corn.tableValue).toBe(50);
    expect(corn.legacyFallback).toBeCloseTo(62.5, 6);
    expect(corn.deltaPct).toBeCloseTo(25, 1);
    expect(SUSPECT_TERMS.map((s) => s.term)).toContain('אבקת סוכר וניל');
  });
});

describe('the invented fallbacks are quarantined, not deleted', () => {
  it('their values are preserved for the record', () => {
    expect(LEGACY_INVENTED_FALLBACKS.dryGramsPerCup).toBe(150);
    expect(LEGACY_INVENTED_FALLBACKS.liquidGPerMl).toBe(1.0);
    expect(LEGACY_INVENTED_FALLBACKS.waterPctDefault).toBe(100);
    expect(LEGACY_CUP_ML).toBe(240);
  });

  it('but they are NOT in the lookup path', () => {
    expect(lookupDensity('אבקת מאצ׳ה סינית')).toBeNull();
    expect(densityFor({ name: 'אבקת מאצ׳ה סינית' }, P240, 'cup')).toBeNull();
    expect(densityFor({ name: 'נוזל לא מזוהה' }, P240, 'ml')).toBeNull();
  });
});
