// §2 screen 2 — "בית": "המשך מאיפה שעצרת, קטגוריות, בסיסים".
//
// WHAT A HOME SCREEN IS ALLOWED TO BE HERE
//
// Every number on this screen is computed from the notebook that is already
// loaded, through the same engine and the same central prices as the recipe
// page. Nothing is stored for it, nothing is counted twice, and there is no
// new table behind it — a home screen that needed its own data would be a
// second source of truth about the notebook.
//
// "המשך מאיפה שעצרת" IS THE ONE THING THAT NEEDED A DECISION
//
// "Where you stopped" means the last recipe you OPENED, which nothing recorded.
// Two honest options: the last recipe SAVED (already in the data, but that is a
// different sentence), or the last one opened on this device. This takes the
// second and says so in those words — "הפתיחה האחרונה במכשיר הזה" — because it
// is per-device, not per-account: the mirror already holds Cook Mode progress
// the same way, and `clearMirror()` on sign-out takes both. The alternative,
// a `last_opened` column, would be an account-wide write on every recipe view.
//
// A notebook with a bake in progress gets that first instead: an unfinished
// Cook Mode session is more "where you stopped" than a page you looked at.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { compute, formatGrams, formatNis, type Recipe } from '@recipe-notebook/engine';
import { useAppData } from '../app/AppDataProvider.js';
import { resolveFromCatalog } from '../features/pricing/catalog.js';
import { readLastOpened, readCookProgress } from '../data/offlineMirror.js';
import styles from './HomeScreen.module.css';

interface Resume {
  recipe: Recipe;
  /** how far into a cooking session, when there is one */
  cooking: { done: number; total: number } | null;
}

export function HomeScreen() {
  const { recipes, categories, prefs, catalog, capabilities, ready } = useAppData();
  const [resume, setResume] = useState<Resume | null>(null);

  const pro = prefs.pro === true;

  // Priced once, and reused by both the base-recipe list and the resume card,
  // so a cost here is the same number the recipe page shows.
  const priced = useMemo(
    () => recipes.map((r) => resolveFromCatalog(r, catalog)),
    [recipes, catalog],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const id = await readLastOpened();
        const recipe = id ? (recipes.find((r) => r.id === id) ?? null) : null;
        if (!recipe) {
          if (!cancelled) setResume(null);
          return;
        }
        const progress = await readCookProgress(recipe.id);
        const total = (recipe.steps ?? []).filter((s) => s.text || s.minutes).length;
        const done = progress
          ? Object.values(progress.done).filter(Boolean).length
          : 0;
        if (!cancelled) {
          setResume({
            recipe,
            cooking: progress && done > 0 && done < total ? { done, total } : null,
          });
        }
      } catch {
        // Device storage can be blocked. The rest of the screen is unaffected.
        if (!cancelled) setResume(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipes]);

  /** How many recipes each category holds. Empty ones are not offered. */
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const r of recipes) {
      const c = r.category ?? 'אחר';
      out.set(c, (out.get(c) ?? 0) + 1);
    }
    return out;
  }, [recipes]);

  /**
   * §2: "מתכוני בסיס לפי עלות לק"ג". The sub-recipes, cheapest first, because
   * the reason to look at this list is to see what a filling actually costs.
   * A base recipe whose cost cannot be established has NO cost here — it is
   * not sorted to the top as if it were free.
   */
  const bases = useMemo(() => {
    const out = priced
      .filter((r) => r.isSub)
      .map((r) => {
        const c = compute(r, priced, { prefs });
        return {
          recipe: r,
          costPerKg: c.costPerKg > 0 ? c.costPerKg : null,
          yieldG: c.actualYield,
          partial: c.unresolved.length > 0,
        };
      });
    out.sort((a, b) => {
      if (a.costPerKg === null && b.costPerKg === null) return 0;
      if (a.costPerKg === null) return 1;
      if (b.costPerKg === null) return -1;
      return a.costPerKg - b.costPerKg;
    });
    return out;
  }, [priced, prefs]);

  if (!ready) return null;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h1 className={styles.title}>בית</h1>
        <p className={styles.count}>
          {recipes.length === 0
            ? 'המחברת ריקה'
            : recipes.length === 1
              ? 'מתכון אחד במחברת'
              : `${recipes.length} מתכונים במחברת`}
        </p>
      </header>

      {/* ── המשך מאיפה שעצרת ─────────────────────────────────────────────── */}
      {resume ? (
        <section className={styles.resume} aria-label="המשך מאיפה שעצרת">
          <h2 className={styles.sectionTitle}>
            {resume.cooking ? 'הכנה באמצע' : 'הפתיחה האחרונה במכשיר הזה'}
          </h2>
          <Link to={`/recipe/${resume.recipe.id}`} className={styles.resumeCard}>
            <span className={styles.resumeName}>{resume.recipe.name}</span>
            <span className={styles.resumeMeta}>
              {resume.cooking ? (
                <>
                  <span className="ltr">{resume.cooking.done}</span> מתוך{' '}
                  <span className="ltr">{resume.cooking.total}</span> שלבים הושלמו
                </>
              ) : (
                resume.recipe.category
              )}
            </span>
          </Link>
          {resume.cooking && (
            <Link to={`/recipe/${resume.recipe.id}/cook`} className={styles.resumeCook}>
              חזרה למצב הכנה
            </Link>
          )}
        </section>
      ) : (
        recipes.length > 0 && (
          <section className={styles.resume} aria-label="המשך מאיפה שעצרת">
            <h2 className={styles.sectionTitle}>המשך מאיפה שעצרת</h2>
            <p className={styles.note}>
              כאן יופיע המתכון האחרון שנפתח במכשיר הזה, וגם הכנה שנשארה באמצע.
            </p>
          </section>
        )
      )}

      {/* ── categories ──────────────────────────────────────────────────── */}
      <section className={styles.section} aria-label="קטגוריות">
        <h2 className={styles.sectionTitle}>קטגוריות</h2>
        {counts.size === 0 ? (
          <p className={styles.note}>
            {capabilities.canWrite
              ? 'אחרי שיישמר מתכון ראשון, הקטגוריות יופיעו כאן.'
              : 'אין מתכונים בהתקנה הזאת.'}
          </p>
        ) : (
          <div className={styles.tiles}>
            {categories
              .filter((c) => (counts.get(c) ?? 0) > 0)
              .map((c) => (
                <Link
                  key={c}
                  to={`/notebook?category=${encodeURIComponent(c)}`}
                  className={styles.tile}
                >
                  <span className={styles.tileName}>{c}</span>
                  <span className={styles.tileCount}>
                    <span className="ltr">{counts.get(c)}</span>{' '}
                    {counts.get(c) === 1 ? 'מתכון' : 'מתכונים'}
                  </span>
                </Link>
              ))}
          </div>
        )}
      </section>

      {/* ── base recipes ────────────────────────────────────────────────── */}
      <section className={styles.section} aria-label="מתכוני בסיס">
        <h2 className={styles.sectionTitle}>מתכוני בסיס</h2>
        {bases.length === 0 ? (
          <p className={styles.note}>
            מתכון בסיס הוא מתכון שמשמש כרכיב במתכונים אחרים — גנאש, קרם, בצק. אפשר
            לסמן מתכון כבסיס בעריכה שלו, ואז הוא יופיע כאן עם העלות שלו לק&quot;ג.
          </p>
        ) : (
          <ul className={styles.bases}>
            {bases.map((b) => (
              <li key={b.recipe.id}>
                <Link to={`/recipe/${b.recipe.id}`} className={styles.baseRow}>
                  <span className={styles.baseName}>{b.recipe.name}</span>
                  <span className={styles.baseMeta}>
                    <span className="ltr">{formatGrams(b.yieldG)}</span>
                    {pro && (
                      <>
                        {' · '}
                        {b.costPerKg === null ? (
                          // No cost is not a cost of zero, and it must not sort
                          // to the front of a list about cost.
                          <span className={styles.baseNoCost}>אין עלות</span>
                        ) : (
                          <>
                            <span className="ltr">{formatNis(b.costPerKg)}</span> לק&quot;ג
                            {b.partial && <span className={styles.basePartial}> · חלקי</span>}
                          </>
                        )}
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
