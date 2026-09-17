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
import type { CatalogItem } from '../features/pricing/catalog.js';
import type {
  PurchaseInput,
  PurchaseRecord,
} from '../features/pricing/purchases.js';
import type { ProductionPlan } from '../features/planning/plan.js';

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

/**
 * The ingredient centre (stage 7).
 *
 * The catalog is the single source of truth for a material's price. A recipe
 * row that has no price of its own resolves one from here at read time, so
 * changing a price here moves every recipe that inherits it — see
 * `features/pricing/catalog.ts` for how that coexists with frozen version
 * snapshots.
 */
export interface CatalogRepository {
  listCatalog(): Promise<CatalogItem[]>;
  /**
   * Creates or updates one material, keyed by `key` within the account.
   *
   * `price` and `priceUnit` on the item are IGNORED: they are generated
   * columns in the database, derived from the package. Sending them would be
   * rejected, and accepting them here would invite a caller to think it could
   * set a price directly.
   */
  saveCatalogItem(item: CatalogItem): Promise<CatalogItem>;
  deleteCatalogItem(key: string): Promise<void>;
  /**
   * Which of the caller's recipes would move if this material's price changed
   * (stage-7 requirement 5).
   *
   * `rows` counts the lines that INHERIT the central price. `overridden`
   * counts the lines in the same recipe that carry their own price and would
   * therefore not move — saying a recipe is affected when every line overrides
   * would be wrong.
   */
  recipesPricingOn(key: string): Promise<
    Array<{ id: string; name: string; rows: number; overridden: number }>
  >;
  /**
   * Records a purchase (stage-8 requirements A, C).
   *
   * ONE call, because the append to the history and the update of the active
   * price must both happen or neither: a history that disagrees with the price
   * in effect is worse than no history. `record_purchase` (migration 0013)
   * does both in one transaction.
   *
   * Returns the material as it now stands, so the caller shows the price the
   * DATABASE derived and never one it computed itself.
   */
  recordPurchase(input: PurchaseInput): Promise<CatalogItem>;
  /**
   * The purchases of one material, newest first, each with the change from the
   * one before it (requirement C).
   */
  purchaseHistory(key: string): Promise<PurchaseRecord[]>;
}

/**
 * Production plans (stage 9).
 *
 * A plan holds INTENT only. The requirement, the purchase list, the cost and
 * the timeline are all DERIVED from the recipes and the ingredient centre when
 * the plan is opened — there is no stored copy of any of them, so a plan cannot
 * quietly disagree with today's prices. The single exception is a plan the user
 * marks as done: `setPlanLocked` freezes a snapshot, and a locked plan reads
 * from it. See migration 0018 for why unlocking discards it.
 */
export interface PlanRepository {
  listPlans(): Promise<PlanSummary[]>;
  getPlan(id: string): Promise<ProductionPlan | null>;
  /** Creates or updates, atomically. Returns the plan as it now stands */
  savePlan(plan: ProductionPlan): Promise<ProductionPlan>;
  deletePlan(id: string): Promise<void>;
  /**
   * Marks a plan done, or reopens it.
   *
   * Locking REQUIRES a snapshot: a record of what happened whose costs still
   * move is not a record. Unlocking clears it.
   */
  setPlanLocked(id: string, locked: boolean, snapshot: unknown): Promise<void>;
}

export interface PlanSummary {
  id: string;
  name: string;
  planDate: string;
  locked: boolean;
  items: number;
}

export interface PrefsRepository {
  getPrefs(): Promise<MeasurementPrefs | null>;
  savePrefs(prefs: MeasurementPrefs): Promise<MeasurementPrefs>;
}

/**
 * §8 — personal notes. Separate from `Recipe.notes` in every sense: a private
 * note belongs to the ACCOUNT rather than to the recipe, it never travels with
 * a shared copy, an order sheet or a label, and HANDOFF §3 says no policy, view
 * or report may let anyone else read it — an instructor included.
 *
 * `null` from `getPrivateNote` means there is no note. The empty string is not
 * a note either: saving one removes the row (migration 0022), because for text
 * "empty" and "absent" are the same statement.
 */
export interface PrivateNoteRepository {
  getPrivateNote(recipeId: string): Promise<string | null>;
  savePrivateNote(recipeId: string, body: string): Promise<void>;
}

export interface CalibrationRepository {
  listCalibrations(): Promise<Calibration[]>;
  saveCalibrations(list: readonly Calibration[]): Promise<Calibration[]>;
}

export interface Repository
  extends RecipeRepository,
    PlanRepository,
    PrefsRepository,
    CalibrationRepository,
    PrivateNoteRepository,
    CatalogRepository {
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
