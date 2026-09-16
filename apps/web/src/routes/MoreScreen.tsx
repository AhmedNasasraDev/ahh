// The "עוד" tab.
//
// Still the honest placeholder from stage 2, with one thing added that stage 3
// requires and that has nowhere else to live: the account block, holding the
// signed-in address and Sign Out. §2 already lists "הגדרות" under this tab, so
// this is filling in a screen rather than redesigning one.

import { useState } from 'react';
import { toolLabel } from '@recipe-notebook/engine';
import { useAuth } from '../auth/AuthProvider.js';
import { Link } from 'react-router-dom';
import { useAppData } from '../app/AppDataProvider.js';
import { NotImplementedScreen } from './NotImplementedScreen.js';
import styles from './MoreScreen.module.css';

export function MoreScreen() {
  const { status, user, signOut } = useAuth();
  const { capabilities, prefs, setCalibrations } = useAppData();
  const calibrations = prefs.calib ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignOut = async () => {
    setError(null);
    setBusy(true);
    try {
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההתנתקות נכשלה.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <section className={styles.account} aria-label="החשבון שלי">
        <h2 className={styles.accountTitle}>החשבון שלי</h2>

        {status === 'signed-in' && user ? (
          <>
            <p className={styles.email}>
              <span className="ltr">{user.email}</span>
            </p>
            <p className={styles.note}>
              המתכונים, ההערות הפרטיות והכיולים שמורים לחשבון הזה. ההתנתקות גם מוחקת
              את ההעתק המקומי מהמכשיר.
            </p>
            <button
              type="button"
              className={styles.signOut}
              onClick={onSignOut}
              disabled={busy}
            >
              {busy ? 'רגע…' : 'התנתקות'}
            </button>
          </>
        ) : (
          <p className={styles.note}>
            {capabilities.source === 'local-demo'
              ? 'אין חיבור לשרת בהתקנה הזאת, ולכן אין חשבון. מוצגים מתכוני הדמו לקריאה בלבד.'
              : 'לא מחוברים לחשבון.'}
          </p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>

      {/*
        The calibration list. Added in stage 4 because a calibration is the way
        out of a partial calculation, and a WRONG one is worse than none: it
        takes precedence over every table value (§5.1 rank 1) and wears a green
        "personal" badge while doing it. So it has to be visible and removable.
      */}
      <section className={styles.calibSection} aria-label="חומרי גלם ותמחור">
        <h2 className={styles.accountTitle}>חומרי גלם ותמחור</h2>
        <p className={styles.calibNote}>
          המחיר של כל חומר גלם נמצא במקום אחד. שינוי מחיר שם מעדכן את העלות בכל
          המתכונים שמשתמשים בו.
        </p>
        <Link to="/ingredients" className={styles.linkBtn}>
          מרכז חומרי הגלם
        </Link>
      </section>

      <section className={styles.calibSection} aria-label="הכיולים שלי">
        <h2 className={styles.accountTitle}>כלי המדידה שלי</h2>
        <p className={styles.note}>
          כוס <span className="ltr">{prefs.tools?.cup ?? 240}</span> מ&quot;ל · כף{' '}
          <span className="ltr">{prefs.tools?.tbsp ?? 15}</span> מ&quot;ל · כפית{' '}
          <span className="ltr">{prefs.tools?.tsp ?? 5}</span> מ&quot;ל
        </p>

        <h3 className={styles.calibHead}>
          {calibrations.length === 0
            ? 'אין כיולים אישיים'
            : calibrations.length === 1
              ? 'כיול אישי אחד'
              : `${calibrations.length} כיולים אישיים`}
        </h3>

        {calibrations.length === 0 ? (
          <p className={styles.note}>
            כיול אישי נמדד מתוך דף המתכון, על רכיב שאין לו נתון צפיפות אמין. הוא
            מקבל עדיפות על כל נתון בטבלה.
          </p>
        ) : (
          <ul className={styles.calibList}>
            {calibrations.map((c) => (
              <li key={`${c.id}-${c.tool}`} className={styles.calibItem}>
                <span className={styles.calibItemText}>
                  <span className={styles.calibItemName}>{c.name}</span>
                  <span className={styles.calibItemDetail}>
                    {toolLabel(c.tool)} אחת = <span className="ltr">{c.grams}</span> גרם,
                    נמדד בכלי של <span className="ltr">{c.toolMl}</span> מ&quot;ל
                    {c.at ? ` · ${c.at}` : ''}
                    {c.toolMlAssumed && ' · גודל הכלי הונח, כדאי לאמת'}
                  </span>
                </span>
                <button
                  type="button"
                  className={styles.calibRemove}
                  aria-label={`הסרת הכיול של ${c.name} ב${toolLabel(c.tool)}`}
                  onClick={() =>
                    void setCalibrations(
                      calibrations.filter((x) => !(x.id === c.id && x.tool === c.tool)),
                    )
                  }
                >
                  הסרה
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NotImplementedScreen screen="עוד" />
    </div>
  );
}
