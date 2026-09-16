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
   * Rejects with `WriteNotAllowedError` when the repository cannot write.
   */
  deleteRecipe(id: string): Promise<void>;
  /**
   * Persists a recipe. Rejects with `WriteNotAllowedError` when the repository
   * cannot write — callers must surface that, never pretend it worked.
   * (§17 / AC #17: no screen may present a mock action as if it reached a server.)
   */
  saveRecipe(recipe: Recipe): Promise<Recipe>;
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
