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
// Recipes are stored across six tables, so a save has to write a parent row,
// replace three sets of child rows, and — since stage 5 — snapshot the previous
// state into recipe_versions first. PostgREST has no multi-statement
// transaction, so as separate client calls that is five ways to end up with a
// half-written recipe or a version describing a change that never landed.
//
// So a save is ONE call to the `save_recipe` RPC (migration 0007), which does
// all of it in a single transaction. Reads stay as ordinary selects.

import type { Calibration, MeasurementPrefs, Recipe } from '@recipe-notebook/engine';
import { normalizeCalibrations } from '@recipe-notebook/engine';
import type { TypedSupabaseClient } from '../lib/supabase.js';
import type { Json, RecipeVersionRow } from '../lib/database.types.js';
import {
  RecipeInUseError,
  WriteNotAllowedError,
  type Repository,
  type RepositoryCapabilities,
  type SaveOptions,
  type StoredVersion,
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
  snapshotToRecipe,
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

/**
 * Is this the refusal from migration 0008's guard?
 *
 * The code is checked, not the message. `delete_recipe` raises with
 * `errcode = 'foreign_key_violation'` and its own Hebrew text, while the bare
 * constraint raises Postgres's own English text — and the message is the part
 * that changes with a Postgres version or a locale. The code is the contract.
 *
 * PostgREST puts the SQLSTATE in `code`, and a `PostgrestError` is a plain
 * object rather than an Error subclass, so this reads defensively: a shape that
 * is not what we expect must fall through to the generic failure rather than be
 * mistaken for "in use".
 */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code) === '23503'
  );
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

    async saveRecipe(recipe: Recipe, options: SaveOptions = {}): Promise<Recipe> {
      requireOnline('המתכון');
      if (!recipe.name || !String(recipe.name).trim()) {
        throw new WriteNotAllowedError('למתכון חייב להיות שם.');
      }

      const isNew = !recipe.id || recipe.id.startsWith('new-');
      const parent = recipeToRow(recipe, userId);

      const { data, error } = await client.rpc('save_recipe', {
        p_recipe: parent as unknown as Json,
        p_ingredients: ingredientsToRows(recipe, '') as unknown as Json,
        p_steps: stepsToRows(recipe, '') as unknown as Json,
        p_issues: issuesToRows(recipe, '') as unknown as Json,
        p_recipe_id: isNew ? null : recipe.id,
        // Optimistic concurrency: the value this client loaded. The RPC refuses
        // the save if the row has moved on, rather than overwriting whatever
        // somebody else just wrote.
        p_expected_updated_at: isNew ? null : (options.expectedUpdatedAt ?? null),
        p_version_note: options.versionNote ?? '',
      });

      if (error) {
        throw new SupabaseRepositoryError(
          isNew ? 'יצירת המתכון נכשלה' : 'עדכון המתכון נכשל',
          error,
        );
      }

      const recipeId = data as unknown as string;
      const saved = await this.getRecipe(recipeId);
      if (!saved) throw new SupabaseRepositoryError('שמירה', 'המתכון לא נמצא אחרי השמירה');
      return saved;
    },

    // ── versions (§9) ──────────────────────────────────────────────────────

    async listVersions(recipeId: string): Promise<StoredVersion[]> {
      const { data, error } = await client
        .from('recipe_versions')
        .select('id, recipe_id, tag, what, snapshot, created_at, created_by')
        .eq('recipe_id', recipeId)
        .order('created_at', { ascending: false });

      if (error) throw new SupabaseRepositoryError('טעינת היסטוריית הגרסאות נכשלה', error);

      return (data ?? []).map((row) => {
        const r = row as unknown as RecipeVersionRow;
        return {
          id: r.id,
          recipeId: r.recipe_id,
          tag: r.tag,
          what: r.what,
          createdAt: r.created_at,
          // ONE mapper reads both a live row set and a stored snapshot, because
          // the RPC writes the snapshot in exactly the RecipeBundle shape. A
          // restored version therefore cannot be interpreted differently from
          // a live one.
          snapshot: snapshotToRecipe(r.snapshot, r.recipe_id),
        };
      });
    },

    async restoreVersion(versionId: string): Promise<Recipe> {
      requireOnline('השחזור');

      const { data, error } = await client.rpc('restore_recipe_version', {
        p_version_id: versionId,
      });
      if (error) throw new SupabaseRepositoryError('השחזור נכשל', error);

      const recipeId = data as unknown as string;
      const restored = await this.getRecipe(recipeId);
      if (!restored) {
        throw new SupabaseRepositoryError('שחזור', 'המתכון לא נמצא אחרי השחזור');
      }
      return restored;
    },

    async recipesUsing(recipeId: string): Promise<Array<{ id: string; name: string }>> {
      const { data, error } = await client.rpc('recipes_using', {
        p_recipe_id: recipeId,
      });
      // A failure here must not decide anything. Since stage 6 the DELETE is
      // refused by the database whatever this returns; this only supplies the
      // names for the message.
      if (error) return [];
      return (data ?? []) as Array<{ id: string; name: string }>;
    },

    async deleteRecipe(id: string): Promise<void> {
      requireOnline('המתכון');

      // `delete_recipe` rather than a plain DELETE. The guarantee is the
      // foreign key from migration 0008, which no client can get around — but
      // that constraint is DEFERRED (so that deleting an account still
      // cascades), which means a raw DELETE is refused at COMMIT rather than at
      // the statement. The function runs the check inside the call, so the
      // refusal arrives as an ordinary error with a code to branch on.
      //
      // RLS still applies inside it: another account's id matches no row and
      // the call is a silent no-op, which is the right shape for a delete and
      // also refuses to confirm that the id exists.
      const { error } = await client.rpc('delete_recipe', { p_recipe_id: id });

      if (error) {
        // 23503 is the one refusal that has a meaning worth translating: the
        // recipe is in use as somebody's base. Anything else is a real failure.
        if (isForeignKeyViolation(error)) {
          // Asked only now, and only to name them. An empty list is possible
          // (a dependency added between the two calls) and `RecipeInUseError`
          // handles that rather than pretending the delete succeeded.
          throw new RecipeInUseError(await this.recipesUsing(id));
        }
        throw new SupabaseRepositoryError('מחיקת המתכון נכשלה', error);
      }

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

/*
 * `replaceChildren` used to live here, doing three DELETEs and three INSERTs as
 * separate client calls. It is now `public.replace_recipe_children` in
 * migration 0007, called from inside the save and restore RPCs — the same six
 * statements, in one transaction instead of six.
 */
