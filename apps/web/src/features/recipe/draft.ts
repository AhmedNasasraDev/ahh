// The editable shape of a recipe.
//
// THE ONE DESIGN DECISION THAT MATTERS HERE: every numeric field is a STRING.
//
// That looks like sloppiness and is the opposite. The schema distinguishes NULL
// from 0 in six places — `yield_actual`, `weight_before`, `weight_after`,
// `water_pct`, `g_per_100`, `unit_weight` — and in each of them NULL means "use
// the theoretical value / the shared table" while 0 means "someone measured
// zero" (§1.1, §18.11). A React `<input type="number">` bound to a `number`
// cannot express the difference: an emptied field arrives as `0` or `NaN`, and
// either way the distinction is gone before the mapper ever sees it.
//
// Held as strings, an empty field stays `''`, `toNullableNumber('')` returns
// `null`, and the column really is NULL. The engine cooperates: its fields are
// typed `number | string` and `num('')` is 0 while `numOrNull('')` is null, so a
// draft can be handed straight to `compute()` for the live preview with no
// conversion step in between — which is also why the preview cannot drift from
// what will be saved.
//
// Nothing here invents a value. A field the user left alone stays empty all the
// way to the database.

import { normalizeName } from '@recipe-notebook/engine';
import type { IngredientLike, Recipe, Step } from '@recipe-notebook/engine';

/** A form row for one ingredient. Ids are kept so React keys stay stable. */
export interface IngredientDraft {
  /** local row id, never sent to the database */
  key: string;
  name: string;
  /**
   * The canonical identity stored with this row (`ingredient_key`), when there
   * is one. It is what the engine matches a personal calibration and a density
   * override against (B4), so an edit that only changes a quantity must not
   * rewrite it — and before this field existed, saving through the editor
   * dropped it and `mappers.ts` regenerated it from the name.
   *
   * '' means "derive it from the name", which is what a new row gets.
   * `patchIngredientRow` clears it when the name is genuinely changed, because
   * then the row really is a different ingredient.
   */
  ingredientKey: string;
  qty: string;
  unit: string;
  flour: boolean;
  liquid: boolean;
  /** '' = use the shared water table (not 0) */
  waterPct: string;
  /** '' = no per-item weight on record */
  unitWeight: string;
  /** §5.1 rank 2 — a density typed into this recipe. '' = fall through */
  gPer100: string;
  price: string;
  priceUnit: string;
  note: string;
  /** a sub-recipe line (§18.6) — weighed, never volume-converted */
  subId: string;
}

export interface StepDraft {
  key: string;
  text: string;
  temp: string;
  minutes: string;
}

export interface RecipeDraft {
  /** '' for a recipe that does not exist yet */
  id: string;
  name: string;
  category: string;
  tags: string;
  isSub: boolean;
  locked: boolean;
  yieldUnits: string;
  unitWeight: string;
  /** '' = theoretical yield (§18.11). NOT the same as '0' */
  yieldActual: string;
  targetFC: string;
  /** stage 7: what the user charges. '' = not set, '0' = given away */
  salePrice: string;
  /** stage 8: is `salePrice` for the whole batch or for one unit? */
  salePriceBasis: 'batch' | 'unit';
  /**
   * stage 8, requirement E: the rest of the cost, ENTERED and never invented.
   * '' = not entered, '0' = there is none. The screen says which.
   */
  packagingCost: string;
  laborCost: string;
  otherCost: string;
  /** stage 8, requirement G: a target gross margin, in percent */
  targetGM: string;
  shelfLife: string;
  storage: string;
  equipment: string;
  notes: string;
  ingredients: IngredientDraft[];
  steps: StepDraft[];
}

let seq = 0;
const nextKey = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

/** Test seam, so row keys are deterministic within a test. */
export function resetDraftKeys(): void {
  seq = 0;
}

/** A number that came out of the database, as a form string. */
const str = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '' : String(v);

export function emptyIngredient(): IngredientDraft {
  return {
    key: nextKey('ing'),
    name: '',
    ingredientKey: '',
    // Grams by default. It is the only unit that needs no density, so a new row
    // starts in the state where the calculation is certainly complete.
    qty: '',
    unit: 'g',
    flour: false,
    liquid: false,
    waterPct: '',
    unitWeight: '',
    gPer100: '',
    price: '',
    priceUnit: '',
    note: '',
    subId: '',
  };
}

export function emptyStep(): StepDraft {
  return { key: nextKey('step'), text: '', temp: '', minutes: '' };
}

/**
 * Applies one edit to an ingredient row.
 *
 * The rule this exists for: a stored `ingredientKey` survives every edit
 * EXCEPT a real change to the name. Editing a quantity or a price must not
 * change what the row is — otherwise a personal calibration stops matching it.
 * Retyping the name is the user saying this is something else, so the key is
 * cleared and regenerated from the new name on save.
 *
 * Whitespace and gershayim variants are not a real change: the comparison is
 * the engine's own `normalizeName`, the same identity used everywhere else.
 */
export function patchIngredientRow(
  row: IngredientDraft,
  patch: Partial<IngredientDraft>,
): IngredientDraft {
  const next = { ...row, ...patch };
  if (
    patch.name !== undefined &&
    next.ingredientKey !== '' &&
    normalizeName(patch.name) !== normalizeName(row.name)
  ) {
    next.ingredientKey = '';
  }
  return next;
}

export function emptyDraft(category = 'אחר'): RecipeDraft {
  return {
    id: '',
    name: '',
    category,
    tags: '',
    isSub: false,
    locked: false,
    yieldUnits: '',
    unitWeight: '',
    yieldActual: '',
    targetFC: '',
    salePrice: '',
    salePriceBasis: 'batch',
    packagingCost: '',
    laborCost: '',
    otherCost: '',
    targetGM: '',
    shelfLife: '',
    storage: '',
    equipment: '',
    notes: '',
    // One empty row of each, so the form has somewhere to start typing.
    ingredients: [emptyIngredient()],
    steps: [emptyStep()],
  };
}

export function draftFromRecipe(recipe: Recipe): RecipeDraft {
  return {
    id: recipe.id ?? '',
    name: str(recipe.name),
    category: str(recipe.category) || 'אחר',
    tags: (recipe.tags ?? []).join(', '),
    isSub: recipe.isSub === true,
    locked: recipe.locked === true,
    yieldUnits: str(recipe.yieldUnits),
    unitWeight: str(recipe.unitWeight),
    yieldActual: str(recipe.yieldActual),
    targetFC: str(recipe.targetFC),
    salePrice: str(recipe['salePrice']),
    salePriceBasis: recipe['salePriceBasis'] === 'unit' ? 'unit' : 'batch',
    packagingCost: str(recipe['packagingCost']),
    laborCost: str(recipe['laborCost']),
    otherCost: str(recipe['otherCost']),
    targetGM: str(recipe['targetGM']),
    shelfLife: str(recipe.shelfLife),
    storage: str(recipe.storage),
    equipment: str(recipe.equipment),
    notes: str(recipe.notes),
    ingredients: (recipe.ingredients ?? []).map((ing) => ({
      key: nextKey('ing'),
      name: str(ing.name),
      ingredientKey: str(ing.ingredientKey),
      qty: str(ing.qty),
      unit: str(ing.unit) || 'g',
      flour: ing.flour === true,
      liquid: ing.liquid === true,
      waterPct: str(ing.waterPct),
      unitWeight: str(ing.unitWeight),
      gPer100: str(ing.gPer100),
      price: str(ing.price),
      priceUnit: str(ing.priceUnit),
      note: str(ing.note),
      subId: str(ing.subId),
    })),
    steps: (recipe.steps ?? []).map((s) => ({
      key: nextKey('step'),
      text: str(s.text),
      temp: str(s.temp),
      minutes: str(s.minutes),
    })),
  };
}

/**
 * A row the user never filled in.
 *
 * Only the name is load-bearing: a row with a name and no quantity is a real
 * thing ("קורט מלח"), and it is kept — it just cannot be weighed, and the
 * partial-calculation notice already says so. A row with neither is a leftover
 * blank from the form and is dropped on save.
 */
const isBlankIngredient = (i: IngredientDraft): boolean =>
  i.name.trim() === '' && i.qty.trim() === '';

const isBlankStep = (s: StepDraft): boolean =>
  s.text.trim() === '' && s.temp.trim() === '' && s.minutes.trim() === '';

/**
 * Draft → Recipe, ready for the repository.
 *
 * Empty strings are LEFT empty. `mappers.ts` turns them into SQL NULLs, and the
 * engine reads them as "no value" rather than as zero. Nothing is defaulted
 * here — that would be the place where a guessed number would enter the system.
 */
export function draftToRecipe(draft: RecipeDraft): Recipe {
  const trimmed = draft.ingredients.filter((i) => !isBlankIngredient(i));
  const steps = draft.steps.filter((s) => !isBlankStep(s));

  const recipe: Recipe = {
    id: draft.id || `new-${Date.now().toString(36)}`,
    name: draft.name.trim(),
    category: draft.category || 'אחר',
    tags: draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    isSub: draft.isSub,
    locked: draft.locked,
    yieldUnits: draft.yieldUnits.trim(),
    unitWeight: draft.unitWeight.trim(),
    yieldActual: draft.yieldActual.trim(),
    targetFC: draft.targetFC.trim(),
    salePrice: draft.salePrice.trim(),
    salePriceBasis: draft.salePriceBasis,
    packagingCost: draft.packagingCost.trim(),
    laborCost: draft.laborCost.trim(),
    otherCost: draft.otherCost.trim(),
    targetGM: draft.targetGM.trim(),
    shelfLife: draft.shelfLife.trim(),
    storage: draft.storage.trim(),
    equipment: draft.equipment.trim(),
    notes: draft.notes.trim(),
    ingredients: trimmed.map<IngredientLike>((i, idx) => {
      const ing: IngredientLike = {
        id: i.key,
        name: i.name.trim(),
        qty: i.qty.trim(),
        unit: i.unit,
      };
      if (i.ingredientKey) ing.ingredientKey = i.ingredientKey;
      if (i.flour) ing.flour = true;
      if (i.liquid) ing.liquid = true;
      if (i.waterPct.trim()) ing.waterPct = i.waterPct.trim();
      if (i.unitWeight.trim()) ing.unitWeight = i.unitWeight.trim();
      if (i.gPer100.trim()) ing.gPer100 = i.gPer100.trim();
      if (i.price.trim()) ing.price = i.price.trim();
      if (i.priceUnit) ing.priceUnit = i.priceUnit;
      if (i.note.trim()) ing.note = i.note.trim();
      if (i.subId) ing.subId = i.subId;
      void idx;
      return ing;
    }),
    steps: steps.map<Step>((s) => {
      const step: Step = { id: s.key, text: s.text.trim() };
      if (s.temp.trim()) step.temp = s.temp.trim();
      if (s.minutes.trim()) step.minutes = s.minutes.trim();
      return step;
    }),
  };
  return recipe;
}

// ── validation ─────────────────────────────────────────────────────────────

export interface DraftProblem {
  field: string;
  message: string;
}

/**
 * What must be true before a save is attempted.
 *
 * Deliberately short. The database enforces the one hard rule (a non-blank
 * name) and the engine handles missing numbers honestly, so a long client-side
 * validator here would mostly be inventing requirements the product does not
 * have. A recipe in progress is a legitimate thing to save.
 */
export function validateDraft(draft: RecipeDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];

  if (!draft.name.trim()) {
    problems.push({ field: 'name', message: 'למתכון חייב להיות שם.' });
  }

  const rows = draft.ingredients.filter((i) => !isBlankIngredient(i));
  if (rows.length === 0) {
    problems.push({ field: 'ingredients', message: 'צריך לפחות רכיב אחד.' });
  }

  rows.forEach((row, i) => {
    if (!row.name.trim()) {
      problems.push({
        field: `ingredient-${i}`,
        message: `לרכיב ${i + 1} יש כמות אבל אין שם.`,
      });
    }
    for (const [key, label] of [
      ['qty', 'הכמות'],
      ['waterPct', 'אחוז המים'],
      ['unitWeight', 'המשקל ליחידה'],
      ['gPer100', 'הצפיפות'],
      ['price', 'המחיר'],
    ] as const) {
      const raw = row[key].trim();
      if (raw && !Number.isFinite(Number(raw))) {
        problems.push({
          field: `ingredient-${i}-${key}`,
          message: `${label} של "${row.name.trim() || `רכיב ${i + 1}`}" אינה מספר.`,
        });
      }
    }
  });

  for (const [key, label] of [
    ['yieldUnits', 'מספר היחידות'],
    ['unitWeight', 'המשקל ליחידה'],
    ['yieldActual', 'התשואה בפועל'],
    ['targetFC', 'יעד הפוד קוסט'],
    ['salePrice', 'מחיר המכירה'],
    ['packagingCost', 'עלות האריזה'],
    ['laborCost', 'עלות העבודה'],
    ['otherCost', 'העלויות הנוספות'],
    ['targetGM', 'יעד הרווח הגולמי'],
  ] as const) {
    const raw = draft[key].trim();
    if (raw && !Number.isFinite(Number(raw))) {
      problems.push({ field: key, message: `${label} אינה מספר.` });
    }
  }

  // A gross margin of 100% would need an infinite price, and above it a
  // negative one. Refused rather than turned into a number.
  const gm = draft.targetGM.trim();
  if (gm && Number.isFinite(Number(gm)) && (Number(gm) < 0 || Number(gm) >= 100)) {
    problems.push({
      field: 'targetGM',
      message: 'יעד הרווח הגולמי צריך להיות בין 0 ל-100, ולא 100.',
    });
  }

  for (const [key, label] of [
    ['packagingCost', 'עלות האריזה'],
    ['laborCost', 'עלות העבודה'],
    ['otherCost', 'העלויות הנוספות'],
  ] as const) {
    const raw = draft[key].trim();
    if (raw && Number.isFinite(Number(raw)) && Number(raw) < 0) {
      problems.push({ field: key, message: `${label} אינה יכולה להיות שלילית.` });
    }
  }

  return problems;
}

// ── row operations ─────────────────────────────────────────────────────────

/** Moves a row one place, and returns the list unchanged at either end. */
export function moveRow<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return [...list];
  const out = [...list];
  const [row] = out.splice(from, 1);
  if (row === undefined) return [...list];
  out.splice(to, 0, row);
  return out;
}

/** True when the draft differs from the recipe it was opened from. */
export function isDirty(draft: RecipeDraft, original: RecipeDraft): boolean {
  // Row keys are local and change on every load, so they are excluded.
  const strip = (d: RecipeDraft) => ({
    ...d,
    ingredients: d.ingredients.map(({ key, ...rest }) => {
      void key;
      return rest;
    }),
    steps: d.steps.map(({ key, ...rest }) => {
      void key;
      return rest;
    }),
  });
  return JSON.stringify(strip(draft)) !== JSON.stringify(strip(original));
}
