/*
  What one ingredient row SHOWS — §5.4's three views, in one place.

  ─────────────────────────────────────────────────────────────────────────────
  MOVED HERE, NOT WRITTEN HERE

  This is the `rowLabel` that lived inside `RecipeScreen`, unchanged. It came
  out when Cook Mode needed to print the same quantities for Mise en place
  (§14): a second implementation would have been a second answer to "how much
  flour", and the two would have disagreed the first time somebody touched one
  of them — which is exactly the class of bug the costing stage spent a day on.

  WHAT IT IS NOT ALLOWED TO DO, AND DOES NOT

  Scale anything. `row.g` arrives already multiplied by the factor, because
  `compute()` did it; the only arithmetic here is `qty * factor` for the "as
  written" view, which converts nothing and computes no weight — it restates
  the recipe's own number in the recipe's own unit.

  WHY A NULL WEIGHT IS AN EM DASH IN EVERY VIEW

  Because the app does not know it. A row the engine could not resolve to a
  weight has no honest number to print, in any view, and printing the written
  quantity as though it were verified is how a kitchen ends up weighing the
  wrong thing. The hint says why.
*/

import { formatGrams, homeMeasure, unitLabel, type ComputedRow } from '@recipe-notebook/engine';
import type { MeasurementPrefs } from '@recipe-notebook/engine';

/** §5.4: as written · grams · home measures. */
export type ViewMode = 'orig' | 'g' | 'home';

export interface RowLabel {
  text: string;
  /** a secondary line, '' when it would only repeat `text` */
  hint: string;
}

export function rowLabel(
  row: ComputedRow,
  view: ViewMode,
  factor: number,
  prefs: MeasurementPrefs,
): RowLabel {
  if (row.g === null) {
    return { text: '—', hint: 'אין נתון אמין' };
  }
  if (view === 'g' || row.ing.subId) {
    return { text: formatGrams(row.g), hint: '' };
  }
  if (view === 'home') {
    const home = homeMeasure(row.ing, factor, prefs);
    return home?.ok
      ? { text: home.text, hint: formatGrams(row.g) }
      : // §5.4: a row with no reliable data stays in grams and is marked as such
        { text: formatGrams(row.g), hint: 'נשקל בגרם, אין נתון אמין' };
  }
  // "as written": keep the recipe's own unit, scaled
  const qty = Number(row.ing.qty ?? 0) * factor;
  const rounded =
    Math.abs(qty - Math.round(qty)) < 0.01 ? Math.round(qty) : Math.round(qty * 100) / 100;
  const text = `${rounded} ${unitLabel(row.ing.unit)}`;
  const grams = formatGrams(row.g);
  // The gram hint is only worth showing when it adds something. For an
  // ingredient already written in grams it would just repeat the line.
  return { text, hint: text === grams ? '' : grams };
}
