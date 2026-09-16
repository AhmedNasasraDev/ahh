// Conflict report, DERIVED from density-table.ts rather than hand-written, so it
// can never drift from the data it describes. Requirement §8: where legacy values
// disagree, report the disagreement instead of guessing which one is right.

import {
  CONFLICT_TOLERANCE_PCT,
  DENSITY_TABLE,
  KNOWN_DATA_GAPS,
  LEGACY_CUP_ML,
  type DensityEntry,
  type LegacySource,
} from './density-table.js';

export interface DensityConflict {
  key: string;
  ingredient: string;
  /** the value this engine currently uses */
  resolved: number;
  /** which legacy table the resolved value came from */
  authority: LegacySource;
  /** the legacy values that disagree, and by how much */
  disagreements: Array<{
    source: LegacySource;
    gPer100: number;
    deltaPct: number;
  }>;
  maxDeltaPct: number;
  reviewNote: string;
}

function authorityOf(entry: DensityEntry): LegacySource {
  if (entry.sources['measure.TABLE'] != null) return 'measure.TABLE';
  const keys = Object.keys(entry.sources) as LegacySource[];
  return keys[0] ?? 'measure.TABLE';
}

function buildConflicts(): DensityConflict[] {
  const out: DensityConflict[] = [];
  for (const entry of DENSITY_TABLE) {
    const authority = authorityOf(entry);
    const base = entry.sources[authority];
    if (base == null) continue;
    const disagreements: DensityConflict['disagreements'] = [];
    for (const [src, val] of Object.entries(entry.sources) as Array<
      [LegacySource, number]
    >) {
      if (src === authority) continue;
      const deltaPct = ((val - base) / base) * 100;
      if (Math.abs(deltaPct) > CONFLICT_TOLERANCE_PCT) {
        disagreements.push({
          source: src,
          gPer100: val,
          deltaPct: Math.round(deltaPct * 10) / 10,
        });
      }
    }
    const singleSourced = Object.keys(entry.sources).length === 1;
    if (disagreements.length === 0 && !(singleSourced && entry.needsReview)) {
      continue;
    }
    out.push({
      key: entry.key,
      ingredient: entry.match[0] ?? entry.key,
      resolved: entry.gPer100,
      authority,
      disagreements,
      maxDeltaPct: disagreements.reduce(
        (m, d) => Math.max(m, Math.abs(d.deltaPct)),
        0,
      ),
      reviewNote: entry.reviewNote ?? '',
    });
  }
  return out.sort((a, b) => b.maxDeltaPct - a.maxDeltaPct);
}

export const DENSITY_CONFLICTS: readonly DensityConflict[] = buildConflicts();

/**
 * Cases where a legacy table had NO row and silently used its invented fallback,
 * while the authority table does have a real value. Not a disagreement between
 * two claims — a disagreement between a claim and a guess.
 */
export interface FallbackDivergence {
  key: string;
  ingredient: string;
  tableValue: number;
  legacyFallback: number;
  deltaPct: number;
  legacySource: LegacySource;
}

const FALLBACK_DRY_G_PER_100 = (150 / LEGACY_CUP_ML) * 100; // 62.5

export const FALLBACK_DIVERGENCES: readonly FallbackDivergence[] = (
  [
    ['starch.corn', 'קורנפלור', 50],
    ['yogurt', 'יוגורט', 104],
    ['leaven.chemical', 'אבקת אפייה', 92],
    ['yeast.dry', 'שמרים יבשים', 62],
    ['coffee.liquid', 'אספרסו', 100],
    ['coffee.ground', 'קפה טחון', 42],
  ] as Array<[string, string, number]>
).map(([key, ingredient, tableValue]) => ({
  key,
  ingredient,
  tableValue,
  legacyFallback: FALLBACK_DRY_G_PER_100,
  deltaPct:
    Math.round(
      ((FALLBACK_DRY_G_PER_100 - tableValue) / tableValue) * 1000,
    ) / 10,
  legacySource: 'engine.CUP_DRY' as LegacySource,
}));

/** Legacy match terms that look mis-filed. Kept verbatim; flagged, not changed. */
export const SUSPECT_TERMS: readonly {
  term: string;
  filedUnder: string;
  looksLike: string;
  effect: string;
}[] = [
  {
    term: 'אבקת סוכר וניל',
    filedUnder: 'sugar.granulated (83 g/100ml)',
    looksLike: 'sugar.powdered (46 g/100ml)',
    effect:
      'חיפוש לפי סדר מחזיר את שורת אבקת הסוכר (46) ולכן התוצאה בפועל נכונה. המונח נשמר כפי שהיה.',
  },
  {
    term: 'חלבון',
    filedUnder: 'egg (103 g/100ml)',
    looksLike: 'גם חלק מהשם "קמח לחם 13% חלבון"',
    effect:
      'שורת הקמח מופיעה לפניה בסדר החיפוש, ובנוסף הוספה החרגה מפורשת של "קמח" בשורת הביצה.',
  },
];

/**
 * The legacy "we do not know, so here is a number anyway" fallbacks.
 * Deliberately NOT part of the lookup path. Exported so nothing is lost and so a
 * migration can compare old and new behaviour.
 *
 * Spec §5.1 rule 5 and §18.1: no reliable data → no number. These fallbacks are
 * the direct opposite of that rule, which is why they are quarantined here.
 */
export const LEGACY_INVENTED_FALLBACKS = {
  /** engine.js:40 and parser.js:26 — any unrecognised dry ingredient */
  dryGramsPerCup: 150,
  dryGPer100AtLegacyCup: FALLBACK_DRY_G_PER_100,
  /** engine.js:16 — any unrecognised liquid */
  liquidGPerMl: 1.0,
  liquidGPer100: 100,
  /** engine.js:25 — any unrecognised liquid's water content */
  waterPctDefault: 100,
} as const;

/**
 * Ingredients the merged table deliberately refuses to answer for, and what the
 * prototype used to say instead. Filling these in is a data task for a
 * professional, not a code change.
 */
export const KNOWN_GAPS: readonly {
  name: string;
  legacyAnswerGramsPerCup: number | null;
  legacyVia: string;
}[] = KNOWN_DATA_GAPS.map((name) => {
  if (name.startsWith('קמח')) {
    return {
      name,
      legacyAnswerGramsPerCup: 120,
      legacyVia: "engine.CUP_DRY matched the substring 'קמח'",
    };
  }
  return {
    name,
    legacyAnswerGramsPerCup: LEGACY_INVENTED_FALLBACKS.dryGramsPerCup,
    legacyVia: 'engine.CUP_DRY fell through to its 150 g/cup default',
  };
});

/**
 * Ingredients where the prototype's SPLIT tables made it use its invented
 * fallback even though one of the other tables held a real value. Found by the
 * merge itself — see README.md → "what the merge uncovered".
 */
export const SPLIT_TABLE_ERRORS: readonly {
  name: string;
  legacyGramsPerCup: number;
  mergedGramsPerCup: number;
  factor: number;
  cause: string;
}[] = [
  {
    name: 'דבש / סילאן / גלוקוז / מייפל / אינוורט',
    legacyGramsPerCup: 150,
    mergedGramsPerCup: 142 * 2.4,
    factor: (142 * 2.4) / 150,
    cause:
      "engine.DENS knew honey was 1.42 g/ml, but engine.cupGrams only consulted it when the name matched its liquid regex /מים|חלב|שמנת|שמן|מיץ|יין|ביצ/ — honey does not. Any cup or spoon of honey was costed and weighed at 150 g/cup instead of 340.8.",
  },
  {
    name: 'סירופ / מולסה',
    legacyGramsPerCup: 150,
    mergedGramsPerCup: 133 * 2.4,
    factor: (133 * 2.4) / 150,
    cause: 'Same cause: present in engine.DENS (1.33) but outside the liquid regex.',
  },
  {
    name: 'יוגורט / לבנה / שמנת חמוצה',
    legacyGramsPerCup: 150,
    mergedGramsPerCup: 104 * 2.4,
    factor: (104 * 2.4) / 150,
    cause:
      'Present in measure.TABLE (104) but absent from both engine tables and from the liquid regex.',
  },
];
