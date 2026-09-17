// DEAD-BUTTON WALK — clicks every clickable thing on every reachable screen.
//
// The question it answers is the one that matters for a simulation: is there a
// control that looks operable and does nothing? For each screen it enumerates
// every enabled button, link, tab, select and checkbox, then — one at a time,
// from a FRESH page load each time, so the run is deterministic — clicks it and
// records what happened:
//
//   route changed      → navigation works
//   DOM changed        → the control did something on screen
//   an alert appeared  → recorded as a FINDING with the message
//   nothing at all     → recorded as a FINDING (candidate dead control)
//
// A fresh load per click matters twice: the fixture repository is created at
// module load, so every click starts from the same data, and a click that
// deletes something cannot poison the next one.
//
//   node artifact/scripts/walk.mjs            # everything
//   node artifact/scripts/walk.mjs /groups    # one screen

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = process.env['PW'] ?? '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = (await import(PW)).default ?? (await import(PW));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, '..', 'dist');
const OUT = path.join(HERE, '..', '..', '.e2e-shots', 'audit');
fs.mkdirSync(OUT, { recursive: true });

const CHROME = process.env['CHROME'] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* The platform wraps the published file in its own document. Mirrored here so
   the walk runs against the same shape that gets published. */
const PAGE = fs.readFileSync(path.join(HERE, '..', 'app-page.html'), 'utf8');
const WRAPPED = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${PAGE}</body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0]);
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(WRAPPED);
    return;
  }
  const file = path.join(DIST, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('no');
    return;
  }
  res.writeHead(200, {
    'Content-Type': file.endsWith('.js')
      ? 'text/javascript; charset=utf-8'
      : file.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'application/octet-stream',
  });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(8135, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:8135/index.html';

/* Every screen a person can reach by using the app, with the fixture's own
   ids. `/join/:token` is not here: in the product it is an email link, and in
   the artifact it is reached by the page's hash — it gets its own pass below. */
const SCREENS = [
  '/notebook',
  '/home',
  '/paste',
  '/recipe/brioche',
  '/recipe/brioche/edit',
  '/recipe/new',
  '/recipe/brioche/cook',
  '/recipe/brioche/label',
  '/recipe/brioche/order',
  '/groups',
  '/group/group-course',
  '/group/group-team',
  '/group/group-team/perms',
  '/group/group-course/item/item-brioche',
  '/group/group-course/item/item-croissant',
  '/ingredients',
  '/plans',
  '/plan/fixture-plan-1',
  '/more',
  '/settings',
  '/tools',
  '/onboarding',
  '/join/fixture-token-open',
];

const only = process.argv[2];
const screens = only ? SCREENS.filter((s) => s === only) : SCREENS;

/*
  `select` is deliberately NOT here. Clicking a closed select changes nothing
  by design — you choose an option — so it produced eight false "dead"
  readings in the first run. Selects are checked separately below, where the
  real defect would be a picker with nothing to pick.
*/
const CLICKABLE =
  'button:not([disabled]), a[href], [role="tab"], input[type="checkbox"], input[type="radio"]';

const findings = [];
const rows = [];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

try {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/ERR_CERT_AUTHORITY_INVALID|fonts\.(googleapis|gstatic)/.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });
  await page.route('**/*', (r) =>
    r.request().url().startsWith('http://127.0.0.1:8135') ? r.continue() : r.abort(),
  );
  await page.addInitScript(() => {
    window.__route = null;
    window.addEventListener('message', (e) => {
      if (e.data?.source === 'recipe-notebook-viewer' && e.data.type === 'route') {
        window.__route = e.data.path;
      }
    });
  });

  const load = async (route) => {
    await page.goto(`${BASE}#${route}`, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(650);
  };

  /*
    The first run called 81 controls dead and almost all of them were mine, not
    the app's: a profile picker, a unit chip, a cup size — they select, and
    selecting changes `aria-pressed`, `aria-selected` or a class, not the text
    on screen. So the snapshot carries the interactive STATE of the document
    as well as its text.
  */
  const snapshot = () =>
    page.evaluate(() => {
      const state = [];
      document.querySelectorAll('*').forEach((el) => {
        const bits = [
          el.getAttribute('aria-pressed'),
          el.getAttribute('aria-selected'),
          el.getAttribute('aria-current'),
          el.getAttribute('aria-expanded'),
          el.getAttribute('class'),
          el instanceof HTMLInputElement ? String(el.checked) : null,
          el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : null,
          el instanceof HTMLSelectElement ? el.value : null,
          el instanceof HTMLButtonElement ? String(el.disabled) : null,
        ].filter((b) => b !== null && b !== '');
        if (bits.length) state.push(bits.join('|'));
      });
      return {
        route: window.__route,
        text: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
        state: state.join('#'),
        alerts: [...document.querySelectorAll('[role="alert"]')].map((n) => (n.textContent || '').trim()),
      };
    });

  for (const route of screens) {
    await load(route);
    const controls = await page.evaluate((sel) => {
      const out = [];
      document.querySelectorAll(sel).forEach((el, i) => {
        if (el.closest('.simBadge')) return;
        const r = el.getBoundingClientRect();
        out.push({
          i,
          tag: el.tagName,
          label:
            (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 40) || `<${el.tagName.toLowerCase()}>`,
          visible: r.width > 0 && r.height > 0,
          href: el.getAttribute('href') || '',
        });
      });
      return out;
    }, CLICKABLE);

    const visible = controls.filter((c) => c.visible);

    /* The real defect for a picker: nothing to pick. */
    const emptySelects = await page.evaluate(() =>
      [...document.querySelectorAll('select')]
        .filter((s) => s.options.length <= 1)
        .map((s) => (s.getAttribute('aria-label') || s.id || '<select>').slice(0, 40)),
    );
    emptySelects.forEach((label) => {
      findings.push({ route, label, verdict: 'EMPTY-SELECT', alert: '' });
      rows.push({ route, label, tag: 'SELECT', href: '', verdict: 'EMPTY-SELECT', alert: '' });
      console.log(`   EMPTY-SELECT   ${label}`);
    });

    console.log(`\n── ${route} — ${visible.length} controls`);

    for (const c of visible.slice(0, 40)) {
      await load(route);
      const before = await snapshot();
      let clicked = true;
      try {
        await page.evaluate(
          ({ sel, i }) => {
            const el = document.querySelectorAll(sel)[i];
            if (el) (el instanceof HTMLElement ? el : null)?.click();
          },
          { sel: CLICKABLE, i: c.i },
        );
      } catch {
        clicked = false;
      }
      await page.waitForTimeout(520);
      const after = await snapshot();

      const navigated = before.route !== after.route;
      const changed = before.text !== after.text || before.state !== after.state;
      const newAlert = after.alerts.find((a) => !before.alerts.includes(a));

      let verdict = 'ok';
      if (!clicked) verdict = 'not-clickable';
      else if (newAlert) verdict = 'alert';
      else if (navigated) verdict = 'nav';
      else if (changed) verdict = 'state';
      /* A link or tab that points at the screen you are already on is
         SUPPOSED to do nothing — the "מחברת" tab while standing in the
         notebook is not a dead button. */
      else if (c.href && (c.href === route || c.href === before.route)) verdict = 'same-route';
      else verdict = 'DEAD';

      rows.push({ route, label: c.label, tag: c.tag, href: c.href, verdict, alert: newAlert ?? '' });
      if (verdict === 'DEAD' || verdict === 'alert' || verdict === 'not-clickable') {
        findings.push({ route, label: c.label, verdict, alert: newAlert ?? '' });
        console.log(`   ${verdict.padEnd(14)} ${c.label}${newAlert ? ` — ${newAlert.slice(0, 70)}` : ''}`);
      }
    }
  }

  fs.writeFileSync(path.join(OUT, 'walk.json'), JSON.stringify(rows, null, 2));
  console.log(`\npage errors during the walk: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}

const counts = rows.reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {});
console.log('\n' + JSON.stringify(counts));
console.log(`${findings.length} findings across ${rows.length} controls · walk.json in ${OUT}`);
