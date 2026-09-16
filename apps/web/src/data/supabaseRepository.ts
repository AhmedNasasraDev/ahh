// The Supabase implementation of the Repository interface.
//
// Sits behind the seam defined in repository.ts, so no screen changed to
// accommodate it. Every mapping between the normalised schema and the engine's
// recipe shape happens in mappers.ts.
//
// Security posture (HANDOFF §3, §6):
//   • Every statement here runs as the signed-in user through the anon key, so
//     RLS is the enforcement, not these queries. The `owner_id = auth.uid()`
//     filters below are belt-and-braces and a query-planner hint — never the
//     security boundary.
//   • A write that RLS refuses surfaces as an error. It is never swallowed.
//
// Recipes are stored across six tables. A save therefore has to replace the
// child rows, and Postgres has no multi-statement transaction over the REST
// API. The order is chosen so a partial failure leaves the recipe readable:
// the parent row is written first and children are replaced last.

import type { Calibration, MeasurementPrefs, Recipe } from '@recipe-notebook/engine';
import { normalizeCalibrations } from '@recipe-notebook/engine';
import type { TypedSupabaseClient } from '../lib/supabase.js';
import {
  WriteNotAllowedError,
  type Repository,
  type RepositoryCapabilities,
} from './repository.js';
import {
  bundleToRecipe,
  calibrationRowToDomain,
  calibrationToInsert,
  ingredientsToRows,
  issuesToRows,
  prefsToProfileUpdate,
  profileRowToPrefs,
  recipeToRow,
  stepsToRows,
  type RecipeBundle,
} from './mappers.js';
import * as mirror from './offlineMirror.js';
import { DEMO_CATEGORIES } from './demoRecipes.js';

/** The column list used to pull a whole recipe in one round trip. */
const RECIPE_SELECT = `
  *,
  ingredients (*),
  steps (*),
  issues (*),
  trials (*),
  batches (*),
  recipe_versions (*)
`;

export class SupabaseRepositoryError extends Error {
  constructor(
    readonly operation: string,
    cause: unknown,
  ) {
    const detail =
      typeof cause === 'object' && cause !== null && 'message' in cause
        ? String((cause as { message: unknown }).message)
        : String(cause);
    super(`${operation}: ${detail}`);
    this.name = 'SupabaseRepositoryError';
  }
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

export interface SupabaseRepositoryDeps {
  client: TypedSupabaseClient;
  /** the signed-in user's id; the repository refuses to work without one */
  userId: string;
}

export function createSupabaseRepository({
  client,
  userId,
}: SupabaseRepositoryDeps): Repository {
  let servingFromCache = false;

  const capabilities = (): RepositoryCapabilities => ({
    source: 'supabase',
    online: isOnline(),
    canWrite: isOnline(),
    servingFromCache,
  });

  /** Writes are refused offline rather than queued — no sync engine in this stage. */
  const requireOnline = (what: string): void => {
    if (!isOnline()) {
      throw new WriteNotAllowedError(
        `אין חיבור לאינטרנט, ולכן ${what} לא נשמר. הנתונים שמוצגים נשמרו על המכשיר לקריאה בלבד.`,
      );
    }
  };

  return {
    capabilities,

    async listCategories() {
      // §1.1: category comes from a closed list. It is UI copy, not user data,
      // so it stays in the client rather than becoming a table.
      return DEMO_CATEGORIES;
    },

    // ── recipes ────────────────────────────────────────────────────────────

    async listRecipes(): Promise<Recipe[]> {
      const { data, error } = await client
        .from('recipes')
        .select(RECIPE_SELECT)
        .eq('owner_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        // Fall back to the offline mirror rather than showing an empty notebook
        const cachedIndex = await mirror.readRecipeIndex();
        if (cachedIndex.length > 0) {
          const cached = await Promise.all(
            cachedIndex.map((row) => mirror.readRecipe(row.id)),
          );
          const usable = cached.filter((r): r is Recipe => r !== null);
          if (usable.length > 0) {
            servingFromCache = true;
            return usable;
          }
        }
        throw new SupabaseRepositoryError('טעינת המחברת נכשלה', error);
      }

      servingFromCache = false;
      const recipes = (data ?? []).map((row) => {
        const r = row as unknown as Record<string, unknown>;
        return bundleToRecipe({
          recipe: r as never,
          ingredients: (r['ingredients'] ?? []) as never,
          steps: (r['steps'] ?? []) as never,
          issues: (r['issues'] ?? []) as never,
          trials: (r['trials'] ?? []) as never,
          batches: (r['batches'] ?? []) as never,
          versions: (r['recipe_versions'] ?? []) as never,
        } as RecipeBundle);
      });

      void mirror.writeRecipeIndex(
        recipes.map((r) => ({
          id: r.id,
          name: r.name ?? '',
          category: r.category ?? 'אחר',
          isSub: r.isSub === true,
          locked: r.locked === true,
          tags: [...(r.tags ?? [])],
        })),
      );
      return recipes;
    },

    async getRecipe(id: string): Promise<Recipe | null> {
      const { data, error } = await client
        .from('recipes')
        .select(RECIPE_SELECT)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        const cached = await mirror.readRecipe(id);
        servingFromCache = cached !== null;
        if (cached) return cached;
        throw new SupabaseRepositoryError('טעינת המתכון נכשלה', error);
      }
      if (!data) return null;

      servingFromCache = false;
      const r = data as unknown as Record<string, unknown>;
      const recipe = bundleToRecipe({
        recipe: r as never,
        ingredients: (r['ingredients'] ?? []) as never,
        steps: (r['steps'] ?? []) as never,
        issues: (r['issues'] ?? []) as never,
        trials: (r['trials'] ?? []) as never,
        batches: (r['batches'] ?? []) as never,
        versions: (r['recipe_versions'] ?? []) as never,
      } as RecipeBundle);

      // This is now the active recipe — mirror it so the page and Cook Mode
      // keep working if the network drops a minute from now.
      void mirror.writeRecipe(recipe);
      return recipe;
    },

    async saveRecipe(recipe: Recipe): Promise<Recipe> {
      requireOnline('המתכון');
      if (!recipe.name || !String(recipe.name).trim()) {
        throw new WriteNotAllowedError('למתכון חייב להיות שם.');
      }

      const parent = recipeToRow(recipe, userId);
      const isNew = !recipe.id || recipe.id.startsWith('new-');

      let recipeId: string;
      if (isNew) {
        const { data, error } = await client
          .from('recipes')
          .insert(parent)
          .select('id')
          .single();
        if (error) throw new SupabaseRepositoryError('יצירת המתכון נכשלה', error);
        recipeId = data.id;
      } else {
        recipeId = recipe.id;
        const { error } = await client
          .from('recipes')
          .update(parent)
          .eq('id', recipeId)
          .eq('owner_id', userId);
        if (error) throw new SupabaseRepositoryError('עדכון המתכון נכשל', error);
      }

      // Children are replaced wholesale. The ingredient and step lists are
      // ordered and short, so diffing them would add risk without adding speed.
      await replaceChildren(client, recipeId, recipe);

      const saved = await this.getRecipe(recipeId);
      if (!saved) throw new SupabaseRepositoryError('שמירה', 'המתכון לא נמצא אחרי השמירה');
      return saved;
    },

    async deleteRecipe(id: string): Promise<void> {
      requireOnline('המתכון');

      // The `owner_id` filter is belt-and-braces — RLS already limits this to
      // the signed-in account — but it also turns "somebody else's id" into a
      // no-op rather than an error, which is the right shape for a delete.
      const { error } = await client
        .from('recipes')
        .delete()
        .eq('id', id)
        .eq('owner_id', userId);
      if (error) throw new SupabaseRepositoryError('מחיקת המתכון נכשלה', error);

      // Drop the local copy too. Leaving it would make a deleted recipe
      // reappear the next time the network drops and the mirror answers.
      await mirror.forgetRecipe(id);
      const index = await mirror.readRecipeIndex();
      void mirror.writeRecipeIndex(index.filter((r) => r.id !== id));
    },

    // ── preferences (§1.2) ─────────────────────────────────────────────────

    async getPrefs(): Promise<MeasurementPrefs | null> {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        // Preferences drive every conversion, so a stale local copy beats none
        const cached = await mirror.readPrefs();
        if (cached) {
          servingFromCache = true;
          return cached;
        }
        throw new SupabaseRepositoryError('טעינת ההעדפות נכשלה', error);
      }
      if (!data) return null;

      const calibrations = await this.listCalibrations();
      const prefs = profileRowToPrefs(data, calibrations);
      void mirror.writePrefs(prefs);
      return prefs;
    },

    async savePrefs(prefs: MeasurementPrefs): Promise<MeasurementPrefs> {
      // Mirror first: the preferences are the one thing that must survive a
      // dropped connection, because without them nothing converts.
      void mirror.writePrefs(prefs);
      requireOnline('ההעדפות');

      const { error } = await client
        .from('profiles')
        .update(prefsToProfileUpdate(prefs))
        .eq('user_id', userId);
      if (error) throw new SupabaseRepositoryError('שמירת ההעדפות נכשלה', error);
      return prefs;
    },

    // ── calibrations (§1.2, engine B4/B5) ──────────────────────────────────

    async listCalibrations(): Promise<Calibration[]> {
      const { data, error } = await client
        .from('calibrations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        const cached = await mirror.readCalibrations();
        if (cached.length) {
          servingFromCache = true;
          return normalizeCalibrations(cached);
        }
        throw new SupabaseRepositoryError('טעינת הכיולים נכשלה', error);
      }
      const list = (data ?? []).map(calibrationRowToDomain);
      void mirror.writeCalibrations(list);
      return list;
    },

    async saveCalibrations(list: readonly Calibration[]): Promise<Calibration[]> {
      const normalized = normalizeCalibrations(list);
      void mirror.writeCalibrations(normalized);
      requireOnline('הכיול');

      // Replace the set. One calibration per (ingredient, tool) is the rule the
      // unique index enforces anyway.
      const { error: delError } = await client
        .from('calibrations')
        .delete()
        .eq('user_id', userId);
      if (delError) throw new SupabaseRepositoryError('עדכון הכיולים נכשל', delError);

      if (normalized.length > 0) {
        const { error } = await client
          .from('calibrations')
          .insert(normalized.map((c) => calibrationToInsert(c, userId)));
        if (error) throw new SupabaseRepositoryError('שמירת הכיולים נכשלה', error);
      }
      return normalized;
    },
  };
}

/** Replaces a recipe's ordered child rows. */
async function replaceChildren(
  client: TypedSupabaseClient,
  recipeId: string,
  recipe: Recipe,
): Promise<void> {
  const ingredients = ingredientsToRows(recipe, recipeId);
  const steps = stepsToRows(recipe, recipeId);
  const issues = issuesToRows(recipe, recipeId);

  for (const table of ['ingredients', 'steps', 'issues'] as const) {
    const { error } = await client.from(table).delete().eq('recipe_id', recipeId);
    if (error) throw new SupabaseRepositoryError(`ניקוי ${table} נכשל`, error);
  }

  if (ingredients.length) {
    const { error } = await client.from('ingredients').insert(ingredients);
    if (error) throw new SupabaseRepositoryError('שמירת הרכיבים נכשלה', error);
  }
  if (steps.length) {
    const { error } = await client.from('steps').insert(steps);
    if (error) throw new SupabaseRepositoryError('שמירת השלבים נכשלה', error);
  }
  if (issues.length) {
    const { error } = await client.from('issues').insert(issues);
    if (error) throw new SupabaseRepositoryError('שמירת התקלות נכשלה', error);
  }
}
