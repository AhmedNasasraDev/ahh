// How complete is this calculation?
//
// The engine already refuses to invent a density: a row it cannot weigh comes
// back with `g === null` and lands in `Computed.unresolved`. But every total on
// the recipe page is a sum over the rows it COULD weigh, and a sum over some of
// the rows looks exactly like a sum over all of them.
//
// Stage-3 requirement 8, in the user's words: when `Computed.unresolved` is not
// empty, the total, the cost and the price must not be presented as a finished
// calculation, and the screen must distinguish
//
//   full  — every ingredient was weighed; the figures are the whole recipe
//   partial — some were; the figures are real but incomplete, and are labelled
//   none  — nothing was weighed; there is no figure to show, so none is shown
//
// It deliberately does NOT guess a value to close the gap. The way out of
// `partial` is a personal calibration or a verified density, both of which the
// conversion sheet already offers.

import type { Computed, ComputedRow } from '@recipe-notebook/engine';

export type CalcLevel = 'full' | 'partial' | 'none';

export interface CalcState {
  level: CalcLevel;
  /** ingredients with no reliable weight */
  missing: number;
  /** ingredients that did contribute to the totals */
  counted: number;
  /** their names, for the explanation */
  missingNames: readonly string[];
  /** one sentence, ready to render */
  summary: string;
  /** true while any figure derived from total mass or cost is incomplete */
  partialFigures: boolean;
  /**
   * Whether the COST figures mean anything, which is a separate question from
   * whether the weights do.
   *
   * Found while reviewing a tablet screenshot of the editor: a recipe with no
   * prices entered showed "עלות כוללת ₪0". Every weight was known, so the mass
   * side was legitimately `full` — but nobody had priced anything, and ₪0 reads
   * as "this recipe is free". That is the same failure requirement 8 exists to
   * prevent, one axis over.
   *
   *   full    every weighable ingredient carries a price
   *   partial some do
   *   none    none do, so there is no cost, no cost/kg and no sale price
   */
  costLevel: CalcLevel;
  /** ingredients with a weight but no price */
  unpricedNames: readonly string[];
  /** one sentence about the cost side, '' when it is complete */
  costSummary: string;
}

/** Hebrew agreement for a count of ingredients. */
function ingredientCount(n: number): string {
  return n === 1 ? 'רכיב אחד' : `${n} רכיבים`;
}

/**
 * Does this row put anything into the cost total?
 *
 * Two ways it can: a price of its own, or a sub-recipe whose own cost rolls up
 * (§18.6). A row with `price: 0` counts as priced — someone typed a zero, and
 * a foraged or donated ingredient really does cost nothing. Treating an empty
 * price as zero is the thing this exists to avoid.
 */
function contributesCost(row: ComputedRow): boolean {
  if (row.g === null) return false;
  const price = row.ing.price;
  if (price !== undefined && price !== null && price !== '' && Number.isFinite(Number(price))) {
    return true;
  }
  return Boolean(row.ing.subId) && row.cost > 0;
}

/** The cost side of the same question. */
function costState(computed: Computed): {
  costLevel: CalcLevel;
  unpricedNames: string[];
  costSummary: string;
} {
  const weighable = computed.rows.filter((r) => r.g !== null);
  const priced = weighable.filter(contributesCost);
  const unpriced = weighable.filter((r) => !contributesCost(r));
  const unpricedNames = unpriced.map((r) => r.ing.name ?? '').filter(Boolean);

  if (weighable.length === 0 || priced.length === 0) {
    return {
      costLevel: 'none',
      unpricedNames,
      costSummary:
        'לא הוזנו מחירים לאף רכיב, ולכן אין עלות, אין עלות לק"ג ואין מחיר מכירה. ' +
        'אפס אינו התשובה — פשוט אין נתון.',
    };
  }
  if (unpriced.length > 0) {
    return {
      costLevel: 'partial',
      unpricedNames,
      costSummary:
        `העלות מחושבת מ-${ingredientCount(priced.length)} שיש להם מחיר. ` +
        `ל-${ingredientCount(unpriced.length)} אין מחיר, ולכן העלות נמוכה מהעלות בפועל.`,
    };
  }
  return { costLevel: 'full', unpricedNames: [], costSummary: '' };
}

export function calcState(computed: Computed): CalcState {
  const missing = computed.unresolved.length;
  const counted = computed.rows.length - missing;

  const cost = costState(computed);

  if (missing === 0) {
    return {
      level: 'full',
      missing: 0,
      counted,
      missingNames: [],
      summary: '',
      partialFigures: false,
      ...cost,
    };
  }

  const missingNames = computed.unresolved.map((u) => u.name).filter(Boolean);

  // Nothing could be weighed. A "total" of zero would be a lie, so the screen
  // shows no figure at all rather than a number that happens to be 0.
  if (counted === 0) {
    return {
      level: 'none',
      missing,
      counted: 0,
      missingNames,
      summary:
        `אין נתוני צפיפות לאף רכיב במתכון הזה, ולכן אי אפשר לחשב משקל, עלות או מחיר. ` +
        `כיול אישי של כלי המדידה שלכם, או הזנת משקל במקום נפח, יפתרו זאת.`,
      partialFigures: true,
      ...cost,
      // Nothing could be weighed, so nothing could be priced either, whatever
      // prices happen to be on the rows.
      costLevel: 'none',
    };
  }

  return {
    level: 'partial',
    missing,
    counted,
    missingNames,
    summary:
      `נתונים חלקיים — חסרים נתונים עבור ${ingredientCount(missing)}. ` +
      `סך המשקל, העלות והמחיר מחושבים מ-${ingredientCount(counted)} בלבד ואינם מלאים.`,
    partialFigures: true,
    ...cost,
  };
}
