// Recipe computation — ported from engine.js:68 (compute).
//
// The professional content is unchanged: yield, production loss, baking loss,
// scale weight, cost per unit and per kilo, target food cost, baker's
// percentages, raw and net hydration, the three-temperature water rule,
// allergens, recursive sub-recipes and the sub-recipe cycle guard.
//
// What changed:
//   • B1 — it takes `prefs` and resolves every unit through the one conversion
//     path, so the user's measuring-tool sizes reach the ingredient table, the
//     yield, the costs, the hydration and everything downstream.
//   • An ingredient whose weight cannot be established is reported in
//     `unresolved` instead of being silently valued at 150 g per cup.
//   • Assumptions that used to be invisible (a per-litre price with no known
//     density, an unrecognised liquid treated as 100% water) are collected in
//     `warnings`.

import type {
  Computed,
  ComputedRow,
  ComputeOptions,
  IngredientLike,
  Recipe,
  Unresolved,
} from './types.js';
import { toGrams } from './convert.js';
import { densityFor } from './density.js';
import { allergensFor } from './data/allergens.js';
import { lookupWaterPct } from './data/water.js';
import { num, numOrNull } from './text.js';
import { unavailableProvenance } from './provenance.js';

/** Water percentage for an ingredient: the recipe's own value wins. */
export function waterPctOf(ing: IngredientLike): {
  waterPct: number;
  assumed: boolean;
} {
  const own = numOrNull(ing.waterPct);
  if (own !== null) return { waterPct: own, assumed: false };
  return lookupWaterPct(ing.name);
}

export function compute(
  recipe: Recipe,
  recipes: readonly Recipe[],
  options: ComputeOptions = {},
  seen: ReadonlySet<string> = new Set(),
): Computed {
  const prefs = options.prefs;
  const rawFactor = options.factor;
  const f =
    !rawFactor || !Number.isFinite(rawFactor) || rawFactor <= 0 ? 1 : rawFactor;

  if (seen.has(recipe.id)) {
    return {
      ...emptyComputed(f),
      error: 'מעגל תת־מתכונים',
    };
  }
  const next = new Set(seen);
  next.add(recipe.id);

  let totalG = 0;
  let cost = 0;
  let flour = 0;
  let liquid = 0;
  let water = 0;
  const unresolved: Unresolved[] = [];
  const warnings: string[] = [];

  const rows: ComputedRow[] = (recipe.ingredients ?? []).map((ing) => {
    const base = toGrams(ing, prefs);
    const g = base.grams === null ? null : base.grams * f;

    if (g === null) {
      unresolved.push({
        ingredientId: ing.id,
        name: ing.name ?? '',
        unit: ing.unit ?? '',
        reason: base.provenance.why,
      });
      return {
        ing,
        g: null,
        provenance: base.provenance,
        cost: 0,
        bakerPct: 0,
        sub: null,
      };
    }

    let lineCost = 0;
    let subInfo: Computed | null = null;

    if (ing.subId) {
      const sub = recipes.find((r) => r.id === ing.subId);
      if (sub) {
        const s = compute(sub, recipes, { factor: 1, prefs }, next);
        const subYield = s.actualYield || s.totalG || 1;
        lineCost = (s.cost / subYield) * g;
        subInfo = s;
        if (s.error) warnings.push(`${ing.name}: ${s.error}`);
        for (const w of s.warnings) warnings.push(w);
        if (ing.countSubFormula) {
          const k = g / subYield;
          flour += s.flour * k;
          liquid += s.liquid * k;
          water += (s.water || 0) * k;
        }
      } else {
        warnings.push(`${ing.name}: מתכון הבסיס המקושר לא נמצא.`);
      }
    } else if (ing.price !== '' && ing.price != null) {
      const p = num(ing.price, 0);
      if (ing.priceUnit === 'ליטר') {
        const d = densityFor(ing, prefs, 'ml');
        const gPer100 = d ? d.gPer100 : 100;
        if (!d) {
          warnings.push(
            `${ing.name}: מחיר לליטר בלי נתון צפיפות. העלות חושבה לפי 1.0 גר'/מ"ל, כמו בפרוטוטייפ.`,
          );
        }
        lineCost = (g / (gPer100 / 100) / 1000) * p;
      } else {
        lineCost = (g / 1000) * p;
      }
    }

    if (ing.flour) flour += g;
    if (ing.liquid) {
      liquid += g;
      const w = waterPctOf(ing);
      water += (g * w.waterPct) / 100;
      if (w.assumed) {
        warnings.push(
          `${ing.name}: אין נתון אחוז מים, חושב כ-100% מים (ברירת מחדל מהפרוטוטייפ).`,
        );
      }
    }

    totalG += g;
    cost += lineCost;

    return { ing, g, provenance: base.provenance, cost: lineCost, bakerPct: 0, sub: subInfo };
  });

  const theoretical = totalG;
  const yieldActual = numOrNull(recipe.yieldActual);
  const actualYield = yieldActual !== null ? yieldActual * f : theoretical;
  const prodLoss = theoretical
    ? ((theoretical - actualYield) / theoretical) * 100
    : 0;
  const wb = num(recipe.weightBefore, 0);
  const wa = num(recipe.weightAfter, 0);
  const bakeLoss = wb ? ((wb - wa) / wb) * 100 : 0;
  const unitW = num(recipe.unitWeight, 0);
  const scaleWeight = unitW ? unitW / (1 - bakeLoss / 100) : 0;
  const unitsActual = scaleWeight
    ? actualYield / scaleWeight
    : num(recipe.yieldUnits, 0) * f;
  const costPerUnit = unitsActual ? cost / unitsActual : 0;
  const costPerKg = actualYield ? (cost / actualYield) * 1000 : 0;
  const fc = num(recipe.targetFC, 0);
  const price = fc ? costPerUnit / (fc / 100) : 0;
  const hydration = flour ? (liquid / flour) * 100 : 0;
  const trueHydration = flour ? (water / flour) * 100 : 0;
  const waterTemp = recipe.doughMode
    ? 3 * num(recipe.ddt, 0) -
      num(recipe.flourTemp, 0) -
      num(recipe.roomTemp, 0) -
      num(recipe.friction, 0)
    : null;
  const target = num(recipe.yieldUnits, 0) * f;
  const unitsWarn = !!target && Math.abs(unitsActual - target) / target > 0.05;

  const allergenSet = new Set(recipe.manualAllergens ?? []);
  const collect = (rs: ComputedRow[]): void => {
    for (const r of rs) {
      for (const a of allergensFor(r.ing.name)) allergenSet.add(a);
      if (r.sub) collect(r.sub.rows);
    }
  };
  collect(rows);

  for (const r of rows) {
    r.bakerPct = flour && r.g !== null ? (r.g / flour) * 100 : 0;
  }

  return {
    rows,
    totalG,
    theoretical,
    actualYield,
    prodLoss,
    bakeLoss,
    scaleWeight,
    unitsActual,
    unitsWarn,
    cost,
    costPerUnit,
    costPerKg,
    price,
    flour,
    liquid,
    water,
    hydration,
    trueHydration,
    waterTemp,
    allergens: [...allergenSet],
    factor: f,
    unresolved,
    warnings: [...new Set(warnings)],
  };
}

function emptyComputed(f: number): Computed {
  return {
    rows: [],
    totalG: 0,
    theoretical: 0,
    actualYield: 0,
    prodLoss: 0,
    bakeLoss: 0,
    scaleWeight: 0,
    unitsActual: 0,
    unitsWarn: false,
    cost: 0,
    costPerUnit: 0,
    costPerKg: 0,
    price: 0,
    flour: 0,
    liquid: 0,
    water: 0,
    hydration: 0,
    trueHydration: 0,
    waterTemp: null,
    allergens: [],
    factor: f,
    unresolved: [],
    warnings: [],
  };
}

/** Scaling factor for the four scaling modes (spec §6). Same engine, one path. */
export function scaleFactor(
  mode: 'recipe' | 'units' | 'weight' | 'stock',
  value: number,
  baseline: Computed,
  stockIngredientId?: string,
): number {
  const v = Number(value);
  if (mode === 'recipe' || !v || v <= 0) return 1;
  if (mode === 'units') return baseline.unitsActual ? v / baseline.unitsActual : 1;
  if (mode === 'weight') return baseline.actualYield ? v / baseline.actualYield : 1;
  const row =
    baseline.rows.find((r) => r.ing.id === stockIngredientId) ?? baseline.rows[0];
  return row && row.g ? v / row.g : 1;
}

export { unavailableProvenance };
