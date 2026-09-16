// The single place the rest of the app gets its data from.
//
// Holds the repository, the measurement preferences and the recipe list. Nothing
// below this provider knows whether the data came from Supabase, from the demo
// set or from the offline mirror — that is the point of data/repository.ts.
//
// Still plain React context and no server-state library. The app fetches three
// things once per session — preferences, calibrations and the recipe list — and
// re-reads a recipe on save. There is no background refetch and no cross-screen
// cache to invalidate, so TanStack Query would be structure without a job. It
// slots in behind this provider if and when there is one.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Calibration, MeasurementPrefs, Recipe } from '@recipe-notebook/engine';
import { normalizeCalibrations } from '@recipe-notebook/engine';
import { createLocalDemoRepository, firstRunPrefs } from '../data/localDemoRepository.js';
import { createSupabaseRepository } from '../data/supabaseRepository.js';
import {
  WriteNotAllowedError,
  type Repository,
  type RepositoryCapabilities,
} from '../data/repository.js';
import { supabaseStatus } from '../lib/supabase.js';
import { useOptionalAuth } from '../auth/AuthProvider.js';

export interface AppData {
  ready: boolean;
  /** null only before the first load resolves */
  prefs: MeasurementPrefs;
  recipes: readonly Recipe[];
  categories: readonly string[];
  capabilities: RepositoryCapabilities;
  /** a human-readable note about where the data is coming from */
  backendNote: string;
  error: string | null;
  setPrefs(patch: Partial<MeasurementPrefs>): Promise<void>;
  setCalibrations(list: readonly Calibration[]): Promise<void>;
  getRecipe(id: string): Recipe | null;
  clearError(): void;
}

const AppDataContext = createContext<AppData | null>(null);

function describeBackend(caps: RepositoryCapabilities): string {
  if (caps.source === 'supabase') {
    if (caps.servingFromCache) {
      return 'מוצג מהעתק שנשמר על המכשיר. אין כרגע חיבור לשרת, ולכן אי אפשר לשמור שינויים.';
    }
    return caps.online
      ? 'מחובר לחשבון שלכם.'
      : 'אין כרגע חיבור לאינטרנט. אפשר לקרוא, אבל לא לשמור.';
  }

  const s = supabaseStatus();
  if (!s.configured && s.reason === 'service-role-key-in-browser') {
    return 'המפתח שהוגדר הוא service_role ולכן לא נעשה בו שימוש. בדפדפן מותר רק מפתח anon או publishable.';
  }
  return 'אין חיבור לשרת בהתקנה הזאת. מוצגים מתכוני הדמו לקריאה בלבד, וההעדפות נשמרות על המכשיר הזה בלבד.';
}

export function AppDataProvider({
  children,
  repository,
}: {
  children: ReactNode;
  /** injected in tests */
  repository?: Repository;
}) {
  const auth = useOptionalAuth();
  const userId = auth?.user?.id ?? null;
  const client = auth?.client ?? null;

  /**
   * Which repository is in force.
   *
   * This is the whole point of the seam in data/repository.ts: the decision is
   * three lines here, and not one screen below this provider knows or cares.
   *
   * A signed-in user gets Supabase. Everyone else — no project configured, or
   * configured but signed out — gets the read-only demo repository, which
   * refuses writes rather than faking them.
   */
  const repo = useMemo(() => {
    if (repository) return repository;
    if (client && userId) return createSupabaseRepository({ client, userId });
    return createLocalDemoRepository();
  }, [repository, client, userId]);

  const [ready, setReady] = useState(false);
  const [prefs, setPrefsState] = useState<MeasurementPrefs>(firstRunPrefs);
  const [recipes, setRecipes] = useState<readonly Recipe[]>([]);
  const [categories, setCategories] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<RepositoryCapabilities>(() => repo.capabilities());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [stored, calib, list, cats] = await Promise.all([
          repo.getPrefs(),
          repo.listCalibrations(),
          repo.listRecipes(),
          repo.listCategories(),
        ]);
        if (cancelled) return;
        // §1.2: prefs own the calibration list, so they are merged into one object
        // the engine can consume directly.
        setPrefsState({ ...(stored ?? firstRunPrefs()), calib: normalizeCalibrations(calib) });
        setRecipes(list);
        setCategories(cats);
        setCaps(repo.capabilities());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'טעינת הנתונים נכשלה');
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  // The offline half of the hybrid model needs to know when the network drops,
  // so a screen can say "מוצג מהמכשיר" instead of silently showing stale data.
  useEffect(() => {
    const sync = () => setCaps(repo.capabilities());
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, [repo]);

  const setPrefs = useCallback(
    async (patch: Partial<MeasurementPrefs>) => {
      const next = { ...prefs, ...patch };
      // optimistic: preferences drive every conversion on screen, so a 200ms
      // round trip would make the whole page feel laggy
      setPrefsState(next);
      try {
        await repo.savePrefs(next);
        setError(null);
      } catch (e) {
        setError(
          e instanceof WriteNotAllowedError
            ? e.reason
            : e instanceof Error
              ? e.message
              : 'שמירת ההעדפות נכשלה',
        );
      }
    },
    [prefs, repo],
  );

  const setCalibrations = useCallback(
    async (list: readonly Calibration[]) => {
      const normalized = normalizeCalibrations(list);
      setPrefsState((p) => ({ ...p, calib: normalized }));
      try {
        await repo.saveCalibrations(normalized);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שמירת הכיול נכשלה');
      }
    },
    [repo],
  );

  const getRecipe = useCallback(
    (id: string) => recipes.find((r) => r.id === id) ?? null,
    [recipes],
  );

  const value = useMemo<AppData>(
    () => ({
      ready,
      prefs,
      recipes,
      categories,
      capabilities: caps,
      backendNote: describeBackend(caps),
      error,
      setPrefs,
      setCalibrations,
      getRecipe,
      clearError: () => setError(null),
    }),
    [ready, prefs, recipes, categories, caps, error, setPrefs, setCalibrations, getRecipe],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside <AppDataProvider>');
  return ctx;
}
