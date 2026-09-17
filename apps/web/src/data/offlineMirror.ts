// The offline mirror — the local half of the approved hybrid model.
//
// Holds only what has to survive a dead zone in the kitchen:
//   • measurement preferences and calibrations — every conversion needs them
//   • the active recipe — so the recipe page and Cook Mode keep working
//   • Cook Mode progress — step marks and timers, which the prototype lost on
//     every reload (a real annoyance mid-bake)
//
// It is a CACHE, never the source of truth. Nothing here is authoritative and
// nothing here is synced upward; writes go to the repository.
//
// Every accessor is failure-tolerant: IndexedDB throws in private windows, with
// site data blocked, and in some embedded webviews. A cache miss must degrade to
// "we have nothing local", never to a crash.

import { clear, del, get, set } from 'idb-keyval';
import type { Calibration, MeasurementPrefs, Recipe } from '@recipe-notebook/engine';

const KEY = {
  prefs: 'rn.prefs.v1',
  calibrations: 'rn.calibrations.v1',
  recipe: (id: string) => `rn.recipe.v1.${id}`,
  recipeIndex: 'rn.recipeIndex.v1',
  cookProgress: (recipeId: string) => `rn.cook.v1.${recipeId}`,
  lastOpened: 'rn.lastOpened.v1',
} as const;

async function safeGet<T>(key: string): Promise<T | null> {
  try {
    return (await get<T>(key)) ?? null;
  } catch {
    return null;
  }
}

async function safeSet(key: string, value: unknown): Promise<boolean> {
  try {
    await set(key, value);
    return true;
  } catch {
    return false;
  }
}

async function safeDel(key: string): Promise<void> {
  try {
    await del(key);
  } catch {
    /* nothing to do — the mirror is best effort */
  }
}

// ── measurement preferences ────────────────────────────────────────────────

export const readPrefs = (): Promise<MeasurementPrefs | null> =>
  safeGet<MeasurementPrefs>(KEY.prefs);

export const writePrefs = (prefs: MeasurementPrefs): Promise<boolean> =>
  safeSet(KEY.prefs, prefs);

export const readCalibrations = async (): Promise<Calibration[]> =>
  (await safeGet<Calibration[]>(KEY.calibrations)) ?? [];

export const writeCalibrations = (list: readonly Calibration[]): Promise<boolean> =>
  safeSet(KEY.calibrations, list);

// ── recipes ────────────────────────────────────────────────────────────────

/** A trimmed row for the notebook list, so the list renders with no network. */
export interface RecipeIndexRow {
  id: string;
  name: string;
  category: string;
  isSub: boolean;
  locked: boolean;
  tags: string[];
}

export const readRecipeIndex = async (): Promise<RecipeIndexRow[]> =>
  (await safeGet<RecipeIndexRow[]>(KEY.recipeIndex)) ?? [];

export const writeRecipeIndex = (rows: readonly RecipeIndexRow[]): Promise<boolean> =>
  safeSet(KEY.recipeIndex, rows);

export const readRecipe = (id: string): Promise<Recipe | null> =>
  safeGet<Recipe>(KEY.recipe(id));

/** Mirrors the recipe the user just opened — this is what "active recipe" means. */
export const writeRecipe = (recipe: Recipe): Promise<boolean> =>
  safeSet(KEY.recipe(recipe.id), recipe);

export const forgetRecipe = (id: string): Promise<void> => safeDel(KEY.recipe(id));

// ── Cook Mode progress (§14) ───────────────────────────────────────────────

export interface CookProgress {
  recipeId: string;
  /** step index → completed */
  done: Record<number, boolean>;
  step: number;
  updatedAt: number;
}

export const readCookProgress = (recipeId: string): Promise<CookProgress | null> =>
  safeGet<CookProgress>(KEY.cookProgress(recipeId));

export const writeCookProgress = (progress: CookProgress): Promise<boolean> =>
  safeSet(KEY.cookProgress(progress.recipeId), {
    ...progress,
    updatedAt: Date.now(),
  });

export const clearCookProgress = (recipeId: string): Promise<void> =>
  safeDel(KEY.cookProgress(recipeId));

// ── the last recipe opened on this device (§2 screen 2) ────────────────────
//
// DEVICE state, deliberately, and the home screen says so in those words. The
// alternative is a `last_opened` column on `recipes`, which would mean an
// account-wide write on every recipe view — a write whose only purpose is to
// decorate one card, and which would make "where you stopped" follow you onto
// a shared kitchen tablet. `clearMirror()` on sign-out takes this with
// everything else, which is the behaviour a shared device needs.

export const readLastOpened = (): Promise<string | null> =>
  safeGet<string>(KEY.lastOpened);

export const writeLastOpened = (recipeId: string): Promise<boolean> =>
  safeSet(KEY.lastOpened, recipeId);

/**
 * Wipes the whole mirror.
 *
 * Called on sign-out. The mirror is a plaintext copy of ONE account's recipes,
 * preferences and calibrations, sitting on a device that may be shared — a
 * kitchen tablet, most likely. Leaving it in place would mean the next person
 * to sign in could read the previous account's notebook straight out of the
 * cache before the first network response arrives, which is exactly the
 * isolation RLS exists to provide.
 *
 * `clear()` empties the default idb-keyval store, and this module is the only
 * writer to it, so nothing else is affected. Failure is tolerated the same way
 * every other accessor here tolerates it, and each key is then removed
 * individually as a fallback.
 */
export async function clearMirror(): Promise<void> {
  try {
    await clear();
    return;
  } catch {
    /* fall through to the per-key path below */
  }
  const index = await readRecipeIndex();
  await Promise.all([
    safeDel(KEY.prefs),
    safeDel(KEY.calibrations),
    safeDel(KEY.recipeIndex),
    safeDel(KEY.lastOpened),
    ...index.flatMap((r) => [safeDel(KEY.recipe(r.id)), safeDel(KEY.cookProgress(r.id))]),
  ]);
}

/** Exposed for tests and for a future "clear local data" control in settings. */
export const MIRROR_KEYS = KEY;
