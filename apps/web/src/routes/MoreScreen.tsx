// The "עוד" tab — §2 screen 19: "תפריט: יום ייצור, רכש, כלי מדידה, הגדרות".
//
// WHAT THIS SCREEN USED TO BE, AND WHY IT CHANGED
//
// It was a half-menu with the account block, the ingredient centre and the
// production plans on it, and then — at the bottom of the same screen — a
// placeholder announcing that "יום ייצור, רכש ומלאי, כלי המדידה שלי, הגדרות"
// were not built yet. Three of those four were linked immediately above it.
// The screen contradicted itself, which is worse than either being honest or
// being finished.
//
// It is now what §2 says it is: a menu, four entries, every one of them a
// screen that exists. The account block and the calibration list moved to the
// screens §2 assigns them to — הגדרות and כלי המדידה שלי — so each thing has
// one home instead of being wherever there was room.

import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';
import { useAppData } from '../app/AppDataProvider.js';
import styles from './MoreScreen.module.css';

interface Entry {
  to: string;
  title: string;
  body: string;
}

const ENTRIES: readonly Entry[] = [
  {
    to: '/ingredients',
    title: 'חומרי גלם ומחירים',
    body: 'המחיר של כל חומר גלם נמצא במקום אחד. שינוי מחיר שם מעדכן את העלות בכל המתכונים שמשתמשים בו.',
  },
  {
    to: '/plans',
    title: 'תכנון ייצור ורכש',
    body: 'מגדירים מה מייצרים ובאיזו כמות, והמערכת מחשבת מהמתכונים כמה חומר גלם צריך, מה לקנות, כמה זה צפוי לעלות ומתי להתחיל לעבוד.',
  },
  {
    to: '/tools',
    title: 'כלי המדידה שלי',
    body: 'גודל הכוס, הכף והכפית שלכם, והכיולים האישיים. כל המרה בין נפח למשקל נעשית לפי מה שמוגדר כאן.',
  },
  {
    to: '/settings',
    title: 'הגדרות',
    body: 'פרופיל, יחידות מדידה, שפה, פרטיות, שאלות הפתיחה והחשבון.',
  },
];

export function MoreScreen() {
  const { status, user } = useAuth();
  const { capabilities } = useAppData();

  return (
    <div className={styles.wrap}>
      <header className={styles.account}>
        <h1 className={styles.accountTitle}>עוד</h1>
        {status === 'signed-in' && user ? (
          <p className={styles.note}>
            מחוברים כ־<span className="ltr">{user.email}</span>. ניהול החשבון
            והסיסמה נמצא ב<Link to="/settings">הגדרות</Link>.
          </p>
        ) : (
          <p className={styles.note}>
            {capabilities.source === 'local-demo'
              ? 'אין חיבור לשרת בהתקנה הזאת, ולכן אין חשבון. מוצגים מתכוני הדמו לקריאה בלבד.'
              : 'לא מחוברים לחשבון.'}
          </p>
        )}
      </header>

      <nav className={styles.menu} aria-label="תפריט עוד">
        {ENTRIES.map((e) => (
          <Link key={e.to} to={e.to} className={styles.entry}>
            <span className={styles.entryTitle}>{e.title}</span>
            <span className={styles.entryBody}>{e.body}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
