// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for ingredient density.
//
// This table replaces all four legacy tables:
//   engine.js:31  CUP_DRY   (grams per cup)
//   engine.js:3   DENS      (grams per millilitre, liquids)
//   measure.js:55 TABLE     (grams per 100 ml)
//   parser.js:3   DRY       (grams per cup)
//
// Canonical unit is grams per 100 ml, because it is the only one of the four
// that does not depend on how big a cup happens to be.
//
// MERGE POLICY — no value was chosen arbitrarily:
//  1. measure.TABLE is the designated authority. It is the table the spec itself
//     names in §5.1, it is the only one expressed in a physical unit, and the
//     only one that records a confidence level per row.
//  2. Every legacy value is preserved in `sources`, converted to g/100 ml at the
//     240 ml cup that engine.js and parser.js hard-coded. Nothing is discarded.
//  3. Where the legacy tables disagree with the authority by more than
//     CONFLICT_TOLERANCE_PCT, the row is marked `needsReview` and a record is
//     emitted in density-conflicts.ts. The authority value is used MEANWHILE —
//     that is a holding position, not a professional ruling.
//  4. The legacy "unknown ingredient" fallbacks (150 g/cup dry, 1.0 g/ml liquid)
//     are NOT carried over. See legacy-fallbacks.ts for why and for the values.
//
// Lookup is ORDER-BASED: the first row whose `match` hits wins. The order is
// copied verbatim from measure.TABLE because it encodes specificity
// (e.g. 'קמח מלא' before 'קמח', 'אבקת סוכר' before 'סוכר').
// ─────────────────────────────────────────────────────────────────────────────

import type { Source } from '../types.js';

/** Legacy tables are quoted at the 240 ml cup they hard-coded. */
export const LEGACY_CUP_ML = 240;

/** Above this relative difference two legacy values are treated as a conflict. */
export const CONFLICT_TOLERANCE_PCT = 3;

export interface DensityEntry {
  /** stable machine key — safe to store in a database */
  key: string;
  /** Hebrew substrings, ordered most specific first */
  match: string[];
  /**
   * Names that must NOT resolve through this row even though they contain one
   * of its `match` terms. Guards the same failure class as B4: "קמח" must not
   * silently answer for "קמח שקדים". Excluded names fall through to `null`,
   * which the UI renders as "no reliable data — calibrate one cup".
   */
  exclude?: string[];
  gPer100: number;
  confidence: Extract<Source, 'system' | 'estimate'>;
  note?: string;
  /** every legacy value found for this ingredient, in g/100 ml */
  sources: Partial<Record<LegacySource, number>>;
  /** true when the legacy sources disagree materially — see CONFLICTS.md */
  needsReview?: boolean;
  /** free-text caveat carried into the UI's "why" line when reviewed */
  reviewNote?: string;
}

export type LegacySource =
  | 'measure.TABLE'
  | 'engine.CUP_DRY'
  | 'engine.DENS'
  | 'parser.DRY';

const cup = (gPerCup: number) => round2((gPerCup / LEGACY_CUP_ML) * 100);
const dens = (gPerMl: number) => round2(gPerMl * 100);
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Ingredients we KNOW are distinct from anything in this table, and for which we
 * have no verified value. They are refused before row matching, so a general
 * term can never answer for them — the same failure class as B4, at the table
 * layer: "קמח" must not answer for "קמח שקדים", and neither must "שקד".
 *
 * Refusing is the specified behaviour (§5.1 rule 5): the UI shows
 * "no reliable data — weigh one cup and add a personal calibration".
 *
 * Adding real values here is a DATA task that needs professional input, not a
 * code task. Listed in the conflicts report under "known gaps".
 */
export const KNOWN_DATA_GAPS: readonly string[] = [
  'קמח שקדים',
  'קמח קוקוס',
  'קמח חומוס',
  'קמח תירס',
  'קמח אורז',
  'קמח כוסמת',
  'קמח טפיוקה',
  'קמח קינואה',
  'קמח חרובים',
  'קמח סויה',
  'אבקת חלב',
  'אבקת חלבון',
];

/** Kept as a second line of defence on the flour rows themselves. */
const NON_WHEAT_FLOURS = [
  'שקדים',
  'שקד',
  'קוקוס',
  'חומוס',
  'תירס',
  'אורז',
  'כוסמת',
  'טפיוקה',
  'קינואה',
  'חרובים',
  'סויה',
];

export const DENSITY_TABLE: readonly DensityEntry[] = [
  {
    key: 'flour.wholemeal',
    match: ['קמח מלא', 'כוסמין'],
    exclude: NON_WHEAT_FLOURS,
    gPer100: 54,
    confidence: 'system',
    note: 'כוס מכופלת בכף, בלי לדחוס',
    sources: { 'measure.TABLE': 54, 'engine.CUP_DRY': cup(120) },
    needsReview: true,
    reviewNote: 'engine.CUP_DRY לא הבדיל בין קמח מלא לקמח לבן ונתן 120 גר\' לכוס לשניהם.',
  },
  {
    key: 'flour.white',
    match: ['קמח תופח', 'קמח לבן', 'קמח'],
    exclude: NON_WHEAT_FLOURS,
    gPer100: 50,
    confidence: 'system',
    note: 'כוס מכופלת בכף, בלי לדחוס',
    sources: {
      'measure.TABLE': 50,
      'engine.CUP_DRY': cup(120),
      'parser.DRY': cup(120),
    },
  },
  {
    key: 'starch.corn',
    match: ['קורנפלור', 'קורן פלור', 'עמילן'],
    gPer100: 50,
    confidence: 'system',
    sources: { 'measure.TABLE': 50 },
  },
  {
    key: 'sugar.powdered',
    match: ['אבקת סוכר'],
    gPer100: 46,
    confidence: 'system',
    sources: {
      'measure.TABLE': 46,
      'engine.CUP_DRY': cup(110),
      'parser.DRY': cup(110),
    },
  },
  {
    key: 'cocoa',
    match: ['קקאו'],
    gPer100: 42,
    confidence: 'system',
    sources: {
      'measure.TABLE': 42,
      'engine.CUP_DRY': cup(110),
      'parser.DRY': cup(110),
    },
    needsReview: true,
    reviewNote:
      'engine.CUP_DRY ו-parser.DRY קיבצו קקאו יחד עם אבקת סוכר (110 גר\' לכוס = 45.8). measure.TABLE מפריד ונותן 42. הפער 9%.',
  },
  {
    key: 'sugar.brown',
    match: ['סוכר חום', 'דמררה', 'מוסקובדו'],
    gPer100: 79,
    confidence: 'system',
    note: 'נמדד דחוס קלות',
    sources: {
      'measure.TABLE': 79,
      'engine.CUP_DRY': cup(190),
      'parser.DRY': cup(190),
    },
  },
  {
    key: 'sugar.granulated',
    // 'אבקת סוכר וניל' is listed here in measure.TABLE. Order-based lookup means
    // the powdered-sugar row above wins for that name, which is the sane result.
    // Kept verbatim so no legacy term is lost. See CONFLICTS.md → suspect terms.
    match: ['אבקת סוכר וניל', 'סוכר'],
    gPer100: 83,
    confidence: 'system',
    sources: {
      'measure.TABLE': 83,
      'engine.CUP_DRY': cup(200),
      'parser.DRY': cup(200),
    },
  },
  {
    key: 'butter',
    match: ['חמאה', 'מרגרינה'],
    gPer100: 95,
    confidence: 'system',
    note: 'רכה, נדחסת לכלי',
    sources: {
      'measure.TABLE': 95,
      'engine.CUP_DRY': cup(227),
      'parser.DRY': cup(227),
    },
  },
  {
    key: 'water',
    match: ['מים'],
    gPer100: 100,
    confidence: 'system',
    sources: { 'measure.TABLE': 100, 'engine.DENS': dens(1.0) },
  },
  {
    key: 'milk',
    match: ['חלב'],
    exclude: ['אבקת חלב'],
    gPer100: 103,
    confidence: 'system',
    sources: { 'measure.TABLE': 103, 'engine.DENS': dens(1.03) },
  },
  {
    key: 'cream',
    match: ['שמנת', 'קרם פרש', 'מסקרפונה'],
    gPer100: 99,
    confidence: 'system',
    sources: { 'measure.TABLE': 99, 'engine.DENS': dens(0.99) },
  },
  {
    key: 'yogurt',
    match: ['יוגורט', 'לבנה', 'שמנת חמוצה'],
    gPer100: 104,
    confidence: 'system',
    sources: { 'measure.TABLE': 104 },
  },
  {
    key: 'oil',
    match: ['שמן', 'קנולה', 'זית', 'חמניות'],
    gPer100: 92,
    confidence: 'system',
    sources: { 'measure.TABLE': 92, 'engine.DENS': dens(0.92) },
  },
  {
    key: 'syrup.invert',
    match: ['דבש', 'סילאן', 'גלוקוז', 'מייפל', 'אינוורט'],
    gPer100: 142,
    confidence: 'system',
    sources: { 'measure.TABLE': 142, 'engine.DENS': dens(1.42) },
  },
  {
    key: 'salt',
    match: ['מלח'],
    gPer100: 121,
    confidence: 'system',
    note: 'מלח שולחן דק',
    sources: {
      'measure.TABLE': 121,
      'engine.CUP_DRY': cup(290),
      'parser.DRY': cup(290),
    },
  },
  {
    key: 'leaven.chemical',
    match: ['אבקת אפייה', 'סודה לשתייה'],
    gPer100: 92,
    confidence: 'system',
    sources: { 'measure.TABLE': 92 },
  },
  {
    key: 'yeast.dry',
    match: ['שמרים יבשים', 'שמרים אינסטנט'],
    gPer100: 62,
    confidence: 'system',
    sources: { 'measure.TABLE': 62 },
  },
  {
    key: 'chocolate',
    match: ['שוקולד', "צ'יפס שוקולד"],
    gPer100: 71,
    confidence: 'estimate',
    note: 'תלוי בגודל הפיסות',
    sources: { 'measure.TABLE': 71, 'engine.CUP_DRY': cup(170) },
  },
  {
    key: 'nuts',
    match: ['שקד', 'אגוז', 'פקאן', 'פיסטוק', 'קשיו'],
    gPer100: 42,
    confidence: 'estimate',
    note: 'תלוי בטחינה ובגודל',
    sources: {
      'measure.TABLE': 42,
      'engine.CUP_DRY': cup(160),
      'parser.DRY': cup(160),
    },
    needsReview: true,
    reviewNote:
      'הפער הגדול בטבלה: measure.TABLE נותן 42 (אגוז טחון), engine.CUP_DRY נותן 160 גר\' לכוס = 66.7 (אגוז שלם). שני הערכים סבירים לשתי צורות שונות של אותו חומר גלם. דורש הכרעה מקצועית — או פיצול לשתי שורות.',
  },
  {
    key: 'oats',
    match: ['שיבולת שועל', 'קוואקר'],
    gPer100: 38,
    confidence: 'estimate',
    sources: { 'measure.TABLE': 38, 'engine.CUP_DRY': cup(90) },
  },
  {
    key: 'rice',
    match: ['אורז'],
    gPer100: 77,
    confidence: 'system',
    sources: {
      'measure.TABLE': 77,
      'engine.CUP_DRY': cup(160),
      'parser.DRY': cup(160),
    },
    needsReview: true,
    reviewNote:
      'engine.CUP_DRY ו-parser.DRY קיבצו אורז יחד עם אגוזים (160 גר\' לכוס = 66.7). measure.TABLE נותן 77. הפער 13%.',
  },
  {
    key: 'juice',
    match: ['מיץ', 'פולפה', 'פירה'],
    gPer100: 105,
    confidence: 'system',
    sources: { 'measure.TABLE': 105, 'engine.DENS': dens(1.05) },
  },
  {
    key: 'alcohol',
    match: ['יין', 'ליקר', 'רום', 'ברנדי', 'וודקה'],
    gPer100: 98,
    confidence: 'system',
    sources: { 'measure.TABLE': 98, 'engine.DENS': dens(0.94) },
    needsReview: true,
    reviewNote:
      'measure.TABLE מקבץ יין ומשקאות חריפים יחד על 98. engine.DENS נותן 0.94 (=94) למשקאות חריפים בלבד, ואין לו שורה ליין. הפער 4%. פיזיקלית 0.94 מתאים לאלכוהול 40% ו-0.98 ליין — שתיהן נכונות לחומר גלם אחר.',
  },
  {
    key: 'coffee.liquid',
    match: ['אספרסו', 'קפה נוזלי'],
    gPer100: 100,
    confidence: 'system',
    sources: { 'measure.TABLE': 100 },
  },
  {
    key: 'coffee.ground',
    match: ['קפה טחון', 'קפה'],
    gPer100: 42,
    confidence: 'estimate',
    note: 'תלוי בדרגת הטחינה',
    sources: { 'measure.TABLE': 42 },
  },

  // ── rows that existed ONLY in engine.js and would otherwise be lost ────────
  {
    key: 'syrup.thick',
    match: ['סירופ', 'מולסה'],
    gPer100: dens(1.33),
    confidence: 'system',
    sources: { 'engine.DENS': dens(1.33) },
    needsReview: true,
    reviewNote:
      'קיים רק ב-engine.DENS (1.33). אין שורה מקבילה ב-measure.TABLE, ולכן אין מקור שני לאימות.',
  },
  {
    key: 'egg',
    match: ['ביצה', 'ביצים', 'חלמון', 'חלבון', "מלנג'"],
    exclude: ['קמח', 'אבקת חלבון'],
    gPer100: dens(1.03),
    confidence: 'system',
    sources: { 'engine.DENS': dens(1.03) },
    needsReview: true,
    reviewNote:
      'קיים רק ב-engine.DENS, שקיבץ ביצה שלמה, חלמון וחלבון יחד עם חלב על 1.03. פיזיקלית הם שונים (חלמון ≈ 1.03, חלבון ≈ 1.04, ביצה שלמה ≈ 1.03). דורש פיצול או אישור.',
  },
] as const;

/** True when we know this is a distinct ingredient we have no data for. */
export function isKnownDataGap(name: string | undefined): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  return KNOWN_DATA_GAPS.some((g) => n.includes(g));
}

/** Order-based lookup, exactly like the legacy `tableLookup`, plus the guards. */
export function lookupDensity(name: string | undefined): DensityEntry | null {
  const n = (name ?? '').trim();
  if (!n) return null;
  if (isKnownDataGap(n)) return null;
  for (const row of DENSITY_TABLE) {
    if (row.exclude?.some((x) => n.includes(x))) continue;
    if (row.match.some((k) => n.includes(k))) return row;
  }
  return null;
}

export function densityEntryByKey(key: string): DensityEntry | null {
  return DENSITY_TABLE.find((r) => r.key === key) ?? null;
}

/** Convenience for tests and for UI copy: grams per one cup of the given size. */
export function gramsPerCup(entry: DensityEntry, cupMl: number): number {
  return (entry.gPer100 * cupMl) / 100;
}
