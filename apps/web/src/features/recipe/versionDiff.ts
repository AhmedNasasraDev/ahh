// "What changed" between two versions of a recipe (§9).
//
// Ported from the prototype's `versionDiff` at
// design_handoff_recipe_notebook/מחברת מתכונים.dc.html:1663, because §9
// specifies the algorithm precisely rather than leaving it open:
//
//   "versionDiff מזהה: שינוי שם, רכיב שנוסף, רכיב שהוסר, שינוי כמות (עד 3
//    שמות), שינוי מספר שלבים, ושינוי תשואה מחושבת. אם דבר לא זוהה —
//    'שינויים קלים'."
//
// So this is a transcription, not a design. The order of the clauses, the
// three-name cap, the yield-only-if-nothing-else-was-found fallback and the
// 1-gram threshold are all the prototype's.
//
// It lives in the web app rather than in packages/engine because it is a
// description for a human, not a calculation — but it does call the engine's
// `compute()` for the yield fallback, which is the one part that must not be
// re-implemented.
//
// Two deliberate departures from the prototype, both about honesty:
//
//   1. The prototype keys ingredients by raw name, so "קמח " and "קמח" are
//      different ingredients and renaming one reads as "added X, removed Y".
//      This uses the engine's `ingredientKeyOf`, which is the same identity
//      calibration matching uses (B4). A rename is still reported as an
//      add plus a remove — that is genuinely what happened to the formula —
//      but whitespace and gershayim variants no longer masquerade as one.
//
//   2. A quantity change compares the RESOLVED GRAMS, not the raw `qty`.
//      Changing "2 כוס" to "480 גרם" leaves `qty` looking wildly different
//      while the formula is unchanged, and the prototype would have called
//      that a quantity change. Where grams cannot be resolved it falls back
//      to comparing qty and unit, so an unweighable row still reports.

import {
  compute,
  ingredientKeyOf,
  unitLabel,
  type IngredientLike,
  type MeasurementPrefs,
  type Recipe,
} from '@recipe-notebook/engine';

/** Up to three names, as §9 specifies. */
const MAX_NAMES = 3;

const nameList = (names: readonly string[]): string => {
  // Deduplicated: an ingredient that appears twice in the formula would
  // otherwise read as "שונתה כמות: מים, מים", which says nothing extra and
  // eats two of the three slots §9 allows.
  const unique = [...new Set(names)];
  const shown = unique.slice(0, MAX_NAMES).join(', ');
  return unique.length > MAX_NAMES ? `${shown} ועוד` : shown;
};

interface RowFacts {
  name: string;
  grams: number | null;
  qty: string;
  unit: string;
  subId: string;
}

/**
 * What each ingredient looks like for comparison purposes.
 *
 * The map key is the ingredient's identity plus WHICH OCCURRENCE it is. Two
 * rows may legitimately share an identity — water added in two stages, or two
 * rows carrying the same `ingredient_key` — and there is no unique constraint
 * stopping it. Keying on the identity alone silently collapsed them, and the
 * two sides then had different row counts, which came out as a contradictory
 * "נוסף מים · הוסר מים". Numbering the occurrences matches the nth row on one
 * side against the nth on the other, so adding a second `מים` reads as an
 * addition and changing the second one's amount reads as a quantity change.
 */
function factsOf(
  recipe: Recipe,
  recipes: readonly Recipe[],
  prefs: MeasurementPrefs | undefined,
): Map<string, RowFacts> {
  const computed = compute(recipe, recipes, { prefs });
  const byKey = new Map<string, RowFacts>();
  const seen = new Map<string, number>();

  for (const row of computed.rows) {
    const ing = row.ing as IngredientLike;
    const key = ingredientKeyOf(ing);
    if (!key) continue;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    byKey.set(`${key}#${n}`, {
      name: ing.name ?? '',
      grams: row.g,
      qty: String(ing.qty ?? ''),
      unit: String(ing.unit ?? ''),
      subId: String(ing.subId ?? ''),
    });
  }
  return byKey;
}

/** Did the amount of this ingredient really change? */
function amountChanged(a: RowFacts, b: RowFacts): boolean {
  if (a.grams !== null && b.grams !== null) {
    // A gram is the smallest difference worth reporting, matching the
    // prototype's threshold for the yield comparison.
    return Math.abs(a.grams - b.grams) >= 1;
  }
  // One or both could not be weighed: compare what was actually written.
  return a.qty !== b.qty || a.unit !== b.unit;
}

export interface VersionDiffInput {
  before: Recipe;
  after: Recipe;
  /** the notebook, so a sub-recipe's contribution can be computed */
  recipes: readonly Recipe[];
  prefs?: MeasurementPrefs;
}

/**
 * A one-line description of what changed, in the §9 wording.
 * Never empty: "שינויים קלים" when nothing on the list was detected.
 */
export function versionDiff({
  before,
  after,
  recipes,
  prefs,
}: VersionDiffInput): string {
  const bits: string[] = [];

  if ((before.name ?? '') !== (after.name ?? '')) bits.push('שם השתנה');

  const oldRows = factsOf(before, recipes, prefs);
  const newRows = factsOf(after, recipes, prefs);
  const keys = new Set([...oldRows.keys(), ...newRows.keys()]);

  const added: string[] = [];
  const removed: string[] = [];
  const moved: string[] = [];
  const relinked: string[] = [];

  for (const key of keys) {
    const o = oldRows.get(key);
    const n = newRows.get(key);
    if (!o && n) added.push(n.name);
    else if (o && !n) removed.push(o.name);
    else if (o && n) {
      if (amountChanged(o, n)) moved.push(n.name);
      // Not in §9's list, but a sub-recipe link changing IS a change to the
      // formula and "שינויים קלים" would be a lie about it.
      if (o.subId !== n.subId) relinked.push(n.name);
    }
  }

  if (added.length) bits.push(`נוסף ${nameList(added)}`);
  if (removed.length) bits.push(`הוסר ${nameList(removed)}`);
  if (moved.length) bits.push(`שונתה כמות: ${nameList(moved)}`);
  if (relinked.length) bits.push(`שונה מתכון הבסיס: ${nameList(relinked)}`);

  const oldSteps = (before.steps ?? []).length;
  const newSteps = (after.steps ?? []).length;
  if (oldSteps !== newSteps) bits.push('מספר השלבים שונה');

  // §9: the yield comparison is a FALLBACK, only consulted when nothing above
  // was detected. Running it always would append "התשואה השתנתה" to every
  // quantity change, which is true but says nothing new.
  if (bits.length === 0) {
    const a = compute(before, recipes, { prefs });
    const b = compute(after, recipes, { prefs });
    if (Math.abs(a.actualYield - b.actualYield) > 1) bits.push('התשואה השתנתה');
  }

  return bits.length ? bits.join(' · ') : 'שינויים קלים';
}

/**
 * A short label for a version in a list, e.g. "12 רכיבים · 1.2 ק״ג".
 *
 * Requirement 4 asks for enough to identify a version at a glance. The `what`
 * text says what changed; this says what the recipe WAS, which is what tells
 * you whether it is the one you want back.
 */
export function versionSummary(
  snapshot: Recipe,
  recipes: readonly Recipe[],
  prefs?: MeasurementPrefs,
): string {
  const ings = (snapshot.ingredients ?? []).length;
  const bits: string[] = [
    ings === 1 ? 'רכיב אחד' : `${ings} רכיבים`,
  ];

  const steps = (snapshot.steps ?? []).length;
  if (steps > 0) bits.push(steps === 1 ? 'שלב אחד' : `${steps} שלבים`);

  // The weight only goes in when the engine could actually establish it —
  // a partial sum presented as "what this version weighed" would be wrong.
  const c = compute(snapshot, recipes, { prefs });
  if (c.unresolved.length === 0 && c.totalG > 0) {
    bits.push(
      c.totalG >= 1000
        ? `${(c.totalG / 1000).toFixed(2).replace(/\.?0+$/, '')} ק"ג`
        : `${Math.round(c.totalG)} גר'`,
    );
  }

  return bits.join(' · ');
}

/** A human label for an ingredient line, used in the version viewer. */
export function ingredientLine(ing: IngredientLike): string {
  const qty = String(ing.qty ?? '').trim();
  const unit = unitLabel(ing.unit);
  return qty ? `${qty} ${unit}` : unit;
}
