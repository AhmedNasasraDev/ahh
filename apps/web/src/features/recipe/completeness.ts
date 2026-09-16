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

import type { Computed } from '@recipe-notebook/engine';

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
}

/** Hebrew agreement for a count of ingredients. */
function ingredientCount(n: number): string {
  return n === 1 ? 'רכיב אחד' : `${n} רכיבים`;
}

export function calcState(computed: Computed): CalcState {
  const missing = computed.unresolved.length;
  const counted = computed.rows.length - missing;

  if (missing === 0) {
    return {
      level: 'full',
      missing: 0,
      counted,
      missingNames: [],
      summary: '',
      partialFigures: false,
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
  };
}
