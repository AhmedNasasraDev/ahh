// The data seam.
//
// Everything above this file talks to these interfaces and never to Supabase or
// to IndexedDB directly. That is what made connecting Supabase in stage 3 a
// change in one directory rather than a change in every screen: not one route
// component was touched to accommodate it.
//
// Offline model — approved for this project:
//   Supabase is the source of truth. The active recipe, the measurement
//   preferences and Cook Mode progress are mirrored into IndexedDB so they stay
//   READABLE with no network. Writes require a connection.
//
// `capabilities` lets a screen say the honest thing instead of failing silently:
// a save button knows whether saving is possible right now.

import type { Calibration, MeasurementPrefs, Recipe } from '@recipe-notebook/engine';

/** Extra instructions for a save. All optional; a plain save still works. */
export interface SaveOptions {
  /**
   * The `updated_at` this client loaded, for optimistic concurrency. When it
   * no longer matches the stored row the save is REFUSED — somebody else saved
   * in between, and silently overwriting their work is worse than an error.
   * Omit to skip the check.
   */
  expectedUpdatedAt?: string | null;
  /** §9 versionDiff — the description stored with the snapshot of the previous state. */
  versionNote?: string;
}

/** A stored version of a recipe (§9). */
export interface StoredVersion {
  id: string;
  recipeId: string;
  /** V1, V2, ... assigned by the database */
  tag: string;
  /** what changed, per §9's versionDiff */
  what: string;
  createdAt: string;
  /**
   * The recipe as it was. Reconstructed by the SAME mapper that reads live
   * rows, so a version cannot be interpreted differently from the present.
   */
  snapshot: Recipe;
}

export type DataSourceKind = 'local-demo' | 'supabase';

export interface RepositoryCapabilities {
  /** which backend is actually serving this session */
  source: DataSourceKind;
  /** false when the browser reports no network */
  online: boolean;
  /**
   * whether a write can succeed right now. False for the demo repository, which
   * has nowhere to write, and false offline — writes are refused, not queued.
   */
  canWrite: boolean;
  /** true when the data on screen came from the offline mirror */
  servingFromCache: boolean;
}

export interface RecipeRepository {
  listRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | null>;
  /**
   * Removes a recipe and everything hanging off it.
   *
   * The child tables are ON DELETE CASCADE, so one statement takes the
   * ingredients, steps, issues, trials, batches, versions and private note with
   * it. That is deliberate: a recipe whose ingredients had been orphaned would
   * still compute, and would compute wrongly.
   *
   * A recipe that is IN USE as somebody's sub-recipe is refused — by the
   * database, in migration 0008, not here. Rejects with `RecipeInUseError`,
   * which carries the dependents the caller is allowed to see so the screen can
   * name them.
   *
   * Rejects with `WriteNotAllowedError` when the repository cannot write.
   */
  deleteRecipe(id: string): Promise<void>;
  /**
   * Persists a recipe. Rejects with `WriteNotAllowedError` when the repository
   * cannot write — callers must surface that, never pretend it worked.
   * (§17 / AC #17: no screen may present a mock action as if it reached a server.)
   *
   * For an existing recipe this ALSO snapshots the previous state into the
   * version history, atomically (§9). There is no way to save without
   * versioning, on purpose: an optional snapshot is a snapshot somebody
   * eventually forgets to take.
   */
  saveRecipe(recipe: Recipe, options?: SaveOptions): Promise<Recipe>;

  /** The version history, newest first (§9). */
  listVersions(recipeId: string): Promise<StoredVersion[]>;

  /**
   * Restores a version.
   *
   * §9: a restore does not delete. It pushes the CURRENT state into history
   * first and then applies the snapshot, so a mistaken restore is itself
   * undoable. Atomic — both writes happen or neither.
   *
   * Refused for a `locked` recipe until it is unlocked.
   */
  restoreVersion(versionId: string): Promise<Recipe>;

  /**
   * Which of the caller's own recipes use this one as a sub-recipe.
   *
   * Since stage 6 this is not a warning but the reason a delete is refused:
   * `ingredients.sub_recipe_id` is NO ACTION (migration 0008), so a base recipe
   * in use cannot be deleted at all. The screen uses this to say WHICH recipes
   * are holding it, which a foreign-key violation cannot tell anyone.
   *
   * It is RLS-filtered at source, so it can only ever return recipes the caller
   * may see — which is what keeps the refusal from saying anything about
   * another account (stage-6 requirement 6).
   */
  recipesUsing(recipeId: string): Promise<Array<{ id: string; name: string }>>;
}

export interface PrefsRepository {
  getPrefs(): Promise<MeasurementPrefs | null>;
  savePrefs(prefs: MeasurementPrefs): Promise<MeasurementPrefs>;
}

export interface CalibrationRepository {
  listCalibrations(): Promise<Calibration[]>;
  saveCalibrations(list: readonly Calibration[]): Promise<Calibration[]>;
}

export interface Repository
  extends RecipeRepository,
    PrefsRepository,
    CalibrationRepository {
  capabilities(): RepositoryCapabilities;
  /** categories available for the picker (§1.1 `category` comes from CATEGORIES) */
  listCategories(): Promise<readonly string[]>;
}

export class WriteNotAllowedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'WriteNotAllowedError';
  }
}

/**
 * A recipe could not be deleted because other recipes use it as a base
 * (stage-6 requirements 1-3).
 *
 * `usedBy` is what the screen needs and the database cannot provide: a foreign
 * key violation says a constraint was violated, not which recipes are holding
 * the thing. The list comes from `recipesUsing`, which is RLS-filtered, so it
 * is everything the caller is allowed to know and nothing more. It can be
 * EMPTY — a dependency may have been added by another tab between the check and
 * the delete — and the message has to survive that case rather than rendering
 * an empty list as though nothing were wrong.
 */
export class RecipeInUseError extends Error {
  constructor(
    readonly usedBy: ReadonlyArray<{ id: string; name: string }>,
    message = 'המתכון הזה משמש כמתכון בסיס, ולכן אי אפשר למחוק אותו.',
  ) {
    super(message);
    this.name = 'RecipeInUseError';
  }
}
