// The "עוד" tab.
//
// Still the honest placeholder from stage 2, with one thing added that stage 3
// requires and that has nowhere else to live: the account block, holding the
// signed-in address and Sign Out. §2 already lists "הגדרות" under this tab, so
// this is filling in a screen rather than redesigning one.

import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { useAppData } from '../app/AppDataProvider.js';
import { NotImplementedScreen } from './NotImplementedScreen.js';
import styles from './MoreScreen.module.css';

export function MoreScreen() {
  const { status, user, signOut } = useAuth();
  const { capabilities } = useAppData();
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

      <NotImplementedScreen screen="עוד" />
    </div>
  );
}
