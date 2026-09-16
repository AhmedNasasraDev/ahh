// Browser E2E for the stage-5 surfaces, against the BUILT production bundle.
//
// WHAT THIS DOES AND DOES NOT PROVE — read this before quoting it as evidence.
//
// It runs against a build made with the Supabase env vars BLANK, so the app is
// in its unconfigured mode and the repository is the read-only demo one. That
// is forced, not chosen: this environment's egress policy blocks *.supabase.co,
// so a browser here cannot open a connection to the project. There is NO real
// PostgREST or GoTrue request anywhere in this file, and nothing here should
// ever be presented as proof of the HTTP path.
//
// So the split of evidence for stage 5 is:
//
//   this file            the new UI in a real browser engine, with real layout,
//                        real pointer events, real <select> behaviour and the
//                        minified artifact — on the parts the demo repository
//                        can reach.
//   VersionFlow.test.tsx the whole versioning and sub-recipe route through the
//                        real components and the real repository, against an
//                        in-memory double of the database.
//   version-roundtrip    the snapshot and restore paths against real Postgres,
//                        including atomicity and the null/0 distinctions.
//   rls-isolation.sql    requirement 8 and requirement 15 against real Postgres,
//                        as `authenticated` and as `anon`.
//
// Two things the demo mode genuinely CAN prove, and they are the reason this
// file exists rather than being folded into stage4.mjs:
//
//   1. The sub-recipe picker's choices and rejections. The demo set contains a
//      real link (bחocolate brioche uses the ganache), so the cycle case is
//      reachable: editing the ganache must not offer the brioche that consumes
//      it. That is the client mirror of the 0007 trigger, running in a browser.
//   2. The version history's honest empty state. Without a server there is no
//      history at all, and the panel has to say so rather than render blank or
//      claim "no versions yet".
//
//   PW=/path/to/playwright/index.js node apps/web/e2e/stage5.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = process.env['PW'] ?? '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = (await import(PW)).default ?? (await import(PW));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env['DIST'] ?? path.join(HERE, '..', 'dist-demo');
const OUT = process.env['SHOTS'] ?? path.join(HERE, '..', '..', '..', '.e2e-shots');
fs.mkdirSync(OUT, { recursive: true });

const CHROME =
  process.env['CHROME'] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.join(DIST, url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'text/plain' });
  res.end(fs.readFileSync(file));
});

const results = [];
const check = (label, pass, detail = '') => {
  results.push({ label, pass, detail });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ` -- ${detail}` : ''}`);
};

const finishOnboarding = async (p) => {
  const first = p.locator('button', { hasText: 'מקצועי' }).first();
  if (!(await first.count())) return false;
  await first.click();
  for (let i = 0; i < 8; i += 1) {
    const next = p.locator('button').filter({ hasText: /^(המשך|סיום|למחברת)/ }).first();
    if (!(await next.count())) break;
    await next.click();
    await p.waitForTimeout(150);
  }
  await p.waitForTimeout(400);
  return true;
};

/** Every <option> of a picker, with its label and whether it is selectable. */
const optionsOf = (locator) =>
  locator.evaluate((el) =>
    [...el.options].map((o) => ({ value: o.value, label: o.textContent, disabled: o.disabled })),
  );

await new Promise((r) => server.listen(8124, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox'],
});

try {
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The Google Fonts stylesheet cannot load here: this sandbox's egress proxy
    // presents its own certificate and Chromium rejects it. Environment, not app.
    if (/ERR_CERT_AUTHORITY_INVALID|fonts\.(googleapis|gstatic)\.com/.test(m.text())) return;
    errors.push(`console: ${m.text()}`);
  });

  const external = [];
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (!u.startsWith('http://127.0.0.1:8124') && !u.startsWith('data:') && !u.startsWith('https://fonts.')) {
      external.push(u);
      return route.abort();
    }
    return route.continue();
  });

  await page.goto('http://127.0.0.1:8124/notebook', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  check('the built app boots', await finishOnboarding(page));

  // ── requirements 3-7: the history panel, on a real recipe page ──────────
  await page.goto('http://127.0.0.1:8124/recipe/brioche-choc', { waitUntil: 'load' });
  await page.waitForTimeout(700);

  const history = page.locator('section[aria-label="היסטוריית גרסאות"]');
  check('the recipe page renders the version-history panel', (await history.count()) > 0);

  const historyText = (await history.first().innerText()).replace(/\s+/g, ' ');
  // The live recipe is always in the timeline as "נוכחית" — §9's V1…Vn + current.
  check('the timeline shows the live recipe as the current entry', historyText.includes('נוכחית'));
  // Without a server there is no history AT ALL, and saying "no versions yet"
  // would imply the next save will make one. It will not.
  check(
    'and explains honestly that there is no history without a server',
    /אין עוד היסטוריה/.test(historyText),
    historyText.slice(0, 120),
  );
  check(
    'the panel says why restoring is unavailable rather than hiding it',
    /אין כרגע חיבור/.test(historyText),
  );
  check('no restore button is offered with nothing to restore',
    (await page.getByRole('button', { name: /^שחזור גרסה/ }).count()) === 0);
  await page.screenshot({ path: `${OUT}/10-versions-phone.png`, fullPage: true });

  // The current entry must identify the recipe, not just label it (requirement 4).
  check(
    'the current entry summarises the recipe it describes',
    /רכיבים|רכיב אחד/.test(historyText),
    historyText.slice(0, 160),
  );

  // ── requirements 11-15: the sub-recipe picker, in a real <select> ────────
  // Editing the GANACHE. The chocolate brioche consumes it, so offering that
  // brioche here would close a loop — the client mirror of the 0007 trigger.
  await page.goto('http://127.0.0.1:8124/recipe/ganache/edit', { waitUntil: 'load' });
  await page.waitForTimeout(700);

  const picker = page.locator('select[aria-label^="מתכון בסיס עבור"]').first();
  check('every ingredient row carries a sub-recipe picker', (await picker.count()) > 0);

  // The picker lives inside the row's "more details" disclosure, so a user
  // opens that first. Found here: the disclosure was ALSO collapsed on a row
  // that was already linked, which hid the most consequential field on the row
  // (§18.6 — a linked row is weighed, never volume-converted, and its cost
  // comes from the base). A linked row now opens by default and its summary
  // names the base; both are checked below, on the chocolate brioche.
  await page.locator('summary', { hasText: 'פרטים נוספים' }).first().click();
  await page.waitForTimeout(250);
  check('the picker becomes visible once the row is expanded', await picker.isVisible());

  const opts = await optionsOf(picker);
  const byValue = new Map(opts.map((o) => [o.value, o]));

  check(
    'the picker starts unlinked, with an explicit "not linked" choice',
    opts[0]?.value === '' && /לא מקושר/.test(opts[0]?.label ?? ''),
    opts[0]?.label ?? '(none)',
  );
  // requirement 13
  check(
    'the recipe being edited is not in its own picker',
    !byValue.has('ganache'),
    [...byValue.keys()].join(','),
  );
  // requirement 14, and the reason travels with the option
  const consumer = byValue.get('brioche-choc');
  check(
    'a recipe that would close a cycle is offered but disabled',
    consumer?.disabled === true,
    JSON.stringify(consumer),
  );
  check(
    'and the option itself carries the reason',
    /מעגל/.test(consumer?.label ?? ''),
    consumer?.label ?? '(missing)',
  );
  // requirement 12 — and a usable choice is still usable
  const usable = opts.filter((o) => o.value && !o.disabled);
  check(
    'the other notebook recipes are offered normally',
    usable.length >= 2,
    usable.map((o) => o.value).join(','),
  );
  check(
    'base recipes are marked as such in the list',
    usable.some((o) => /\(בסיס\)/.test(o.label ?? '')),
    usable.map((o) => o.label).join(' | '),
  );
  await page.screenshot({ path: `${OUT}/11-sub-picker-phone.png`, fullPage: true });

  // A real browser select: picking a valid option must stick, and the hint
  // must switch to the linked wording.
  await picker.selectOption(usable[0].value);
  await page.waitForTimeout(300);
  check('selecting a valid base recipe sticks', (await picker.inputValue()) === usable[0].value);
  const linkedHint = await page.locator('select[aria-label^="מתכון בסיס עבור"]').first()
    .evaluate((el) => el.parentElement?.querySelector('p')?.textContent ?? '');
  check(
    'and the hint says the quantity is weighed and the cost rolls up (§18.6)',
    /במשקל/.test(linkedHint) && /מתגלגלת/.test(linkedHint),
    linkedHint.slice(0, 90),
  );

  // Chromium refuses to select a disabled option, which is the point: the
  // invalid choice is not merely discouraged, it is unreachable by pointer.
  let refused = false;
  try {
    await picker.selectOption('brioche-choc', { timeout: 1500 });
  } catch {
    refused = true;
  }
  check(
    'a cycle-creating option cannot be chosen through the UI at all',
    refused && (await picker.inputValue()) !== 'brioche-choc',
    await picker.inputValue(),
  );

  // A row that is ALREADY linked must not hide the fact.
  await page.goto('http://127.0.0.1:8124/recipe/brioche-choc/edit', { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const linkedRow = page.locator('details:has(select[aria-label^="מתכון בסיס עבור"])')
    .filter({ hasText: 'מתכון בסיס:' }).first();
  check(
    'a row that is already linked shows the link while the others stay collapsed',
    (await linkedRow.count()) > 0 && (await linkedRow.evaluate((el) => el.open)) === true,
  );
  const linkedSummary = (await linkedRow.locator('summary').first().innerText()).replace(/\s+/g, ' ');
  check(
    'and the summary names the base recipe, not just its id',
    /מתכון בסיס: גנאש/.test(linkedSummary),
    linkedSummary,
  );
  const linkedPicker = linkedRow.locator('select[aria-label^="מתכון בסיס עבור"]').first();
  check(
    'its picker is visible without any interaction, already holding the link',
    (await linkedPicker.isVisible()) && (await linkedPicker.inputValue()) === 'ganache',
    await linkedPicker.inputValue(),
  );
  await page.screenshot({ path: `${OUT}/14-linked-row-phone.png`, fullPage: true });

  // ── accessibility of the new controls ───────────────────────────────────
  const pickerCount = await page.locator('select[aria-label^="מתכון בסיס עבור"]').count();
  const pickerNames = await page.locator('select[aria-label^="מתכון בסיס עבור"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(
    'each picker has its own accessible name, one per ingredient row',
    new Set(pickerNames).size === pickerCount && pickerCount > 1,
    `${pickerCount} pickers, ${new Set(pickerNames).size} distinct names`,
  );

  const shortPickers = await page.locator('select[aria-label^="מתכון בסיס עבור"]')
    .evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h < 40),
    );
  check('every picker is at least 40px tall', shortPickers.length === 0, shortPickers.join(','));

  const phoneOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check('no horizontal overflow on a phone with the new controls', phoneOverflow <= 1, `${phoneOverflow}px`);

  // ── tablet ──────────────────────────────────────────────────────────────
  const tablet = await browser.newContext({ viewport: { width: 1024, height: 1366 } });
  const tPage = await tablet.newPage();
  tPage.on('pageerror', (e) => errors.push(e.message));
  await tPage.goto('http://127.0.0.1:8124/notebook', { waitUntil: 'load' });
  await tPage.waitForTimeout(700);
  await finishOnboarding(tPage);

  await tPage.goto('http://127.0.0.1:8124/recipe/brioche-choc', { waitUntil: 'load' });
  await tPage.waitForTimeout(700);
  const tHistory = tPage.locator('section[aria-label="היסטוריית גרסאות"]');
  check('the history panel renders on a tablet too', (await tHistory.count()) > 0);
  await tPage.screenshot({ path: `${OUT}/12-versions-tablet.png`, fullPage: true });

  await tPage.goto('http://127.0.0.1:8124/recipe/ganache/edit', { waitUntil: 'load' });
  await tPage.waitForTimeout(700);
  await tPage.screenshot({ path: `${OUT}/13-sub-picker-tablet.png`, fullPage: true });

  const tabletOverflow = await tPage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check('no horizontal overflow on a tablet', tabletOverflow <= 1, `${tabletOverflow}px`);

  check('no page errors anywhere in the run', errors.length === 0, errors.slice(0, 3).join(' | '));
  check(
    'nothing tried to reach an external origin',
    external.length === 0,
    external.slice(0, 3).join(' | '),
  );

  await ctx.close();
  await tablet.close();
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`screenshots in ${OUT}`);
if (failed.length) process.exit(1);
