// The ingredient centre (stage-7 requirements 1-5).
//
// One place where a material is managed, and the only place its price exists.
// The three things this screen is careful about:
//
// 1. IT ASKS WHAT WAS BOUGHT, NOT WHAT THINGS COST PER KILO. Nobody buys
//    "per kilogram" — they buy a 25 kg sack for ₪110, a 200 g pack for ₪8.90,
//    a tray of 30 eggs for ₪39. The per-base-unit price is DERIVED and shown
//    back, never typed. `basePriceOf` mirrors the generated column so the
//    figure appears while the user is still typing.
//
// 2. AN UNPRICED MATERIAL IS NOT A FREE ONE. An empty price field stays empty
//    and the material reports "no price"; a typed 0 is a real price of zero.
//    The numeric fields are held as STRINGS for exactly that reason — the same
//    device the recipe form uses, because '' → null and '0' → 0 is a
//    distinction that a `number | undefined` field cannot keep.
//
// 3. CHANGING A PRICE SAYS WHAT IT MOVES. Requirement 5: the user sees which
//    recipes are affected, from `recipes_pricing_on` — which counts only the
//    lines that INHERIT the price, because a line with its own price does not
//    move and claiming it does would be wrong.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatNis, ingredientKeyOf } from '@recipe-notebook/engine';
import { useAppData } from '../app/AppDataProvider.js';
import {
  PURCHASE_UNITS,
  basePriceOf,
  purchaseUnitLabel,
  suggestedAllergens,
  type CatalogItem,
} from '../features/pricing/catalog.js';
import type { PurchaseUnit } from '../lib/database.types.js';
import styles from './IngredientsScreen.module.css';

/** The form, held as strings so an empty field can stay empty. */
interface Draft {
  key: string;
  name: string;
  purchaseUnit: PurchaseUnit;
  packageQty: string;
  packagePrice: string;
  supplier: string;
  note: string;
  allergens: string[];
}

const emptyDraft = (): Draft => ({
  key: '',
  name: '',
  purchaseUnit: 'kg',
  packageQty: '',
  packagePrice: '',
  supplier: '',
  note: '',
  allergens: [],
});

const draftOf = (item: CatalogItem): Draft => ({
  key: item.key,
  name: item.name,
  purchaseUnit: item.purchaseUnit,
  // null becomes '', which is what keeps "unknown" out of the numbers.
  packageQty: item.packageQty === null ? '' : String(item.packageQty),
  packagePrice: item.packagePrice === null ? '' : String(item.packagePrice),
  supplier: item.supplier,
  note: item.note,
  allergens: [...item.allergens],
});

/** '' → null, '0' → 0. The whole reason the draft holds strings. */
const numOrNull = (v: string): number | null => {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const when = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** How old a price is, in words. A three-month-old cost basis is a risk. */
const ageNote = (iso: string | null): string => {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days) || days < 0) return '';
  if (days === 0) return 'עודכן היום';
  if (days === 1) return 'עודכן אתמול';
  if (days < 30) return `עודכן לפני ${days} ימים`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'עודכן לפני חודש' : `עודכן לפני ${months} חודשים`;
};

export function IngredientsScreen() {
  const { catalog, saveCatalogItem, deleteCatalogItem, recipesPricingOn, capabilities } =
    useAppData();

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [affected, setAffected] = useState<
    Array<{ id: string; name: string; rows: number; overridden: number }>
  >([]);

  const canWrite = capabilities.canWrite;
  const sorted = useMemo(
    () => [...catalog].sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [catalog],
  );

  // What the price WILL be, from what is typed. Shown live, so the user sees
  // ₪4.40 לק"ג while typing "25" and "110" and can tell they got it right.
  const derived = useMemo(
    () =>
      basePriceOf({
        purchaseUnit: draft.purchaseUnit,
        packageQty: numOrNull(draft.packageQty),
        packagePrice: numOrNull(draft.packagePrice),
      }),
    [draft.purchaseUnit, draft.packageQty, draft.packagePrice],
  );

  const loadAffected = useCallback(
    async (key: string) => {
      setAffected(key ? await recipesPricingOn(key) : []);
    },
    [recipesPricingOn],
  );

  useEffect(() => {
    if (editing) void loadAffected(editing);
    else setAffected([]);
  }, [editing, loadAffected]);

  const startNew = () => {
    setEditing('');
    setDraft(emptyDraft());
    setProblem(null);
  };

  const startEdit = (item: CatalogItem) => {
    setEditing(item.key);
    setDraft(draftOf(item));
    setProblem(null);
  };

  const onSave = async () => {
    setProblem(null);
    const name = draft.name.trim();
    if (!name) {
      setProblem('לחומר גלם חייב להיות שם.');
      return;
    }
    const qty = numOrNull(draft.packageQty);
    if (qty !== null && qty <= 0) {
      setProblem('הכמות באריזה חייבת להיות גדולה מאפס. אריזה של כלום אינה מחיר.');
      return;
    }
    const price = numOrNull(draft.packagePrice);
    if (price !== null && price < 0) {
      setProblem('מחיר אריזה אינו יכול להיות שלילי.');
      return;
    }

    setBusy(true);
    try {
      await saveCatalogItem({
        id: '',
        // The identity is the engine's own, so a recipe row written as
        // "חמאה 82% " matches the material "חמאה 82%" — the same key
        // calibration matching uses (B4).
        key: draft.key.trim() || ingredientKeyOf({ name }),
        name,
        purchaseUnit: draft.purchaseUnit,
        packageQty: qty,
        packagePrice: price,
        supplier: draft.supplier.trim(),
        priceUpdatedAt: null,
        note: draft.note.trim(),
        // Ignored by the repository: the database derives them.
        price: null,
        priceUnit: null,
        allergens: draft.allergens,
      });
      setEditing(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'השמירה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (key: string) => {
    setProblem(null);
    setBusy(true);
    try {
      await deleteCatalogItem(key);
      setConfirmDelete(null);
      if (editing === key) setEditing(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'המחיקה נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  const suggestions = useMemo(
    () => suggestedAllergens(draft.name).filter((a) => !draft.allergens.includes(a)),
    [draft.name, draft.allergens],
  );

  const unitDef = PURCHASE_UNITS.find((u) => u.id === draft.purchaseUnit)!;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>חומרי גלם</h1>
        <p className={styles.lede}>
          המחיר של כל חומר גלם נמצא כאן, במקום אחד. שינוי מחיר כאן משנה את העלות
          בכל המתכונים שמשתמשים בו ולא הוזן בהם מחיר אחר.
        </p>
      </header>

      {!canWrite && (
        <p className={styles.notice} role="status">
          אין כרגע חיבור לחשבון, ולכן אי אפשר להוסיף או לשנות חומרי גלם.
        </p>
      )}

      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}

      {editing === null ? (
        <button
          type="button"
          className={styles.addBtn}
          onClick={startNew}
          disabled={!canWrite}
          aria-label="הוספת חומר גלם"
        >
          <span aria-hidden="true">+ </span>חומר גלם חדש
        </button>
      ) : (
        <section
          className={styles.form}
          /*
            Named for what it IS, not for the material. `עריכת חמאה 82%` is
            already the list button's name, and two different things with one
            accessible name is a dead end for anyone navigating by name.
          */
          aria-label={editing ? `טופס חומר גלם: ${draft.name || 'ללא שם'}` : 'טופס חומר גלם חדש'}
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ic-name">
              שם חומר הגלם
            </label>
            <input
              id="ic-name"
              className={styles.input}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              aria-label="שם חומר הגלם"
            />
          </div>

          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ic-unit">
                יחידת רכישה
              </label>
              <select
                id="ic-unit"
                className={styles.select}
                value={draft.purchaseUnit}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, purchaseUnit: e.target.value as PurchaseUnit }))
                }
                aria-label="יחידת רכישה"
              >
                {PURCHASE_UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {purchaseUnitLabel(u.id)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="ic-qty">
                {unitDef.qtyLabel}
              </label>
              <input
                id="ic-qty"
                className={`${styles.input} ltr`}
                inputMode="decimal"
                value={draft.packageQty}
                onChange={(e) => setDraft((d) => ({ ...d, packageQty: e.target.value }))}
                aria-label="כמות באריזה"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="ic-price">
                מחיר האריזה ₪
              </label>
              <input
                id="ic-price"
                className={`${styles.input} ltr`}
                inputMode="decimal"
                value={draft.packagePrice}
                onChange={(e) => setDraft((d) => ({ ...d, packagePrice: e.target.value }))}
                aria-label="מחיר האריזה"
              />
            </div>
          </div>

          {/* The derived figure, live. Never typed, never stored by the client. */}
          <p className={styles.derived} role="status" aria-label="מחיר ליחידת בסיס">
            {derived
              ? `${formatNis(derived.price)} ל${derived.unit}`
              : 'אין עדיין מחיר — צריך גם כמות באריזה וגם מחיר אריזה. שדה ריק אינו אפס.'}
          </p>

          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ic-supplier">
                ספק
              </label>
              <input
                id="ic-supplier"
                className={styles.input}
                value={draft.supplier}
                onChange={(e) => setDraft((d) => ({ ...d, supplier: e.target.value }))}
                aria-label="ספק"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ic-note">
                הערה
              </label>
              <input
                id="ic-note"
                className={styles.input}
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                aria-label="הערה על חומר הגלם"
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>אלרגנים</span>
            <div className={styles.chips} aria-label="אלרגנים של חומר הגלם">
              {draft.allergens.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={styles.chipOn}
                  onClick={() =>
                    setDraft((d) => ({ ...d, allergens: d.allergens.filter((x) => x !== a) }))
                  }
                  aria-label={`הסרת האלרגן ${a}`}
                >
                  {a} <span aria-hidden="true">×</span>
                </button>
              ))}
              {suggestions.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={styles.chipOff}
                  onClick={() => setDraft((d) => ({ ...d, allergens: [...d.allergens, a] }))}
                  aria-label={`הוספת האלרגן ${a}`}
                >
                  <span aria-hidden="true">+ </span>
                  {a}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              אלרגן שמסומן כאן נספר בכל מתכון שמשתמש בחומר הגלם הזה, בנוסף לזיהוי
              לפי השם.
            </p>
          </div>

          {/* Requirement 5: what this price change will move. */}
          {affected.length > 0 && (
            <div className={styles.affected} aria-label="מתכונים שהמחיר הזה משפיע עליהם">
              <p className={styles.affectedTitle}>
                {affected.length === 1
                  ? 'מתכון אחד מושפע מהמחיר הזה'
                  : `${affected.length} מתכונים מושפעים מהמחיר הזה`}
                :
              </p>
              <ul className={styles.affectedList}>
                {affected.map((r) => (
                  <li key={r.id}>
                    <Link to={`/recipe/${r.id}`}>{r.name}</Link>
                    {r.overridden > 0 && (
                      <span className={styles.affectedNote}>
                        {' '}
                        ({r.overridden === 1
                          ? 'שורה אחת שם עם מחיר משלה, שלא תשתנה'
                          : `${r.overridden} שורות שם עם מחיר משלהן, שלא ישתנו`})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => void onSave()}
              disabled={busy || !canWrite}
              aria-label="שמירת חומר הגלם"
            >
              {busy ? 'שומר…' : 'שמירה'}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setEditing(null)}
              aria-label="ביטול העריכה"
            >
              ביטול
            </button>
          </div>
        </section>
      )}

      {sorted.length === 0 ? (
        <p className={styles.empty}>
          אין עדיין חומרי גלם. אחרי שיוזן חומר גלם עם מחיר אריזה, כל מתכון
          שמשתמש בו יקבל את המחיר אוטומטית.
        </p>
      ) : (
        <ul className={styles.list} aria-label="רשימת חומרי הגלם">
          {sorted.map((item) => (
            <li key={item.key} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.itemName}>{item.name}</span>
                <span className={`${styles.itemPrice} ltr`}>
                  {item.price === null ? (
                    /* Not ₪0. A material nobody has priced has no price, and
                       showing 0 would put it into every cost as free. */
                    <span className={styles.noPrice} aria-label={`אין מחיר ל${item.name}`}>
                      אין מחיר
                    </span>
                  ) : (
                    `${formatNis(item.price)} ל${item.priceUnit}`
                  )}
                </span>
              </div>

              <p className={styles.itemMeta}>
                {item.packageQty !== null && item.packagePrice !== null && (
                  <span className={styles.itemPack}>
                    {`${item.packageQty} ${purchaseUnitLabel(item.purchaseUnit)} ב-${formatNis(item.packagePrice)}`}
                  </span>
                )}
                {item.supplier && <span> · {item.supplier}</span>}
                {item.priceUpdatedAt && (
                  <span title={when(item.priceUpdatedAt)}> · {ageNote(item.priceUpdatedAt)}</span>
                )}
              </p>

              {item.allergens.length > 0 && (
                <p className={styles.itemAllergens}>אלרגנים: {item.allergens.join(' · ')}</p>
              )}

              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => startEdit(item)}
                  disabled={!canWrite}
                  aria-label={`עריכת ${item.name}`}
                >
                  עריכה
                </button>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => setConfirmDelete(item.key)}
                  disabled={!canWrite}
                  aria-label={`מחיקת ${item.name}`}
                >
                  מחיקה
                </button>
              </div>

              {confirmDelete === item.key && (
                <div
                  className={styles.confirm}
                  role="alertdialog"
                  aria-label={`אישור מחיקת ${item.name}`}
                >
                  <p>
                    למחוק את &quot;{item.name}&quot; מחומרי הגלם? מתכונים שהשתמשו
                    במחיר שלו יחזרו להיות בלי מחיר לשורה הזאת — לא למחיר אפס.
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() => void onDelete(item.key)}
                      disabled={busy}
                      aria-label={`אישור מחיקת ${item.name}`}
                    >
                      {busy ? 'מוחק…' : 'כן, למחוק'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setConfirmDelete(null)}
                      aria-label="ביטול המחיקה"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
