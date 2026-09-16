// Create and edit a recipe.
//
// This screen closes the gap stage 3 left open: a signed-in account could
// sign in, answer the onboarding, and then had no way to put anything in its
// notebook.
//
// Three things shape it.
//
// 1. **Every numeric field is a string.** See the long note in draft.ts. It is
//    what keeps NULL and 0 distinguishable from the keyboard to the column.
//
// 2. **The live preview runs the real engine.** Not a simplified copy of it —
//    `compute()` and `calcState()`, the same two calls the recipe page makes,
//    against the draft as it stands. So the totals in the editor and the totals
//    after saving cannot disagree, and a row that will be unweighable says so
//    while the user is still typing and can fix it.
//
// 3. **Nothing is invented to make the preview look complete.** A row with no
//    reliable density shows a dash and the reason, and the partial notice names
//    it. The way out is offered — a personal calibration, or switching the row
//    to grams — and neither is a guessed number.
//
// Accessibility: every control has its own accessible name, and per-row
// controls carry the ingredient's name ("הסרת קמח לבן", not "הסרה"), because a
// screen-reader user navigating by name otherwise gets a list of identical
// buttons.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  UNITS,
  compute,
  formatGrams,
  formatNis,
  unitLabel,
  type Recipe,
} from '@recipe-notebook/engine';
import { useAppData } from '../app/AppDataProvider.js';
import { SourceBadge } from '../components/SourceBadge.js';
import { CalibrateSheet } from '../features/recipe/CalibrateSheet.js';
import { calcState } from '../features/recipe/completeness.js';
import {
  draftFromRecipe,
  draftToRecipe,
  emptyDraft,
  emptyIngredient,
  emptyStep,
  isDirty,
  moveRow,
  validateDraft,
  type IngredientDraft,
  type RecipeDraft,
  type StepDraft,
} from '../features/recipe/draft.js';
import styles from './RecipeEditScreen.module.css';

const PRICE_UNITS = ['ק"ג', 'ליטר', "יח'"] as const;

/** The unit picker, grouped so weight units are the obvious default. */
const UNIT_GROUPS = [
  { label: 'משקל', ids: ['g', 'kg', 'mg', 'oz'] },
  { label: 'נפח', ids: ['ml', 'l', 'cup', 'tbsp', 'tsp', 'floz'] },
  { label: 'ספירה', ids: ['unit', 'egg', 'fruit', 'slice'] },
] as const;

export function RecipeEditScreen() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const {
    recipes,
    categories,
    prefs,
    capabilities,
    saveRecipe,
    setCalibrations,
    ready,
  } = useAppData();

  const isNew = !recipeId;
  const existing = useMemo(
    () => (recipeId ? (recipes.find((r) => r.id === recipeId) ?? null) : null),
    [recipeId, recipes],
  );

  const [draft, setDraft] = useState<RecipeDraft>(() => emptyDraft());
  const [original, setOriginal] = useState<RecipeDraft>(() => emptyDraft());
  const [loaded, setLoaded] = useState(isNew);
  const [problems, setProblems] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [calibrateFor, setCalibrateFor] = useState<string | null>(null);
  const [showProduction, setShowProduction] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  // Load once. Re-seeding the form from `recipes` on every change would discard
  // what the user is typing the moment anything else refreshes the list.
  useEffect(() => {
    if (isNew || loaded) return;
    if (!ready) return;
    if (existing) {
      const d = draftFromRecipe(existing);
      setDraft(d);
      setOriginal(d);
      setLoaded(true);
    }
  }, [isNew, loaded, ready, existing]);

  // §6 / §18.7: an approved production formula is not edited by accident.
  const lockedBlock = existing?.locked === true;

  const dirty = isDirty(draft, original);

  // Warn before a reload or a tab close drops unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // The preview. Built from the draft exactly as it will be saved, so what is
  // on screen is what the recipe page will show afterwards.
  const previewRecipe = useMemo<Recipe>(() => draftToRecipe(draft), [draft]);
  const computed = useMemo(
    () => compute(previewRecipe, [...recipes, previewRecipe], { prefs }),
    [previewRecipe, recipes, prefs],
  );
  const calc = calcState(computed);
  const pro = prefs.pro === true;

  const patch = (p: Partial<RecipeDraft>) => setDraft((d) => ({ ...d, ...p }));

  const patchIngredient = (index: number, p: Partial<IngredientDraft>) =>
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.map((row, i) => (i === index ? { ...row, ...p } : row)),
    }));

  const patchStep = (index: number, p: Partial<StepDraft>) =>
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((row, i) => (i === index ? { ...row, ...p } : row)),
    }));

  const onSave = async () => {
    setSaveError(null);
    const found = validateDraft(draft);
    if (found.length > 0) {
      setProblems(found.map((p) => p.message));
      errorRef.current?.focus();
      return;
    }
    setProblems([]);
    setBusy(true);
    try {
      const saved = await saveRecipe(draftToRecipe(draft));
      // Replace the baseline before navigating, so the unsaved-changes guard
      // does not fire on a form that was just saved successfully.
      setOriginal(draftFromRecipe(saved));
      navigate(`/recipe/${saved.id}`, { replace: true });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'השמירה נכשלה.');
      errorRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const onCancel = () => {
    if (dirty && !window.confirm('יש שינויים שלא נשמרו. לצאת בלי לשמור?')) return;
    navigate(recipeId ? `/recipe/${recipeId}` : '/notebook');
  };

  if (!isNew && !loaded) {
    return (
      <div className={styles.page}>
        <p className={styles.loading}>
          {ready ? 'המתכון הזה לא נמצא במחברת.' : 'טוען…'}
        </p>
        <Link to="/notebook" className={styles.backLink}>
          ← המחברת
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button type="button" className={`${styles.backLink} nowrap`} onClick={onCancel}>
          ← ביטול
        </button>
        <h1 className={styles.screenTitle}>{isNew ? 'מתכון חדש' : 'עריכת מתכון'}</h1>
      </div>

      {!capabilities.canWrite && (
        <p className={styles.blockedBox} role="status">
          {capabilities.source === 'local-demo'
            ? 'אין חיבור לשרת בהתקנה הזאת, ולכן אי אפשר לשמור. אפשר למלא ולראות את החישוב, אבל השמירה תסורב.'
            : 'אין כרגע חיבור לאינטרנט, ולכן אי אפשר לשמור.'}
        </p>
      )}

      {lockedBlock && (
        <p className={styles.blockedBox} role="status">
          המתכון הזה מסומן כנוסחה מאושרת לייצור. עריכה שלו משנה נוסחה שאושרה —
          כדאי לשכפל אותו ולערוך את העותק.
        </p>
      )}

      <div
        ref={errorRef}
        tabIndex={-1}
        className={styles.errorSlot}
        aria-live="polite"
      >
        {problems.length > 0 && (
          <div className={styles.errorBox} role="alert">
            <p className={styles.errorTitle}>לא ניתן לשמור עדיין:</p>
            <ul>
              {problems.map((p) => (
                <li key={p}>· {p}</li>
              ))}
            </ul>
          </div>
        )}
        {saveError && (
          <p className={styles.errorBox} role="alert">
            {saveError}
          </p>
        )}
      </div>

      {/* ── identity ───────────────────────────────────────────────────── */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>המתכון</h2>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="r-name">
            שם המתכון
          </label>
          <input
            id="r-name"
            className={styles.input}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="למשל: בריוש נאנטר"
          />
        </div>

        <div className={styles.row2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="r-category">
              קטגוריה
            </label>
            <select
              id="r-category"
              className={styles.select}
              value={draft.category}
              onChange={(e) => patch({ category: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="r-tags">
              תגים
            </label>
            <input
              id="r-tags"
              className={styles.input}
              value={draft.tags}
              onChange={(e) => patch({ tags: e.target.value })}
              placeholder="מופרדים בפסיק"
            />
          </div>
        </div>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={draft.isSub}
            onChange={(e) => patch({ isSub: e.target.checked })}
          />
          <span>
            מתכון בסיס
            <span className={styles.hint}>
              נמדד במשקל בתוך מתכונים אחרים, ולא מומר לנפח (§18.6)
            </span>
          </span>
        </label>
      </section>

      {/* ── ingredients ────────────────────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <h2 className={styles.cardTitle}>רכיבים</h2>
          <span className={styles.countHint}>
            {draft.ingredients.length === 1 ? 'שורה אחת' : `${draft.ingredients.length} שורות`}
          </span>
        </div>

        <ul className={styles.rows}>
          {draft.ingredients.map((row, i) => {
            const label = row.name.trim() || `רכיב ${i + 1}`;
            const computedRow = computed.rows.find((r) => r.ing.id === row.key);
            const unresolved = computedRow ? computedRow.g === null : false;
            const needsDensity =
              unresolved && row.qty.trim() !== '' && row.name.trim() !== '';

            return (
              <li key={row.key} className={styles.ingCard}>
                <div className={styles.ingHead}>
                  <span className={styles.ingIndex} aria-hidden="true">
                    {i + 1}
                  </span>
                  <input
                    className={`${styles.input} ${styles.ingName}`}
                    value={row.name}
                    onChange={(e) => patchIngredient(i, { name: e.target.value })}
                    placeholder="שם הרכיב"
                    aria-label={`שם הרכיב בשורה ${i + 1}`}
                  />
                  <div className={styles.rowTools}>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={`העלאת ${label} למעלה`}
                      disabled={i === 0}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          ingredients: moveRow(d.ingredients, i, i - 1),
                        }))
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={`הורדת ${label} למטה`}
                      disabled={i === draft.ingredients.length - 1}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          ingredients: moveRow(d.ingredients, i, i + 1),
                        }))
                      }
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtnDanger}
                      aria-label={`הסרת ${label}`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          ingredients: d.ingredients.filter((_, x) => x !== i),
                        }))
                      }
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className={styles.ingGrid}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`q-${row.key}`}>
                      כמות
                    </label>
                    <input
                      id={`q-${row.key}`}
                      className={`${styles.input} ltr`}
                      inputMode="decimal"
                      value={row.qty}
                      onChange={(e) => patchIngredient(i, { qty: e.target.value })}
                      aria-label={`כמות של ${label}`}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`u-${row.key}`}>
                      יחידה
                    </label>
                    <select
                      id={`u-${row.key}`}
                      className={styles.select}
                      value={row.unit}
                      onChange={(e) => patchIngredient(i, { unit: e.target.value })}
                      aria-label={`יחידת המדידה של ${label}`}
                    >
                      {UNIT_GROUPS.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.ids.map((id) => {
                            const u = UNITS.find((x) => x.id === id);
                            return u ? (
                              <option key={id} value={id}>
                                {u.he}
                              </option>
                            ) : null;
                          })}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                {/* What the engine makes of this row, right now. */}
                <div
                  className={styles.ingResult}
                  aria-label={`המשקל המחושב של ${label}`}
                >
                  {computedRow && !unresolved ? (
                    <>
                      <span className="ltr">{formatGrams(computedRow.g ?? 0)}</span>
                      {computedRow.provenance.source !== 'exact' && (
                        <SourceBadge provenance={computedRow.provenance} />
                      )}
                    </>
                  ) : (
                    <span className={styles.ingMissing}>
                      {row.name.trim() === '' || row.qty.trim() === ''
                        ? 'יש להשלים שם וכמות'
                        : (computedRow?.provenance.why ?? 'אין נתון אמין')}
                    </span>
                  )}
                </div>

                {needsDensity && (
                  <div className={styles.fixRow}>
                    <button
                      type="button"
                      className={styles.fixBtn}
                      onClick={() => setCalibrateFor(row.name.trim())}
                      aria-label={`כיול אישי של ${label}`}
                    >
                      לכייל אצלי במטבח
                    </button>
                    <button
                      type="button"
                      className={styles.fixBtnGhost}
                      onClick={() => patchIngredient(i, { unit: 'g' })}
                      aria-label={`מדידת ${label} בגרמים`}
                    >
                      לשקול בגרמים
                    </button>
                  </div>
                )}

                <details className={styles.more}>
                  <summary className={styles.moreSummary}>
                    פרטים נוספים ל{label}
                  </summary>
                  <div className={styles.ingGrid}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`p-${row.key}`}>
                        מחיר
                      </label>
                      <input
                        id={`p-${row.key}`}
                        className={`${styles.input} ltr`}
                        inputMode="decimal"
                        value={row.price}
                        onChange={(e) => patchIngredient(i, { price: e.target.value })}
                        aria-label={`מחיר של ${label}`}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`pu-${row.key}`}>
                        ליחידת מחיר
                      </label>
                      <select
                        id={`pu-${row.key}`}
                        className={styles.select}
                        value={row.priceUnit}
                        onChange={(e) => patchIngredient(i, { priceUnit: e.target.value })}
                        aria-label={`יחידת המחיר של ${label}`}
                      >
                        <option value="">—</option>
                        {PRICE_UNITS.map((pu) => (
                          <option key={pu} value={pu}>
                            {pu}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`d-${row.key}`}>
                        צפיפות, גרם ל-100 מ&quot;ל
                      </label>
                      <input
                        id={`d-${row.key}`}
                        className={`${styles.input} ltr`}
                        inputMode="decimal"
                        value={row.gPer100}
                        onChange={(e) => patchIngredient(i, { gPer100: e.target.value })}
                        aria-label={`צפיפות של ${label}`}
                        placeholder="ריק = לפי הטבלה"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`uw-${row.key}`}>
                        משקל ליחידה
                      </label>
                      <input
                        id={`uw-${row.key}`}
                        className={`${styles.input} ltr`}
                        inputMode="decimal"
                        value={row.unitWeight}
                        onChange={(e) => patchIngredient(i, { unitWeight: e.target.value })}
                        aria-label={`משקל ליחידה של ${label}`}
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`w-${row.key}`}>
                        אחוז מים
                      </label>
                      <input
                        id={`w-${row.key}`}
                        className={`${styles.input} ltr`}
                        inputMode="decimal"
                        value={row.waterPct}
                        onChange={(e) => patchIngredient(i, { waterPct: e.target.value })}
                        aria-label={`אחוז מים של ${label}`}
                        placeholder="ריק = לפי הטבלה"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor={`n-${row.key}`}>
                        הערה
                      </label>
                      <input
                        id={`n-${row.key}`}
                        className={styles.input}
                        value={row.note}
                        onChange={(e) => patchIngredient(i, { note: e.target.value })}
                        aria-label={`הערה על ${label}`}
                      />
                    </div>
                  </div>
                  <div className={styles.checkPair}>
                    <label className={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={row.flour}
                        onChange={(e) => patchIngredient(i, { flour: e.target.checked })}
                        aria-label={`${label} נחשב קמח לנוסחת האופה`}
                      />
                      <span>קמח — נכנס לנוסחת האופה</span>
                    </label>
                    <label className={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={row.liquid}
                        onChange={(e) => patchIngredient(i, { liquid: e.target.checked })}
                        aria-label={`${label} נחשב נוזל להידרציה`}
                      />
                      <span>נוזל — נכנס להידרציה</span>
                    </label>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>

        {/* The `+` is decorative. Without an explicit label a screen reader
            announces "plus hosafat rakiv", and the two add buttons on this
            screen would differ only by that leading glyph. */}
        <button
          type="button"
          className={styles.addBtn}
          aria-label="הוספת רכיב"
          onClick={() =>
            setDraft((d) => ({ ...d, ingredients: [...d.ingredients, emptyIngredient()] }))
          }
        >
          <span aria-hidden="true">+ </span>הוספת רכיב
        </button>
      </section>

      {/* ── live calculation, requirement 11 ───────────────────────────── */}
      <section className={styles.card} aria-label="החישוב בזמן העריכה">
        <h2 className={styles.cardTitle}>מה יוצא מזה</h2>

        {calc.level === 'full' ? (
          <p className={styles.calcFull} role="status" aria-label="שלמות החישוב">
            חישוב מלא — לכל הרכיבים יש נתון אמין.
          </p>
        ) : (
          <div
            className={calc.level === 'none' ? styles.calcNoneBox : styles.calcPartialBox}
            role="status"
            aria-label="שלמות החישוב"
          >
            <p className={styles.calcNoticeTitle}>
              {calc.level === 'none' ? 'לא ניתן לחשב' : 'נתונים חלקיים'}
            </p>
            <p className={styles.calcNoticeBody}>{calc.summary}</p>
            {calc.missingNames.length > 0 && (
              <p className={styles.calcNoticeList}>
                חסרים נתונים עבור: {calc.missingNames.join(' · ')}
              </p>
            )}
          </div>
        )}

        {pro && calc.costSummary && (
          <p className={styles.costNote} role="status" aria-label="שלמות התמחור">
            {calc.costSummary}
            {calc.costLevel === 'partial' && calc.unpricedNames.length > 0 && (
              <> חסר מחיר עבור: {calc.unpricedNames.join(' · ')}</>
            )}
          </p>
        )}

        <dl className={styles.previewRows}>
          <div className={styles.previewRow}>
            <dt>סך המשקל</dt>
            <dd className="ltr">
              {calc.level === 'none' ? '—' : formatGrams(computed.totalG)}
              {calc.partialFigures && calc.level !== 'none' && (
                <span className={styles.partialChip}>חלקי</span>
              )}
            </dd>
          </div>
          {pro && (
            <div className={styles.previewRow}>
              <dt>עלות כוללת</dt>
              <dd className="ltr">
                {/* A fully weighed recipe with no prices has no cost — not a
                    cost of zero. The two axes are tracked separately. */}
                {calc.level === 'none' || calc.costLevel === 'none'
                  ? '—'
                  : formatNis(computed.cost)}
                {(calc.partialFigures || calc.costLevel === 'partial') &&
                  calc.level !== 'none' &&
                  calc.costLevel !== 'none' && (
                    <span className={styles.partialChip}>חלקי</span>
                  )}
              </dd>
            </div>
          )}
          {computed.flour > 0 && (
            <div className={styles.previewRow}>
              <dt>הידרציה</dt>
              <dd className="ltr">
                {calc.level === 'none' ? '—' : `${computed.hydration.toFixed(1)}%`}
                {calc.partialFigures && calc.level !== 'none' && (
                  <span className={styles.partialChip}>חלקי</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* ── yield and pricing, behind the §3 disclosure ─────────────────── */}
      <section className={styles.card}>
        <button
          type="button"
          className={styles.disclosure}
          aria-expanded={showProduction}
          onClick={() => setShowProduction((v) => !v)}
        >
          {showProduction ? 'סגירת תשואה ותמחור' : 'תשואה ותמחור'}
        </button>

        {showProduction && (
          <div className={styles.prodFields}>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="r-units">
                  מספר יחידות
                </label>
                <input
                  id="r-units"
                  className={`${styles.input} ltr`}
                  inputMode="decimal"
                  value={draft.yieldUnits}
                  onChange={(e) => patch({ yieldUnits: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="r-unitweight">
                  משקל ליחידה, גרם
                </label>
                <input
                  id="r-unitweight"
                  className={`${styles.input} ltr`}
                  inputMode="decimal"
                  value={draft.unitWeight}
                  onChange={(e) => patch({ unitWeight: e.target.value })}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="r-yieldactual">
                תשואה שנמדדה בפועל, גרם
              </label>
              <input
                id="r-yieldactual"
                className={`${styles.input} ltr`}
                inputMode="decimal"
                value={draft.yieldActual}
                onChange={(e) => patch({ yieldActual: e.target.value })}
                placeholder="ריק = לפי החישוב התאורטי"
              />
              {/*
                This hint is the user-facing face of the null-vs-zero rule, and
                it is worth its space: leaving the field empty and typing 0 are
                different answers, and without saying so nobody would guess it.
              */}
              <p className={styles.hint}>
                שדה ריק פירושו &quot;לפי החישוב&quot;. אפס פירושו שנמדדה תשואה של
                אפס — שני דברים שונים.
              </p>
            </div>

            {pro && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="r-fc">
                  יעד פוד קוסט, אחוזים
                </label>
                <input
                  id="r-fc"
                  className={`${styles.input} ltr`}
                  inputMode="decimal"
                  value={draft.targetFC}
                  onChange={(e) => patch({ targetFC: e.target.value })}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── steps ──────────────────────────────────────────────────────── */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>אופן ההכנה</h2>
        <ol className={styles.rows}>
          {draft.steps.map((step, i) => (
            <li key={step.key} className={styles.stepCard}>
              <div className={styles.ingHead}>
                <span className={styles.ingIndex} aria-hidden="true">
                  {i + 1}
                </span>
                <textarea
                  className={styles.textarea}
                  value={step.text}
                  onChange={(e) => patchStep(i, { text: e.target.value })}
                  placeholder="מה עושים בשלב הזה"
                  aria-label={`תיאור שלב ${i + 1}`}
                  rows={2}
                />
                <div className={styles.rowTools}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={`העלאת שלב ${i + 1} למעלה`}
                    disabled={i === 0}
                    onClick={() =>
                      setDraft((d) => ({ ...d, steps: moveRow(d.steps, i, i - 1) }))
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={`הורדת שלב ${i + 1} למטה`}
                    disabled={i === draft.steps.length - 1}
                    onClick={() =>
                      setDraft((d) => ({ ...d, steps: moveRow(d.steps, i, i + 1) }))
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtnDanger}
                    aria-label={`הסרת שלב ${i + 1}`}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        steps: d.steps.filter((_, x) => x !== i),
                      }))
                    }
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className={styles.ingGrid}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`t-${step.key}`}>
                    טמפרטורה, °C
                  </label>
                  <input
                    id={`t-${step.key}`}
                    className={`${styles.input} ltr`}
                    inputMode="decimal"
                    value={step.temp}
                    onChange={(e) => patchStep(i, { temp: e.target.value })}
                    aria-label={`טמפרטורה בשלב ${i + 1}`}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`m-${step.key}`}>
                    דקות
                  </label>
                  <input
                    id={`m-${step.key}`}
                    className={`${styles.input} ltr`}
                    inputMode="decimal"
                    value={step.minutes}
                    onChange={(e) => patchStep(i, { minutes: e.target.value })}
                    aria-label={`זמן בדקות בשלב ${i + 1}`}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className={styles.addBtn}
          aria-label="הוספת שלב"
          onClick={() => setDraft((d) => ({ ...d, steps: [...d.steps, emptyStep()] }))}
        >
          <span aria-hidden="true">+ </span>הוספת שלב
        </button>
      </section>

      {/* ── texts ──────────────────────────────────────────────────────── */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>אחסון והערות</h2>
        <div className={styles.row2}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="r-shelf">
              חיי מדף
            </label>
            <input
              id="r-shelf"
              className={styles.input}
              value={draft.shelfLife}
              onChange={(e) => patch({ shelfLife: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="r-storage">
              אחסון
            </label>
            <input
              id="r-storage"
              className={styles.input}
              value={draft.storage}
              onChange={(e) => patch({ storage: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="r-equipment">
            ציוד נדרש
          </label>
          <input
            id="r-equipment"
            className={styles.input}
            value={draft.equipment}
            onChange={(e) => patch({ equipment: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="r-notes">
            הערות
          </label>
          <textarea
            id="r-notes"
            className={styles.textarea}
            value={draft.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={3}
          />
          <p className={styles.hint}>
            ההערות האלה נוסעות עם המתכון בשיתוף ובדף ההזמנה (§8).
          </p>
        </div>
      </section>

      {/* ── the action bar ─────────────────────────────────────────────── */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => void onSave()}
          disabled={busy || !capabilities.canWrite}
        >
          {busy ? 'שומר…' : isNew ? 'שמירת המתכון' : 'שמירת השינויים'}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          ביטול
        </button>
      </div>

      {calibrateFor !== null && (
        <CalibrateSheet
          ingredientName={calibrateFor}
          prefs={prefs}
          onClose={() => setCalibrateFor(null)}
          onSave={(next) => {
            void setCalibrations(next);
            setCalibrateFor(null);
          }}
        />
      )}
    </div>
  );
}
