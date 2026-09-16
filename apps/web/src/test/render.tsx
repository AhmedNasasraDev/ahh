import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppDataProvider } from '../app/AppDataProvider.js';
import type { Repository, RepositoryCapabilities } from '../data/repository.js';
import { DEMO_CATEGORIES, DEMO_RECIPES } from '../data/demoRecipes.js';
import type { StoredVersion } from '../data/repository.js';
import { defaultPrefs, type Calibration, type MeasurementPrefs, type Recipe } from '@recipe-notebook/engine';

export interface FakeRepoOptions {
  prefs?: MeasurementPrefs | null;
  recipes?: readonly Recipe[];
  calibrations?: readonly Calibration[];
  canWrite?: boolean;
  onSavePrefs?(p: MeasurementPrefs): void;
  onSaveRecipe?(r: Recipe): void;
  onDeleteRecipe?(id: string): void;
  onSaveCalibrations?(list: readonly Calibration[]): void;
  versions?: readonly StoredVersion[];
  onRestoreVersion?(versionId: string): void;
  usedBy?: readonly { id: string; name: string }[];
}

/** An in-memory repository, so a screen test never touches IndexedDB. */
export function fakeRepository(opts: FakeRepoOptions = {}): Repository {
  let prefs = opts.prefs === undefined ? { ...defaultPrefs('pro'), done: true } : opts.prefs;
  let calib = [...(opts.calibrations ?? [])];
  let recipes = [...(opts.recipes ?? DEMO_RECIPES)];
  const caps: RepositoryCapabilities = {
    source: 'local-demo',
    online: true,
    canWrite: opts.canWrite ?? false,
    servingFromCache: false,
  };
  return {
    capabilities: () => caps,
    listCategories: async () => DEMO_CATEGORIES,
    listRecipes: async () => [...recipes],
    getRecipe: async (id) => recipes.find((r) => r.id === id) ?? null,
    saveRecipe: async (r) => {
      // Assigns an id the way a database would, so a test can tell a create
      // from an update.
      const saved = !r.id || r.id.startsWith('new-') ? { ...r, id: `saved-${recipes.length + 1}` } : r;
      recipes = [...recipes.filter((x) => x.id !== saved.id), saved];
      opts.onSaveRecipe?.(saved);
      return saved;
    },
    deleteRecipe: async (id) => {
      recipes = recipes.filter((r) => r.id !== id);
      opts.onDeleteRecipe?.(id);
    },
    listVersions: async (recipeId) =>
      (opts.versions ?? []).filter((v) => v.recipeId === recipeId),
    restoreVersion: async (versionId) => {
      const v = (opts.versions ?? []).find((x) => x.id === versionId);
      if (!v) throw new Error('הגרסה לא נמצאה');
      // Mirrors what the RPC does: the snapshot becomes the live recipe.
      const restored = { ...v.snapshot, id: v.recipeId };
      recipes = recipes.map((r) => (r.id === v.recipeId ? restored : r));
      opts.onRestoreVersion?.(versionId);
      return restored;
    },
    recipesUsing: async () => [...(opts.usedBy ?? [])],
    getPrefs: async () => prefs,
    savePrefs: async (p) => {
      prefs = p;
      opts.onSavePrefs?.(p);
      return p;
    },
    listCalibrations: async () => calib,
    saveCalibrations: async (list) => {
      calib = [...list];
      opts.onSaveCalibrations?.(calib);
      return calib;
    },
  };
}

/** Renders a single route with the providers the app supplies in production. */
export function renderRoute(
  ui: ReactElement,
  { path = '/', route = '/', repository = fakeRepository() } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppDataProvider repository={repository}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </AppDataProvider>
    </MemoryRouter>,
  );
}
