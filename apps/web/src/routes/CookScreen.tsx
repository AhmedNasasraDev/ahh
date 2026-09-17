// §2 screen 7 / §14 — Cook Mode.
//
// One step on the screen, big type on the dark surface, a progress bar of
// segments you can jump with, a completion count, and a timer per step that
// has a duration — all running in parallel, because a bake and a proof do not
// take turns.
//
// WHAT THIS SCREEN IS FOR, WHICH DECIDES EVERY CHOICE IN IT
//
// It is used with flour on your hands, at arm's length, in a room that is too
// warm. So: nothing here scrolls sideways, every control is a big target, the
// step text is 25px and the step number is 54px (§14, and both are already
// tokens in the design system), and the one thing that must never happen is a
// tap that loses your place. Marking a step advances; marking it again undoes
// it. Nothing is saved to the server — §14 holds completion in state, keyed by
// step, and a cooking session is not a document.
//
// WHERE THE PROGRESS LIVES
//
// `offlineMirror` has carried `CookProgress` — a per-step done map, the step
// you were on, keyed by recipe — since stage 3, and nothing ever called it.
// This screen does. It matters in the one situation the screen is for: a
// 90-minute proof means the phone is put down and the app is backgrounded or
// closed, and coming back to a reset checklist is the difference between a
// tool and a toy. It is DEVICE storage, not the account: what you have done so
// far tonight is not a document, and `clearMirror()` on sign-out takes it with
// everything else. "סיום ההכנה" clears it, because the next bake starts fresh.
//
// THE TIMERS ARE THE REASON THIS SCREEN HAS A CLOCK AT ALL
//
// `timers.ts` stores a deadline rather than a countdown, so a phone that went
// to sleep comes back with the right time left. This file only repaints. The
// strip of running timers is visible from EVERY step, not just the one that
// started it, because the whole point of a parallel timer is that you have
// walked away from that step.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { unitLabel } from '@recipe-notebook/engine';
import { useAppData } from '../app/AppDataProvider.js';
import {
  formatClock,
  startTimer,
  toggleTimer,
  viewTimer,
  type TimerState,
} from '../features/cook/timers.js';
import {
  clearCookProgress,
  readCookProgress,
  writeCookProgress,
} from '../data/offlineMirror.js';
import styles from './CookScreen.module.css';

/** How often the clock is repainted. The arithmetic does not depend on it. */
const TICK_MS = 250;

export function CookScreen() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const { recipes, ready } = useAppData();
  const recipe = recipes.find((r) => r.id === recipeId) ?? null;
  const steps = useMemo(() => (recipe?.steps ?? []).filter((s) => s.text || s.minutes), [recipe]);

  const [at, setAt] = useState(0);
  /** §14 `kDone`, keyed by step index for this recipe. */
  const [done, setDone] = useState<ReadonlySet<number>>(() => new Set());
  const [timers, setTimers] = useState<ReadonlyMap<number, TimerState>>(() => new Map());
  const [now, setNow] = useState(() => Date.now());
  /** false until the stored progress has been read, so the first write cannot
      overwrite it with an empty set. */
  const [restored, setRestored] = useState(false);

  // Read the progress for this recipe, once.
  useEffect(() => {
    if (!recipeId) return;
    let cancelled = false;
    void readCookProgress(recipeId)
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          const marked = Object.entries(saved.done)
            .filter(([, v]) => v)
            .map(([k]) => Number(k));
          setDone(new Set(marked));
          setAt(Number.isFinite(saved.step) ? saved.step : 0);
        }
        setRestored(true);
      })
      // Device storage can be blocked (a private window, cleared site data).
      // Cook Mode still works; it just starts from the beginning.
      .catch(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  // Write it back on a real change — not on a timer tick, which happens four
  // times a second and has nothing to do with progress.
  useEffect(() => {
    if (!recipeId || !restored) return;
    const map: Record<number, boolean> = {};
    for (const i of done) map[i] = true;
    void writeCookProgress({ recipeId, done: map, step: at, updatedAt: Date.now() });
  }, [recipeId, restored, done, at]);

  // One interval for the whole screen, and only while something is running.
  const hasTimers = timers.size > 0;
  useEffect(() => {
    if (!hasTimers) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [hasTimers]);

  // Keep the focus where a keyboard user expects it after a jump: on the step
  // itself, not back at the top of the page.
  const stepRef = useRef<HTMLDivElement>(null);

  if (!ready) return null;

  if (!recipe) {
    return (
      <div className={styles.missing}>
        <h1 className={styles.missingTitle}>מצב הכנה</h1>
        <p>המתכון הזה לא נמצא במחברת.</p>
        <Link to="/notebook" className={styles.exit}>
          ← המחברת
        </Link>
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className={styles.missing}>
        <h1 className={styles.missingTitle}>{recipe.name}</h1>
        <p>
          למתכון הזה לא נרשמו שלבי הכנה, ולכן אין מה להציג במצב הכנה. אפשר להוסיף
          שלבים בעריכת המתכון.
        </p>
        <Link to={`/recipe/${recipe.id}/edit`} className={styles.exit}>
          עריכת המתכון
        </Link>
        <Link to={`/recipe/${recipe.id}`} className={styles.exit}>
          ← חזרה למתכון
        </Link>
      </div>
    );
  }

  const index = Math.min(at, steps.length - 1);
  const step = steps[index]!;
  const isLast = index === steps.length - 1;
  const minutes = Number(step.minutes) || 0;

  const toggleDone = (i: number) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
        return next;
      }
      next.add(i);
      // §14: marking advances, except on the last step — where advancing would
      // leave the screen with nowhere to go.
      if (i === index && i < steps.length - 1) setAt(i + 1);
      return next;
    });
  };

  const jump = (i: number) => {
    setAt(i);
    stepRef.current?.focus();
  };

  const running = [...timers.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className={styles.wrap} dir="rtl">
      <header className={styles.head}>
        <Link to={`/recipe/${recipe.id}`} className={`${styles.exit} nowrap`}>
          ← יציאה
        </Link>
        <span className={styles.recipeName}>{recipe.name}</span>
      </header>

      {/* §14 the progress bar: a segment per step, clickable, green when done */}
      <nav className={styles.bar} aria-label="שלבי ההכנה">
        {steps.map((s, i) => (
          <button
            key={s.id ?? i}
            type="button"
            className={[
              styles.seg,
              done.has(i) ? styles.segDone : '',
              i === index ? styles.segNow : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`שלב ${i + 1}${done.has(i) ? ', הושלם' : ''}`}
            aria-current={i === index ? 'step' : undefined}
            onClick={() => jump(i)}
          />
        ))}
      </nav>

      <p className={styles.count} role="status">
        <span className="ltr">{done.size}</span> מתוך{' '}
        <span className="ltr">{steps.length}</span>{' '}
        {steps.length === 1 ? 'שלבים' : 'שלבים'} הושלמו
      </p>

      {/* The step. tabIndex so a jump can put the focus on it. */}
      <div className={styles.stepBox} ref={stepRef} tabIndex={-1}>
        <span className={styles.stepNum} aria-hidden="true">
          {index + 1}
        </span>
        <p className={styles.stepText}>{step.text || 'שלב בלי תיאור'}</p>

        <p className={styles.stepMeta}>
          {step.temp ? (
            <>
              <span className="ltr">
                {step.temp}°{step.tempUnit === 'F' ? 'F' : 'C'}
              </span>
              {minutes > 0 && ' · '}
            </>
          ) : null}
          {minutes > 0 && (
            <>
              <span className="ltr">{minutes}</span> דק&apos;
            </>
          )}
          {step.kind && <> · {KIND_HE[step.kind] ?? ''}</>}
        </p>

        <button
          type="button"
          className={done.has(index) ? styles.markOn : styles.mark}
          aria-pressed={done.has(index)}
          onClick={() => toggleDone(index)}
        >
          {done.has(index) ? 'השלב מסומן כהושלם · ביטול' : 'סימון השלב כהושלם'}
        </button>

        {minutes > 0 && !timers.has(index) && (
          <button
            type="button"
            className={styles.timerStart}
            onClick={() => {
              const t = Date.now();
              // `now` is set from the SAME instant the timer starts. Without
              // this it still holds the mount time until the first tick, which
              // is earlier — so `endsAt - now` exceeded the full duration and a
              // fresh 8-minute timer could read 08:01.
              setNow(t);
              setTimers((prev) => new Map(prev).set(index, startTimer(minutes, t)));
            }}
          >
            הפעלת טיימר ל<span className="ltr">{minutes}</span> דק&apos;
          </button>
        )}
      </div>

      {/* §14 the parallel timers, visible from every step */}
      {running.length > 0 && (
        <section className={styles.timers} aria-label="טיימרים">
          {running.map(([i, t]) => {
            const v = viewTimer(t, now);
            return (
              <div
                key={i}
                className={v.done ? styles.timerDone : styles.timer}
                role={v.done ? 'alert' : 'status'}
              >
                <span className={styles.timerStep}>
                  שלב <span className="ltr">{i + 1}</span>
                </span>
                <span className={`${styles.timerClock} ltr`}>{formatClock(v.leftSec)}</span>
                <span className={styles.timerActions}>
                  {!v.done && (
                    <button
                      type="button"
                      className={styles.timerBtn}
                      onClick={() =>
                        setTimers((prev) => new Map(prev).set(i, toggleTimer(t, Date.now())))
                      }
                      aria-label={`${v.running ? 'עצירת' : 'המשך'} הטיימר של שלב ${i + 1}`}
                    >
                      {v.running ? 'עצירה' : 'המשך'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.timerBtn}
                    onClick={() =>
                      setTimers((prev) => {
                        const next = new Map(prev);
                        next.delete(i);
                        return next;
                      })
                    }
                    aria-label={`מחיקת הטיימר של שלב ${i + 1}`}
                  >
                    מחיקה
                  </button>
                </span>
              </div>
            );
          })}
        </section>
      )}

      {/* The ingredients, because a step that says "add the butter" is not
          enough on its own and leaving the screen to check loses your place. */}
      {(recipe.ingredients ?? []).length > 0 && (
        <details className={styles.ings}>
          <summary className={styles.ingsSummary}>הרכיבים</summary>
          <ul className={styles.ingsList}>
            {(recipe.ingredients ?? []).map((ing, i) => (
              <li key={ing.id ?? i} className={styles.ingRow}>
                <span>{ing.name}</span>
                <span className="ltr">
                  {ing.qty ?? ''} {unitLabel(ing.unit)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <nav className={styles.foot} aria-label="ניווט בין שלבים">
        <button
          type="button"
          className={styles.navBtn}
          disabled={index === 0}
          onClick={() => jump(index - 1)}
        >
          הקודם
        </button>
        {isLast ? (
          <button
            type="button"
            className={styles.finish}
            onClick={() => {
              // The bake is over: the checklist should not greet the next one
              // half-ticked. Navigation does not wait on the write — losing a
              // delete is harmless, and blocking the way out of Cook Mode on
              // device storage is not.
              void clearCookProgress(recipe.id);
              navigate(`/recipe/${recipe.id}`);
            }}
          >
            סיום ההכנה
          </button>
        ) : (
          <button type="button" className={styles.navBtn} onClick={() => jump(index + 1)}>
            הבא
          </button>
        )}
      </nav>
    </div>
  );
}

const KIND_HE: Record<string, string> = {
  active: 'עבודה',
  passive: 'המתנה',
  chill: 'קירור',
  proof: 'התפחה',
  bake: 'אפייה/בישול',
};
