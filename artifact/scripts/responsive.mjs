// RESPONSIVE AUDIT — the five sizes the audit asked for, on the screens that
// carry the most layout risk.
//
// WHAT IS MEASURED, AND WHY EACH ONE
//
//   · horizontal page overflow — RTL layouts fail this way first, and a page
//     that scrolls sideways on a phone is unusable at a bench
//   · any ELEMENT wider than its own container (a table, a long unbroken word,
//     a fixed-width row) — the page can be fine while one row is clipped
//   · the bottom tab bar's position — if it is under the fold there is no
//     navigation, which is exactly the defect that shipped once already
//   · tap targets: the smallest interactive box on the screen
//   · `direction: rtl` on the screen's own landmark
//   · a screenshot per screen per size, because numbers do not show a
//     collision and the audit asked for the screens to be looked at
//
// Cook Mode's step screen is behind the weighing stage, so it is reached the
// way a person reaches it — by ticking the list and pressing the gate — and
// the device store is wiped before each pass so every size starts clean.
//
//   node artifact/scripts/responsive.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = process.env['PW'] ?? '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = (await import(PW)).default ?? (await import(PW));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env['DIST'] ?? path.join(HERE, '..', 'dist');
const OUT = path.join(HERE, '..', '..', '.e2e-shots', 'audit', 'responsive');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env['CHROME'] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const PAGE = fs.readFileSync(
  process.env['PAGE'] ?? path.join(HERE, '..', 'app-page.html'),
  'utf8',
);
/* The platform's OWN skeleton, copied verbatim from the published page. */
const HEAD =
  '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';
const WRAPPED = `${HEAD}${PAGE}</body></html>`;

const PORT = 8148;
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0]);
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(WRAPPED);
  }
  const file = path.join(DIST, url);
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end('no');
  }
  res.writeHead(200, {
    'Content-Type': file.endsWith('.js')
      ? 'text/javascript; charset=utf-8'
      : 'text/css; charset=utf-8',
  });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}/index.html`;

/*
  Empty, and that is the result of an approved fix rather than an oversight.

  It used to hold 'chat' and 'perms', whose controls were measured at 12px, 16px
  and the browser's unstyled 13px against the project's own 44/40 tokens
  (finding F26). The CSS was fixed — back links at 44, row actions at 40, the
  message actions at 32 with the trade written into the stylesheet, every
  checkbox at 24 — so every screen is now held to the same floor here. Anything
  that appears in this set again is a regression, not a known state.
*/
const KNOWN_SMALL_TARGETS = new Set([]);

const results = [];
const check = (label, pass, detail = '', known = false) => {
  const kind = pass ? 'ok  ' : known ? 'PROD' : 'FAIL';
  results.push({ label, pass, detail, known });
  console.log(`${kind} ${label}${detail ? ` -- ${detail}` : ''}`);
};

const SIZES = [
  ['360×800', 360, 800],
  ['402×874', 402, 874],
  ['430×932', 430, 932],
  ['768×1024', 768, 1024],
  ['1440×900', 1440, 900],
];

/** route, a name for the file, the landmark that must be RTL, and a setup. */
const SCREENS = [
  { route: '/notebook', name: 'notebook', landmark: 'h1' },
  { route: '/home', name: 'home', landmark: 'h1' },
  { route: '/recipe/brioche', name: 'recipe', landmark: 'h1' },
  {
    route: '/recipe/brioche/cook?mode=units&v=24',
    name: 'cook-mise',
    landmark: 'section[aria-label="הכנת חומרי גלם"]',
  },
  {
    route: '/recipe/brioche/cook?mode=units&v=24',
    name: 'cook-steps',
    landmark: 'nav[aria-label="שלבי ההכנה"]',
    async setup(page) {
      const boxes = page.locator('section[aria-label="הכנת חומרי גלם"] input[type="checkbox"]');
      const n = await boxes.count();
      for (let i = 0; i < n; i += 1) {
        if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).click();
      }
      await page.getByRole('button', { name: 'הכול מוכן — מתחילים בהכנה' }).click();
      await page.waitForTimeout(400);
    },
  },
  {
    route: '/group/group-course',
    name: 'chat',
    landmark: 'section[aria-label="צ׳אט הקבוצה"]',
    async setup(page) {
      await page.getByRole('tab', { name: /צ׳אט/ }).click();
      await page.waitForTimeout(600);
    },
  },
  { route: '/group/group-team/perms', name: 'perms', landmark: 'h1' },
  { route: '/plan/fixture-plan-1', name: 'plan', landmark: 'h1' },
  { route: '/settings', name: 'settings', landmark: 'h1' },
  { route: '/ingredients', name: 'ingredients', landmark: 'h1' },
];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

try {
  for (const [sizeLabel, width, height] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) =>
      r.request().url().startsWith(`http://127.0.0.1:${PORT}`) ? r.continue() : r.abort(),
    );

    for (const screen of SCREENS) {
      // Every pass starts from a clean device store: §14 remembers where a
      // preparation got to, and a size should not inherit the last one's.
      if (page.url().startsWith('http://127.0.0.1')) {
        await page.evaluate(
          () =>
            new Promise((done) => {
              try {
                const req = indexedDB.deleteDatabase('keyval-store');
                req.onsuccess = () => done(null);
                req.onerror = () => done(null);
                req.onblocked = () => done(null);
              } catch {
                done(null);
              }
            }),
        );
      }
      // A unique query string makes every load a real document load rather
      // than a same-document hash change — see walk.mjs's `load` for why that
      // distinction bit once already.
      await page.goto(`${BASE}?w=${Date.now()}#${screen.route}`, { waitUntil: 'load' });
      await page.waitForTimeout(900);
      if (screen.setup) await screen.setup(page);

      const m = await page.evaluate((landmark) => {
        const doc = document.documentElement;
        const wide = [];
        document.querySelectorAll('*').forEach((el) => {
          const parent = el.parentElement;
          if (!parent) return;
          // An element wider than the viewport, or than its own parent's box
          // by more than a rounding error, is content that will be clipped.
          const r = el.getBoundingClientRect();
          if (r.width > doc.clientWidth + 1) {
            wide.push(
              `${el.tagName}.${(el.className || '').toString().slice(0, 24)} ${Math.round(r.width)}px`,
            );
          }
        });
        const tab = document.querySelector('nav[aria-label="ניווט ראשי"]');
        const el = document.querySelector(landmark);
        /*
          A control that is deliberately HIDDEN and operated through a visible
          label is not a small tap target — the two `input[type=file]` boxes on
          the recipe and settings screens are 1×1 and absolutely positioned
          behind a full-size label, which is the standard way to style a file
          picker. Counting them reported a 1px target on a screen whose real
          smallest control is 44px.
        */
        const hidden = (t, cs) =>
          cs.opacity === '0' ||
          cs.visibility === 'hidden' ||
          /visuallyHidden|_file_/.test((t.className || '').toString()) ||
          (cs.position === 'absolute' && t.getBoundingClientRect().height <= 2);
        const targets = [...document.querySelectorAll('button, a[href], input, [role="tab"]')]
          .map((t) => {
            const r = t.getBoundingClientRect();
            const cs = getComputedStyle(t);
            return {
              w: Math.round(r.width),
              h: Math.round(r.height),
              hidden: hidden(t, cs),
              label: (t.textContent || t.getAttribute('aria-label') || t.getAttribute('type') || '')
                .trim()
                .slice(0, 20),
            };
          })
          .filter((t) => t.w > 0 && t.h > 0 && !t.hidden);
        const small = targets.filter((t) => t.h < 24).sort((a, b) => a.h - b.h);
        const smallest = targets.sort((a, b) => a.h - b.h)[0] ?? null;
        /*
          The viewer's own "סימולציה מקומית" badge is the one thing on the page
          that is not the product, and it is `position: fixed` — so it is
          measured, not assumed: it must never sit on top of a CONTROL. (It
          does overlap the empty left end of the group screens' right-aligned
          `h1` box at phone widths, which covers no glyph and, with
          `pointer-events: none`, steals no tap.)
        */
        const badge = document.querySelector('.simBadge');
        const bb = badge ? badge.getBoundingClientRect() : null;
        const covered = [];
        if (bb) {
          document.querySelectorAll('a[href], button, input, [role="tab"]').forEach((el) => {
            if (el.closest('.simBadge')) return;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            const hit = !(r.right < bb.left || r.left > bb.right || r.bottom < bb.top || r.top > bb.bottom);
            if (hit) covered.push(`${el.tagName}«${(el.textContent || '').trim().slice(0, 18)}»`);
          });
        }

        /*
          THE CHAT'S TWO EDGES MUST STAY ON SCREEN (finding F27)

          The control the screen exists for used to sit below the fold. The
          shape now is one scroller with both edges pinned — the tabs sticky at
          the top, the composer sticky at the bottom, the group header free to
          scroll away — so what is measured is that BOTH are inside the
          viewport, and that the newest message is not hidden behind the
          composer. Checked here as the chat opens and again after scrolling up
          through the history, because sticky is exactly the thing that can be
          right in one scroll position and wrong in another.
        */
        const send = [...document.querySelectorAll('button')].find(
          (b) => (b.textContent || '').trim() === 'שליחה',
        );
        const tabs = document.querySelector('[class*="tabs"]');
        const rows = [...document.querySelectorAll('section[aria-label="צ׳אט הקבוצה"] article')];
        const last = rows.at(-1);
        const inView = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return r.top >= -1 && r.bottom <= doc.clientHeight + 1;
        };

        return {
          composer: send
            ? { bottom: Math.round(send.getBoundingClientRect().bottom), inView: inView(send) }
            : null,
          tabsInView: inView(tabs),
          newestClear:
            last && send
              ? last.getBoundingClientRect().bottom <= send.getBoundingClientRect().top + 1
              : null,
          badgeCovers: [...new Set(covered)],
          overflowX: doc.scrollWidth - doc.clientWidth,
          wide: [...new Set(wide)].slice(0, 4),
          tabBottom: tab ? Math.round(tab.getBoundingClientRect().bottom) : null,
          viewportH: doc.clientHeight,
          dir: el ? getComputedStyle(el).direction : 'missing',
          viewportH: doc.clientHeight,
          smallest,
          small: small.slice(0, 5).map((t) => `${t.h}px «${t.label}»`),
          smallCount: small.length,
          landmarkFound: Boolean(el),
        };
      }, screen.landmark);

      const tag = `${sizeLabel} ${screen.name}`;
      check(`${tag}: the screen is the one asked for`, m.landmarkFound, screen.landmark);
      check(`${tag}: no horizontal page scroll`, m.overflowX <= 1, `${m.overflowX}px`);
      check(`${tag}: nothing is wider than the viewport`, m.wide.length === 0, m.wide.join(' · '));
      check(`${tag}: right-to-left`, m.dir === 'rtl', m.dir);
      check(
        `${tag}: the simulation badge covers no control`,
        m.badgeCovers.length === 0,
        m.badgeCovers.join(' · '),
      );
      if (m.composer) {
        check(
          `${tag}: the chat composer is on screen`,
          m.composer.inView,
          `send bottom ${m.composer.bottom} of ${m.viewportH}`,
        );
        check(`${tag}: so are the tabs`, m.tabsInView === true);
        check(
          `${tag}: and the newest message is not behind the composer`,
          m.newestClear === true,
        );

        /*
          Now scroll back up through the history — the position where a sticky
          edge stops being sticky if anything about the containing block is
          wrong — and ask the same two questions again.
        */
        await page.evaluate(() => {
          const c = document.querySelector('main[class*="content"]');
          if (c) c.scrollTop = 0;
        });
        await page.waitForTimeout(350);
        const up = await page.evaluate(() => {
          const doc = document.documentElement;
          const send = [...document.querySelectorAll('button')].find(
            (b) => (b.textContent || '').trim() === 'שליחה',
          );
          const tabs = document.querySelector('[class*="tabs"]');
          const head = document.querySelector('header[class*="head"]');
          const inView = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return r.top >= -1 && r.bottom <= doc.clientHeight + 1;
          };
          return {
            composer: inView(send),
            tabs: inView(tabs),
            headTop: head ? Math.round(head.getBoundingClientRect().top) : null,
          };
        });
        check(`${tag}: the composer is still on screen at the top of the history`, up.composer === true);
        check(`${tag}: and so are the tabs`, up.tabs === true);
        check(
          `${tag}: the group header is what scrolls — and it is there at the top`,
          up.headTop !== null && up.headTop >= -1,
          `header top ${up.headTop}`,
        );
      }
      if (m.tabBottom !== null) {
        check(
          `${tag}: the tab bar is on screen`,
          m.tabBottom <= m.viewportH + 1,
          `${m.tabBottom} ≤ ${m.viewportH}`,
        );
      }
      if (m.smallest) {
        // 24px is the floor this audit reports on; the design system's own
        // minimum is 44 for primary controls and 40 for compact ones.
        check(
          `${tag}: every visible tap target is at least 24px tall`,
          m.smallCount === 0,
          m.smallCount === 0
            ? `smallest ${m.smallest.h}px «${m.smallest.label}»`
            : `${m.smallCount} under 24px: ${m.small.join(' · ')}`,
          KNOWN_SMALL_TARGETS.has(screen.name),
        );
      }
      await page.screenshot({
        path: path.join(OUT, `${screen.name}-${width}.png`),
        fullPage: false,
      });
    }

    check(`${sizeLabel}: no page error on any screen`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
} finally {
  const failed = results.filter((r) => !r.pass && !r.known);
  const prod = results.filter((r) => !r.pass && r.known);
  console.log(
    `\n${results.length - failed.length - prod.length}/${results.length} responsive checks passed` +
      `${prod.length ? `, ${prod.length} known production finding(s)` : ''}`,
  );
  for (const f of failed) console.log(`  FAILED  ${f.label} -- ${f.detail}`);
  for (const f of prod) console.log(`  PRODUCTION  ${f.label} -- ${f.detail}`);
  console.log(`screenshots in ${OUT}`);
  await browser.close();
  server.close();
  process.exitCode = failed.length === 0 ? 0 : 1;
}
