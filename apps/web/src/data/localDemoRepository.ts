// The repository for a checkout with no Supabase project configured.
//
// Supabase is connected, and a signed-in session is served by
// supabaseRepository.ts. This one still has a job: a clone with no .env.local
// has to run, and it runs on the prototype's five demo recipes.
//
// It mirrors what it serves into IndexedDB and REFUSES to write, because there
// is nowhere honest to write to. A refused write surfaces as
// `WriteNotAllowedError`, which the UI shows as a plain explanation. It is never
// swallowed and never faked.
//
// The demo recipes are never presented as an account's own notebook — the shell
// banner labels them, and a signed-in account never sees them at all. That is
// the distinction stage-3 requirement 6 asks for.
//
// That refusal is deliberate. The prototype's two worst UI defects (B8) were
// messages claiming a file had been written and a share had been sent when
// nothing had happened. This layer makes that shape of bug impossible.

import type { Calibration, MeasurementPrefs, Recipe } from '@recipe-notebook/engine';
import type { CatalogItem } from '../features/pricing/catalog.js';
import { defaultPrefs, normalizeCalibrations } from '@recipe-notebook/engine';
import { DEMO_CATEGORIES, DEMO_RECIPES } from './demoRecipes.js';
import * as mirror from './offlineMirror.js';
import {
  WriteNotAllowedError,
  type Repository,
  type RepositoryCapabilities,
} from './repository.js';

const NO_BACKEND_REASON =
  'אין חיבור לשרת בהתקנה הזאת, ולכן שינויים אינם נשמרים מחוץ למכשיר הזה. ' +
  'התחברות לחשבון תאפשר שמירה.';

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

/** Index rows for the notebook list, kept in the shape the mirror stores. */
function toIndexRow(r: Recipe): mirror.RecipeIndexRow {
  return {
    id: r.id,
    name: r.name ?? '',
    category: r.category ?? 'אחר',
    isSub: r.isSub === true,
    locked: r.locked === true,
    tags: [...(r.tags ?? [])],
  };
}

export function createLocalDemoRepository(): Repository {
  let servingFromCache = false;

  return {
    capabilities(): RepositoryCapabilities {
      return {
        source: 'local-demo',
        online: isOnline(),
        canWrite: false,
        servingFromCache,
      };
    },

    async listCategories() {
      return DEMO_CATEGORIES;
    },

    async listRecipes() {
      servingFromCache = false;
      const recipes = DEMO_RECIPES.map((r) => ({ ...r }));
      void mirror.writeRecipeIndex(recipes.map(toIndexRow));
      return recipes;
    },

    async getRecipe(id) {
      const found = DEMO_RECIPES.find((r) => r.id === id);
      if (found) {
        servingFromCache = false;
        const recipe = { ...found };
        // mirror it: this is now the active recipe, and Cook Mode may need it
        // with no network a minute from now
        void mirror.writeRecipe(recipe);
        return recipe;
      }
      // not in the demo set — the mirror is the only place left to look
      const cached = await mirror.readRecipe(id);
      servingFromCache = cached !== null;
      return cached;
    },

    async saveRecipe(): Promise<Recipe> {
      throw new WriteNotAllowedError(NO_BACKEND_REASON);
    },

    async deleteRecipe(): Promise<void> {
      // Refused rather than faked. Silently "deleting" a demo recipe from the
      // screen and having it reappear on reload is the shape of lie this
      // repository exists to prevent (B8).
      throw new WriteNotAllowedError(NO_BACKEND_REASON);
    },

    async listVersions() {
      // Not "no versions yet" — there is no history at all without a server,
      // and the empty list is the truthful answer rather than a placeholder.
      return [];
    },

    async restoreVersion(): Promise<Recipe> {
      throw new WriteNotAllowedError(NO_BACKEND_REASON);
    },

    async recipesUsing(recipeId: string) {
      // This used to return [] with a comment saying the demo set has no
      // sub-recipe links. It does: the chocolate brioche uses the ganache. So
      // the demo notebook was reporting "nothing depends on this" about a
      // recipe that something depends on — which since stage 6 is not a missing
      // warning but a wrong answer to "why can't I delete this?".
      const all = await this.listRecipes();
      return all
        .filter(
          (r) =>
            r.id !== recipeId &&
            (r.ingredients ?? []).some((i) => i.subId === recipeId),
        )
        .map((r) => ({ id: r.id, name: String(r.name ?? '') }));
    },

    // ── the ingredient centre (stage 7) ────────────────────────────────────
    // Empty, and honestly so: the centre holds business data — prices,
    // suppliers — which belongs to an account. There is no account here, so
    // there is nothing to show. Demo prices would be an invented cost basis.
    async listCatalog(): Promise<CatalogItem[]> {
      return [];
    },

    async saveCatalogItem(): Promise<CatalogItem> {
      throw new WriteNotAllowedError(NO_BACKEND_REASON);
    },

    async deleteCatalogItem(): Promise<void> {
      throw new WriteNotAllowedError(NO_BACKEND_REASON);
    },

    async recipesPricingOn() {
      return [];
    },

    async getPrefs() {
      // Preferences are the one thing that is genuinely local-first: they belong
      // to the device's measuring cups until an account exists to own them.
      return mirror.readPrefs();
    },

    async savePrefs(prefs: MeasurementPrefs) {
      const stored = await mirror.writePrefs(prefs);
      if (!stored) {
        throw new WriteNotAllowedError(
          'לא ניתן לשמור העדפות על המכשיר הזה. ייתכן שחסימת נתוני אתר מונעת זאת.',
        );
      }
      return prefs;
    },

    async listCalibrations() {
      return normalizeCalibrations(await mirror.readCalibrations());
    },

    async saveCalibrations(list: readonly Calibration[]) {
      const normalized = normalizeCalibrations(list);
      const stored = await mirror.writeCalibrations(normalized);
      if (!stored) {
        throw new WriteNotAllowedError(
          'לא ניתן לשמור את הכיול על המכשיר הזה. ייתכן שחסימת נתוני אתר מונעת זאת.',
        );
      }
      return normalized;
    },
  };
}

/** Preferences for a brand-new visitor, before onboarding runs (§4). */
export const firstRunPrefs = (): MeasurementPrefs => defaultPrefs('pro');
