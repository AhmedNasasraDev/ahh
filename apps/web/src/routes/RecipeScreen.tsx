import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  compute,
  formatGrams,
  formatNis,
  homeMeasure,
  scaleFactor,
  unitLabel,
  type ComputedRow,
  type IngredientLike,
} from '@recipe-notebook/engine';
import { useAppData } from '../app/AppDataProvider.js';
import { SourceBadge } from '../components/SourceBadge.js';
import { ConvertSheet } from '../features/recipe/ConvertSheet.js';
import { calcState, type CalcState } from '../features/recipe/completeness.js';
import styles from '../features/recipe/recipe.module.css';

type ScaleMode = 'recipe' | 'units' | 'weight' | 'stock';
type ViewMode = 'orig' | 'g' | 'home';

const SCALE_TABS: readonly { id: ScaleMode; label: string }[] = [
  { id: 'recipe', label: 'כמו במתכון' },
  { id: 'units', label: 'יחידות' },
  { id: 'weight', label: 'משקל' },
  { id: 'stock', label: 'לפי מלאי' },
];

const VIEW_TABS: readonly { id: ViewMode; label: string }[] = [
  { id: 'orig', label: 'כמו במתכון' },
  { id: 'g', label: 'גרמים' },
  { id: 'home', label: 'ביתי' },
];

const PLACEHOLDER: Record<ScaleMode, string> = {
  recipe: '',
  units: 'מספר יחידות',
  weight: 'משקל סופי בגרם',
  stock: 'גרם במלאי',
};

/**
 * §2 screen 4 — the recipe page.
 *
 * The rule that governs this whole screen is §5.4 and §6: **calculation is not
 * editing.** Scaling, unit display and the conversion sheet all show a computed
 * result and never touch the stored recipe. The factor lives in component state.
 */
export function RecipeScreen() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const { recipes, prefs } = useAppData();

  const [scaleMode, setScaleMode] = useState<ScaleMode>('recipe');
  const [scaleValue, setScaleValue] = useState('');
  const [scaleIngredient, setScaleIngredient] = useState('');
  const [view, setView] = useState<ViewMode>('orig');
  const [showProduction, setShowProduction] = useState(false);
  const [convertIngredient, setConvertIngredient] = useState<IngredientLike | null>(null);

  const recipe = recipes.find((r) => r.id === recipeId) ?? null;
  const pro = prefs.pro === true;

  // Baseline at factor 1, then the scaled pass. Both come from the one engine.
  const baseline = useMemo(
    () => (recipe ? compute(recipe, recipes, { prefs }) : null),
    [recipe, recipes, prefs],
  );

  const factor = useMemo(() => {
    if (!baseline) return 1;
    return scaleFactor(scaleMode, Number(scaleValue), baseline, scaleIngredient || undefined);
  }, [baseline, scaleMode, scaleValue, scaleIngredient]);

  const computed = useMemo(
    () => (recipe ? compute(recipe, recipes, { factor, prefs }) : null),
    [recipe, recipes, factor, prefs],
  );

  if (!recipe || !computed || !baseline) {
    return (
      <div className={styles.missing}>
        <p>המתכון הזה לא נמצא במחברת.</p>
        <Link to="/notebook" className={styles.backLink}>
          ← המחברת
        </Link>
      </div>
    );
  }

  // Requirement 8: how much of this calculation is real, before any figure is
  // put on screen.
  const calc = calcState(computed);

  /**
   * A figure that is a sum over the ingredient rows.
   *
   * When nothing could be weighed there is no such figure, so this returns a
   * dash instead of the zero the sum would otherwise produce. When only some
   * rows were weighed the figure is genuine but incomplete, and `ProdBlock`
   * marks it — the notice above the page says by how much.
   */
  const derived = (value: string): string => (calc.level === 'none' ? '—' : value);

  const totalMinutes = (recipe.steps ?? []).reduce((a, s) => a + Number(s.minutes ?? 0), 0);
  const timeLabel =
    totalMinutes >= 60
      ? `${Math.floor(totalMinutes / 60)} שע'${totalMinutes % 60 ? ` ${totalMinutes % 60} דק'` : ''}`
      : `${totalMinutes} דק'`;

  /** What a row shows in the current view mode (§5.4). */
  const rowLabel = (row: ComputedRow): { text: string; hint: string } => {
    if (row.g === null) {
      return { text: '—', hint: 'אין נתון אמין' };
    }
    if (view === 'g' || row.ing.subId) {
      return { text: formatGrams(row.g), hint: '' };
    }
    if (view === 'home') {
      const home = homeMeasure(row.ing, factor, prefs);
      return home?.ok
        ? { text: home.text, hint: formatGrams(row.g) }
        : // §5.4: a row with no reliable data stays in grams and is marked as such
          { text: formatGrams(row.g), hint: 'נשקל בגרם, אין נתון אמין' };
    }
    // "as written": keep the recipe's own unit, scaled
    const qty = Number(row.ing.qty ?? 0) * factor;
    const rounded =
      Math.abs(qty - Math.round(qty)) < 0.01 ? Math.round(qty) : Math.round(qty * 100) / 100;
    const text = `${rounded} ${unitLabel(row.ing.unit)}`;
    const grams = formatGrams(row.g);
    // The gram hint is only worth showing when it adds something. For an
    // ingredient already written in grams it would just repeat the line.
    return { text, hint: text === grams ? '' : grams };
  };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/notebook" className={`${styles.backLink} nowrap`}>
          ← המחברת
        </Link>
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>{recipe.name}</h1>
        <p className={styles.meta}>
          <span className="ltr">
            {computed.unitsActual
              ? `${Math.round(computed.unitsActual)} יחידות`
              : derived(formatGrams(computed.actualYield))}
          </span>
          {Number(recipe.unitWeight) > 0 && (
            <>
              {' · '}
              <span className="ltr">{recipe.unitWeight} גר' ליחידה</span>
            </>
          )}
          {totalMinutes > 0 && (
            <>
              {' · '}
              <span className="ltr">{timeLabel}</span> עבודה ואפייה
            </>
          )}
        </p>
        {recipe.locked && <p className={styles.lockedNote}>נוסחה מאושרת לייצור</p>}
      </header>

      <CalcNotice state={calc} />


      {/* ── §6 scaling ─────────────────────────────────────────────────── */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>כמה להכין</h2>
        <div className={styles.tabs} role="group" aria-label="מצב שינוי כמויות">
          {SCALE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={scaleMode === t.id ? styles.tabOn : styles.tab}
              onClick={() => {
                setScaleMode(t.id);
                setScaleValue('');
              }}
              aria-pressed={scaleMode === t.id}
            >
              {t.label}
            </button>
          ))}
        </div>

        {scaleMode !== 'recipe' && (
          <div className={styles.scaleInputs}>
            <label className="visuallyHidden" htmlFor="scale-value">
              {PLACEHOLDER[scaleMode]}
            </label>
            <input
              id="scale-value"
              className={styles.input}
              inputMode="decimal"
              value={scaleValue}
              onChange={(e) => setScaleValue(e.target.value)}
              placeholder={PLACEHOLDER[scaleMode]}
            />
            {scaleMode === 'stock' && (
              <select
                className={styles.select}
                value={scaleIngredient}
                onChange={(e) => setScaleIngredient(e.target.value)}
                aria-label="לפי איזה רכיב"
              >
                <option value="">בחרו רכיב</option>
                {baseline.rows
                  .filter((r) => r.g !== null)
                  .map((r) => (
                    <option key={r.ing.id} value={r.ing.id}>
                      {r.ing.name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        )}

        <p className={styles.scaleSummary}>
          {factor === 1 ? 'כמו במתכון' : <>מקדם ×<span className="ltr">{factor.toFixed(2)}</span></>}
          {' · '}
          <span className="ltr">{derived(formatGrams(computed.actualYield))}</span>
          {computed.unitsActual > 0 && (
            <>
              {' · '}
              <span className="ltr">{Math.round(computed.unitsActual)}</span> יחידות
            </>
          )}
        </p>
        {computed.unitsWarn && (
          <p className={styles.warn}>⚠ היחידות בפועל חורגות ביותר מ-5% מהיעד</p>
        )}
        {/* §6: the original is never overwritten. Say it, don't imply it. */}
        <p className={styles.calcNote}>
          שינוי הכמויות כאן הוא חישוב בלבד. המתכון המקורי לא משתנה.
        </p>
      </section>

      {/* ── §5.4 ingredient table ──────────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <h2 className={styles.cardTitle}>רכיבים</h2>
          <div className={styles.tabsSmall} role="group" aria-label="תצוגת יחידות">
            {VIEW_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={view === t.id ? styles.tabSmallOn : styles.tabSmall}
                onClick={() => setView(t.id)}
                aria-pressed={view === t.id}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {view !== 'orig' && (
          <p className={styles.viewNote}>
            {view === 'g'
              ? 'תצוגה בגרמים. המתכון המקורי לא השתנה.'
              : 'תצוגה בכלי המדידה שלכם. רכיב שאין לו נתון אמין נשאר בגרמים ומסומן ככזה.'}
          </p>
        )}

        <ul className={styles.ingredients}>
          {computed.rows.map((row) => {
            const { text, hint } = rowLabel(row);
            const unresolved = row.g === null;
            return (
              <li key={row.ing.id ?? row.ing.name}>
                <button
                  type="button"
                  className={styles.ingRow}
                  onClick={() => setConvertIngredient(row.ing)}
                >
                  <span className={unresolved ? styles.qtyMissing : styles.qty}>
                    <span className="ltr">{text}</span>
                    {hint && <span className={styles.qtyHint}>{hint}</span>}
                  </span>
                  <span className={styles.ingName}>
                    {row.ing.name}
                    {row.ing.note && <span className={styles.ingNote}>{row.ing.note}</span>}
                    {unresolved && (
                      <span className={styles.ingUnresolved}>{row.provenance.why}</span>
                    )}
                  </span>
                  {!unresolved && row.provenance.source !== 'exact' && (
                    <SourceBadge provenance={row.provenance} />
                  )}
                  <span className={styles.convertHint}>המר</span>
                </button>
              </li>
            );
          })}
        </ul>

        {computed.unresolved.length > 0 && (
          <p className={styles.unresolvedSummary}>
            {computed.unresolved.length === 1
              ? 'רכיב אחד לא נכנס לסך המשקל ולעלות, כי אין לו נתון צפיפות אמין.'
              : `${computed.unresolved.length} רכיבים לא נכנסו לסך המשקל ולעלות, כי אין להם נתון צפיפות אמין.`}
          </p>
        )}
      </section>

      {/* ── §13 production data, behind the disclosure toggle (§3) ─────── */}
      <section className={styles.card}>
        <button
          type="button"
          className={styles.disclosure}
          onClick={() => setShowProduction((v) => !v)}
          aria-expanded={showProduction}
        >
          {showProduction ? 'סגירת נתוני ייצור' : 'נתוני ייצור ועלויות'}
        </button>

        {showProduction && (
          <div className={styles.prodBlocks}>
            {/*
              Every figure in these three blocks is a sum over the ingredient
              rows, so `partial` marks all of them at once rather than each
              call site having to remember (requirement 8). The two rows that
              are not sums — the food-cost target and the water temperature —
              are excluded below.
            */}
            <ProdBlock
              title="תשואה ופחת"
              partial={calc.partialFigures}
              items={[
                ['תשואה תאורטית', derived(formatGrams(computed.theoretical))],
                ['תשואה מעשית', derived(formatGrams(computed.actualYield))],
                ['פחת ייצור', derived(`${computed.prodLoss.toFixed(1)}%`)],
                ['פחת אפייה', derived(`${computed.bakeLoss.toFixed(1)}%`)],
                [
                  'משקל לשקילה ליחידה',
                  computed.scaleWeight ? derived(formatGrams(computed.scaleWeight)) : '—',
                ],
                [
                  'יחידות בפועל',
                  computed.unitsActual ? derived(computed.unitsActual.toFixed(1)) : '—',
                ],
              ]}
            />
            {pro && (
              <ProdBlock
                title="עלות ותמחור"
                partial={calc.partialFigures}
                exact={['יעד פוד קוסט']}
                items={[
                  ['עלות כוללת', derived(formatNis(computed.cost))],
                  [
                    'עלות ליחידה',
                    computed.costPerUnit ? derived(formatNis(computed.costPerUnit)) : '—',
                  ],
                  ['עלות לק"ג', derived(formatNis(computed.costPerKg))],
                  ['יעד פוד קוסט', `${recipe.targetFC ?? 0}%`],
                  [
                    'מחיר מכירה לפני מע"מ',
                    computed.price ? derived(formatNis(computed.price)) : '—',
                  ],
                ]}
              />
            )}
            {computed.flour > 0 && (
              <ProdBlock
                title="נוסחה"
                partial={calc.partialFigures}
                exact={["טמפ' מים מחושבת"]}
                items={[
                  ['סך קמח', derived(formatGrams(computed.flour))],
                  ['סך נוזלים', derived(formatGrams(computed.liquid))],
                  ['הידרציה', derived(`${computed.hydration.toFixed(1)}%`)],
                  ['הידרציה נטו, מים בפועל', derived(`${computed.trueHydration.toFixed(1)}%`)],
                  ...(computed.waterTemp !== null
                    ? ([['טמפ\' מים מחושבת', `${Math.round(computed.waterTemp)}°C`]] as [
                        string,
                        string,
                      ][])
                    : []),
                ]}
              />
            )}
            {computed.warnings.length > 0 && (
              <div className={styles.warningsBox}>
                <h3 className={styles.warningsTitle}>הנחות שנעשו בחישוב</h3>
                <ul>
                  {computed.warnings.map((w) => (
                    <li key={w}>· {w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── steps ──────────────────────────────────────────────────────── */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>אופן ההכנה</h2>
        <ol className={styles.steps}>
          {(recipe.steps ?? []).map((s, i) => (
            <li key={s.id ?? i} className={styles.step}>
              <span className={styles.stepNum} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.stepBody}>
                <span className={styles.stepText}>{s.text}</span>
                {(s.temp || s.minutes) && (
                  <span className={styles.stepMeta}>
                    {s.temp && <span className="ltr">{s.temp}°C</span>}
                    {s.temp && s.minutes ? ' · ' : ''}
                    {s.minutes && <span className="ltr">{s.minutes} דקות</span>}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {recipe.notes && <p className={styles.recipeNote}>{recipe.notes}</p>}

      <p className={styles.allergens}>
        {computed.allergens.length ? `מכיל: ${computed.allergens.join(' · ')}` : 'לא זוהו אלרגנים'}
      </p>

      {convertIngredient && (
        <ConvertSheet
          ingredient={convertIngredient}
          factor={factor}
          displayGrams={
            computed.rows.find((r) => r.ing.id === convertIngredient.id)?.g ?? null
          }
          prefs={prefs}
          onClose={() => setConvertIngredient(null)}
          onCalibrate={() => setConvertIngredient(null)}
        />
      )}
    </div>
  );
}

/**
 * Requirement 8, at the top of the page: the honest state of the calculation,
 * before any figure derived from it is read.
 */
function CalcNotice({ state }: { state: CalcState }) {
  if (state.level === 'full') return null;
  return (
    <div
      className={state.level === 'none' ? styles.calcNoneBox : styles.calcPartialBox}
      role="status"
      aria-label="שלמות החישוב"
    >
      <p className={styles.calcNoticeTitle}>
        {state.level === 'none' ? 'לא ניתן לחשב' : 'נתונים חלקיים'}
      </p>
      <p className={styles.calcNoticeBody}>{state.summary}</p>
      {state.missingNames.length > 0 && (
        <p className={styles.calcNoticeList}>
          חסרים נתונים עבור: {state.missingNames.join(' · ')}
        </p>
      )}
    </div>
  );
}

function ProdBlock({
  title,
  items,
  partial = false,
  /** rows that are an input, not a sum, so a partial calculation does not touch them */
  exact = [],
}: {
  title: string;
  items: [string, string][];
  partial?: boolean;
  exact?: readonly string[];
}) {
  return (
    <div className={styles.prodBlock}>
      <h3 className={styles.prodTitle}>{title}</h3>
      <dl className={styles.prodRows}>
        {items.map(([k, v]) => {
          const marked = partial && !exact.includes(k) && v !== '—';
          return (
            <div key={k} className={styles.prodRow}>
              <dt>{k}</dt>
              <dd className="ltr">
                {v}
                {marked && (
                  <span className={styles.partialChip} title="מחושב מחלק מהרכיבים בלבד">
                    חלקי
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
