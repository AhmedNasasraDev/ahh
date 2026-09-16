import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { compute, formatGrams, formatNis } from '@recipe-notebook/engine';
import { useAppData } from '../app/AppDataProvider.js';
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
  const { recipes, categories, prefs, capabilities } = useAppData();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('הכל');

  const pro = prefs.pro === true;

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
          <Link to="/recipe/new" className={styles.newBtn}>
            + מתכון חדש
          </Link>
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
          </div>
        )
      ) : (
        <ul className={styles.list}>
          {filtered.map((r) => {
            // The list shows real computed figures, from the same engine the
            // recipe page uses — one conversion path, per B1/B2.
            const c = compute(r, recipes, { prefs });
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
