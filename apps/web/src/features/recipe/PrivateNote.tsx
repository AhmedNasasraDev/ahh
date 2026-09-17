// §8 — the personal note.
//
// WHAT MAKES THIS DIFFERENT FROM `recipe.notes`, AND WHY IT IS ITS OWN TABLE
//
// `notes` belongs to the recipe and travels with it — into a shared copy, an
// order sheet, a label. A personal note belongs to the ACCOUNT and travels
// nowhere: HANDOFF §3 says no policy, view, RPC or report may let anyone else
// read it, "ללא יוצא מן הכלל", an instructor included. That is why it lives in
// `private_notes` with its own RLS rather than in a column on `recipes`, and
// why the card below says so where the typing happens instead of in a settings
// page nobody opens (§12: "כל מסך שנוגע בפרטיות נושא הסבר קצר במקום שבו
// הפעולה קורית").
//
// THE SAVE, AND THE THREE THINGS IT MUST NOT DO
//
// §8 asks for a 400 ms debounce. The risks a debounce brings are the reason
// most of this file exists:
//   1. it must not claim to have saved before the write returned — the status
//      goes to "נשמר" only after the promise resolves
//   2. it must not lose the last keystroke by unmounting mid-timer — the
//      pending text is flushed on unmount
//   3. it must not report success for a write that failed — a failure is shown,
//      and the text stays in the box so nothing typed is lost

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './recipe.module.css';

export const NOTE_DEBOUNCE_MS = 400;

type Status = 'idle' | 'typing' | 'saving' | 'saved' | 'error';

export interface PrivateNoteProps {
  recipeId: string;
  /** null while loading, '' or the text once known */
  initial: string | null;
  canWrite: boolean;
  onSave(body: string): Promise<void>;
}

export function PrivateNote({ recipeId, initial, canWrite, onSave }: PrivateNoteProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  // What is on screen but not yet written. The ref is what makes the unmount
  // flush possible: an effect cleanup cannot read state from a later render.
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  // A note arriving from the server replaces the box only when the user has
  // not typed since — otherwise a slow read would overwrite live typing.
  useEffect(() => {
    if (initial !== null && pending.current === null) setText(initial);
  }, [initial, recipeId]);

  const write = useCallback(async (body: string) => {
    pending.current = null;
    setStatus('saving');
    setError(null);
    try {
      await saveRef.current(body);
      setStatus('saved');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'שמירת ההערה נכשלה.');
    }
  }, []);

  useEffect(
    () => () => {
      // Unmounting with a timer still running is the normal way to leave this
      // screen: type, then press back. Flush rather than lose it.
      if (timer.current) clearTimeout(timer.current);
      const last = pending.current;
      if (last !== null) void saveRef.current(last).catch(() => undefined);
    },
    [],
  );

  const onChange = (next: string) => {
    setText(next);
    setStatus('typing');
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void write(next), NOTE_DEBOUNCE_MS);
  };

  return (
    <section className={styles.card} aria-label="הערה אישית">
      <h2 className={styles.cardTitle}>ההערה האישית שלי</h2>
      <p className={styles.panNote}>
        ההערה הזאת שמורה לחשבון שלכם בלבד. היא אינה חלק מהמתכון, אינה נוסעת איתו
        בשיתוף, ואינה מופיעה בדף הזמנה או בתווית.
      </p>

      {canWrite ? (
        <>
          <label className="visuallyHidden" htmlFor={`note-${recipeId}`}>
            ההערה האישית שלי
          </label>
          <textarea
            id={`note-${recipeId}`}
            className={styles.noteArea}
            value={text}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            placeholder="מה למדתם על המתכון הזה"
          />
          {/*
            `role="status"` and not `role="alert"`: this is a quiet
            confirmation, and an alert would interrupt a screen reader on every
            pause in typing.
          */}
          <p className={styles.noteStatus} role="status">
            {status === 'typing' && 'מקליד…'}
            {status === 'saving' && 'שומר…'}
            {status === 'saved' && 'נשמר'}
            {status === 'error' && (error ?? 'שמירת ההערה נכשלה.')}
            {status === 'idle' && text !== '' && 'נשמר'}
          </p>
        </>
      ) : (
        <p className={styles.panWhy}>
          הערה אישית נשמרת לחשבון. בהתקנה הזאת אין חיבור לשרת, ולכן אי אפשר
          לשמור אותה.
        </p>
      )}
    </section>
  );
}
