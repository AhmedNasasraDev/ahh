import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { compute, formatGrams, formatNis, type Computed } from '@recipe-notebook/engine';
import { useAppData } from '../app/AppDataProvider.js';
import { resolveFromCatalog } from '../features/pricing/catalog.js';
import styles from './NotebookScreen.module.css';

/**
 * §2 screen 3 — the notebook: search, category filter, import/export.
 *
 * Search matches the prototype: name, tags and ingredient names.
 * Import/export are not rendered at all in this stage. The prototype's export
 * button announced "X מתכונים הועתקו לקובץ" without producing a file (B8), and
 * a button that lies is worse than a button that is absent.
 */
export function NotebookScreen() {
  const { recipes, categories, prefs, capabilities, catalog } = useAppData();
  const [query, setQuery] = useState('');

  /*
    The category filter is addressable: `/notebook?category=לחמים`.
    It was component state, which is why the home screen had nowhere to link a
    category tile TO. A filter in the URL is also the thing a user expects to
    survive a back button and a shared link.
  */
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('category');
  const category = fromUrl && categories.includes(fromUrl) ? fromUrl : 'הכל';
  const setCategory = (next: string) => {
    const p = new URLSearchParams(params);
    if (next === 'הכל') p.delete('category');
    else p.set('category', next);
    // `replace`: choosing four categories in a row should not put four entries
    // in the history for the back button to walk through.
    setParams(p, { replace: true });
  };

  const pro = prefs.pro === true;

  /*
    STAGE-10 AUDIT FIX, two defects in one place.

    1. THE CARDS IGNORED THE CENTRAL PRICES. This ran `compute(r, recipes)` on
       the RAW recipes, so a card's "₪ לק"ג" came from prices typed into the
       recipe's own rows. Since stage 7 the normal case is the opposite — the
       price lives in the ingredient centre and the row has none — so a
       properly priced recipe showed NO cost on its card and a full cost on its
       own page. One figure, two screens, two answers. The catalog is resolved
       here now, exactly as the recipe screen does it.

    2. IT RAN INSIDE THE RENDER LOOP. Measured: 120 recipes of 40 rows cost
       24.4 ms per render, so typing a ten-letter search term spent ~244 ms
       recomputing the whole notebook — on a phone, several times that. The
       computation is keyed on the notebook, the catalog and the preferences
       instead of on the filtered subset, so searching and switching category
       now cost nothing: only a real change to the data recomputes.
  */
  const computedById = useMemo(() => {
    const priced = recipes.map((r) => resolveFromCatalog(r, catalog));
    const out = new Map<string, Computed>();
    for (const r of priced) out.set(r.id, compute(r, priced, { prefs }));
    return out;
  }, [recipes, catalog, prefs]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return recipes.filter((r) => {
      if (category !== 'הכל' && r.category !== category) return false;
      if (!q) return true;
      const haystack = [
        r.name ?? '',
        ...(r.tags ?? []),
        ...(r.ingredients ?? []).map((i) => i.name ?? ''),
      ].join(' ');
      return haystack.includes(q);
    });
  }, [recipes, query, category]);

  const subCount = recipes.filter((r) => r.isSub).length;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div className={styles.headRow}>
          <div>
            <h1 className={styles.title}>מחברת מתכונים</h1>
            <p className={styles.count}>
              {recipes.length === 1 ? 'מתכון אחד' : `${recipes.length} מתכונים`}
              {subCount > 0 && ` · ${subCount === 1 ? 'בסיס אחד' : `${subCount} בסיסים`}`}
            </p>
          </div>
          {/*
            The entry point stage 4 was mainly about. It is rendered even when
            the repository cannot write, because hiding it would leave a
            read-only visitor with no explanation of where recipes come from —
            the editor itself says plainly that saving is unavailable.
          */}
          <span className={styles.newGroup}>
            <Link to="/recipe/new" className={styles.newBtn}>
              + מתכון חדש
            </Link>
            {/* §2 screen 6. Second, and quieter: typing a recipe is the normal
                path and pasting one is the shortcut. */}
            <Link to="/paste" className={styles.pasteBtn}>
              הדבקה
            </Link>
          </span>
        </div>
      </header>

      <div className={styles.searchRow}>
        <label className="visuallyHidden" htmlFor="nb-search">
          חיפוש מתכון
        </label>
        <input
          id="nb-search"
          className={styles.search}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="שם, תג או רכיב"
        />
      </div>

      <div className={`${styles.chips} hideScrollbar`} role="group" aria-label="סינון לפי קטגוריה">
        {['הכל', ...categories].map((c) => (
          <button
            key={c}
            type="button"
            className={category === c ? styles.chipOn : styles.chip}
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
          >
            {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        query.trim() || category !== 'הכל' ? (
          <p className={styles.empty}>אין מתכון שתואם לחיפוש.</p>
        ) : (
          /* A first-run notebook. Saying only "המחברת ריקה." was the dead end
             stage 3 ended on: correct, and no help at all. */
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>המחברת ריקה.</p>
            <p className={styles.emptyBody}>
              {capabilities.canWrite
                ? 'כאן יישמרו המתכונים שלכם — עם כמויות, תשואה, עלות ונוסחת אופה. אפשר להתחיל ממתכון אחד.'
                : 'אין חיבור לשרת בהתקנה הזאת, ולכן אי אפשר לשמור מתכונים כרגע.'}
            </p>
            <Link to="/recipe/new" className={styles.emptyCta}>
              יצירת המתכון הראשון
            </Link>
            {capabilities.canWrite && (
              <Link to="/paste" className={styles.emptyAlt}>
                או הדבקת מתכון מטקסט
              </Link>
            )}
          </div>
        )
      ) : (
        <ul className={styles.list}>
          {filtered.map((r) => {
            // The list shows real computed figures, from the same engine AND
            // the same central prices the recipe page uses — one conversion
            // path, per B1/B2, and one cost.
            const c = computedById.get(r.id) ?? compute(r, recipes, { prefs });
            const yieldLabel = r.yieldUnits
              ? `${r.yieldUnits} יח' · ${r.unitWeight} גר' ליחידה`
              : formatGrams(c.actualYield);
            return (
              <li key={r.id}>
                <Link to={`/recipe/${r.id}`} className={styles.card}>
                  <span className={styles.cardName}>{r.name}</span>
                  <span className={styles.cardMeta}>
                    {r.category} · <span className="ltr">{yieldLabel}</span>
                    {pro && c.costPerKg > 0 && (
                      <>
                        {' · '}
                        <span className="ltr">{formatNis(c.costPerKg)}</span> לק&quot;ג
                      </>
                    )}
                  </span>
                  <span className={styles.badges}>
                    {r.isSub && <span className={styles.badgeSub}>מתכון בסיס</span>}
                    {r.locked && <span className={styles.badgeLocked}>נוסחה מאושרת</span>}
                    {r.versionOf && <span className={styles.badgeVersion}>גרסה</span>}
                    {(r.tags ?? []).map((t) => (
                      <span key={t} className={styles.badgeTag}>
                        {t}
                      </span>
                    ))}
                  </span>
                  {c.unresolved.length > 0 && (
                    <span className={styles.cardWarn}>
                      {c.unresolved.length === 1
                        ? 'רכיב אחד ללא נתון צפיפות אמין'
                        : `${c.unresolved.length} רכיבים ללא נתון צפיפות אמין`}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
