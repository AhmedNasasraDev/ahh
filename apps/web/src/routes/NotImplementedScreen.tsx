import styles from './NotImplementedScreen.module.css';

/**
 * An honest placeholder. §17 and AC #17: a screen must never look connected or
 * finished when it is not. Saying "this is not built yet, and here is what it
 * will hold" is better than an empty screen that reads like a bug.
 */
export function NotImplementedScreen({ screen }: { screen: string }) {
  const planned: Record<string, string[]> = {
    בית: ['קטגוריות', 'המתכון האחרון', 'מתכוני בסיס לפי עלות לק"ג'],
    קבוצות: [
      'קבוצות פרטיות, קורסים ושיעורים',
      'הרשאות פר־מתכון ואכיפה בשרת',
      'דורש חשבונות, חברות ו-RLS — ולכן שלב מאוחר יותר',
    ],
    עוד: ['יום ייצור', 'רכש ומלאי', 'כלי המדידה שלי וכיול אישי', 'הגדרות'],
  };

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>{screen}</h1>
      <p className={styles.body}>
        המסך הזה עוד לא נבנה. בשלב הזה מומשו שאלות הפתיחה, המחברת ודף המתכון.
      </p>
      <ul className={styles.list}>
        {(planned[screen] ?? []).map((item) => (
          <li key={item}>· {item}</li>
        ))}
      </ul>
    </div>
  );
}
