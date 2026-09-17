import { NavLink, useLocation } from 'react-router-dom';
import styles from './TabBar.module.css';

/**
 * §2: four tabs — בית · מחברת · קבוצות · עוד — and `tabOf()`, which maps a deep
 * screen back to the tab it belongs to.
 *
 * Only מחברת is implemented in this stage. The other three are shown as
 * explicitly pending rather than as working links: a tab that silently does
 * nothing is the shape of dishonesty that AC #17 rules out.
 */
interface TabDef {
  to: string;
  label: string;
  /** which screens count as inside this tab (§2 tabOf) */
  owns: string[];
  ready: boolean;
}

const TABS: readonly TabDef[] = [
  { to: '/home', label: 'בית', owns: ['/home'], ready: false },
  { to: '/notebook', label: 'מחברת', owns: ['/notebook', '/recipe'], ready: true },
  { to: '/groups', label: 'קבוצות', owns: ['/groups', '/group', '/perms'], ready: false },
  {
    to: '/more',
    label: 'עוד',
    // `/ingredients` is owned here because the centre is reached from "עוד",
    // so the tab must stay lit while the user is in it.
    //
    // STAGE-10 AUDIT FIX: `/plans` was missing. `tabOf` matches a path exactly
    // or as a `${p}/` prefix, so `/plan/:id` matched `/plan` but the LIST at
    // `/plans` matched nothing and fell through to the notebook — the bottom
    // bar told a user standing in their production plans that they were in the
    // notebook. Found by comparing the screenshots of the two routes.
    owns: ['/more', '/settings', '/tools', '/plan', '/plans', '/stock', '/ingredients'],
    // STAGE-11: was `false` — and had been since stage 2, while the tab had
    // grown the ingredient centre, the production plans, the settings and the
    // measuring tools underneath it. A tab marked "בהכנה" that leads to four
    // working screens is the same dishonesty as the reverse, pointing the
    // other way.
    ready: true,
  },
];

/** §2 tabOf(): a deep screen highlights the tab that owns it. */
export function tabOf(pathname: string): string {
  const hit = TABS.find((t) => t.owns.some((p) => pathname === p || pathname.startsWith(`${p}/`)));
  return hit?.to ?? '/notebook';
}

export function TabBar() {
  const { pathname } = useLocation();
  const current = tabOf(pathname);

  return (
    <nav className={styles.bar} aria-label="ניווט ראשי">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={[
            styles.tab,
            current === tab.to ? styles.active : '',
            tab.ready ? '' : styles.pending,
          ]
            .filter(Boolean)
            .join(' ')}
          aria-current={current === tab.to ? 'page' : undefined}
        >
          <span>{tab.label}</span>
          {!tab.ready && <span className={styles.pendingHint}>בהכנה</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export { TABS as TAB_DEFS };
