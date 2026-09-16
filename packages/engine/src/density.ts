// Density resolution — the single entry point for "how heavy is a millilitre of
// this?". Precedence is exactly spec §5.1, and it is now the ONLY path: the
// recipe screen, the conversion drawer, the scaler, the cost engine and the
// importer all come through here. That is the structural fix for B1 and B2.

import type {
  DensityHit,
  IngredientLike,
  MeasurementPrefs,
  ToolId,
} from './types.js';
import { lookupDensity } from './data/density-table.js';
import { findCalibration } from './calibration.js';
import { numOrNull } from './text.js';
import { unit } from './units.js';

export const NO_DENSITY_MESSAGE = (name: string | undefined): string =>
  `אין נתון אמין להמרת ${name?.trim() || 'הרכיב הזה'} בין נפח למשקל. אפשר לשקול כוס אחת ולהוסיף כיול אישי.`;

/**
 * Spec §5.1 precedence:
 *   1. personal   — the user's own calibration for this exact ingredient
 *   2. recipe     — ingredient.gPer100 typed into the recipe
 *   3. system     — the shared table
 *   4. estimate   — a table row whose value swings with the ingredient's form
 *   5. null       — no reliable data. Never a number.
 *
 * `contextUnit` is only used to pick the nicest calibration note; it never
 * changes the number, because a calibration is stored as g/100 ml.
 */
export function densityFor(
  ing: Pick<IngredientLike, 'name' | 'ingredientKey' | 'gPer100' | 'density'>,
  prefs?: MeasurementPrefs,
  contextUnit?: string | null,
): DensityHit | null {
  const tool: ToolId | null = unit(contextUnit)?.tool ?? null;

  // 1. personal
  const cal = findCalibration(ing, prefs, tool);
  if (cal) return cal;

  // 2. recipe — ingredient.gPer100, or the legacy ingredient.density (g/ml)
  const fromRecipe = numOrNull(ing.gPer100);
  if (fromRecipe !== null && fromRecipe > 0) {
    return {
      gPer100: fromRecipe,
      source: 'recipe',
      note: 'נתון שהוזן במתכון עצמו',
      needsReview: false,
    };
  }
  const legacyDensity = numOrNull(ing.density);
  if (legacyDensity !== null && legacyDensity > 0) {
    return {
      gPer100: legacyDensity * 100,
      source: 'recipe',
      note: 'נתון צפיפות שהוזן במתכון (g/ml)',
      needsReview: false,
    };
  }

  // 3 + 4. the shared table
  const row = lookupDensity(ing.name);
  if (row) {
    return {
      gPer100: row.gPer100,
      source: row.confidence,
      densityKey: row.key,
      note: row.note ?? '',
      needsReview: row.needsReview === true,
    };
  }

  // 5. nothing. The caller must not substitute a number.
  return null;
}
