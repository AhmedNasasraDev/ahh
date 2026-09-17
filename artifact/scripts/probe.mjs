// AUDIT PROBE — drives the built viewer in a real browser and reports.
//
// It fixes nothing and asserts nothing about what SHOULD be there. It opens
// every route the viewer carries, at the three widths the audit asks for, and
// records what it finds: the heading, whether the page threw, whether anything
// overflowed horizontally, and which routes show an alert. The output is the
// evidence behind the Mobile/Tablet/Desktop columns in UI_AUDIT.md.
//
//   node artifact/scripts/probe.mjs            # all three widths
//   node artifact/scripts/probe.mjs 402        # one width

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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0]);
  let file = path.join(DIST, url === '/' ? '/app.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'app.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'text/plain' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(8131, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:8131/app.html';

/** Every route in the viewer, with the ids the fixture actually carries. */
const ROUTES = [
  ['/home', 'בית'],
  ['/notebook', 'מחברת'],
  ['/paste', 'הדבקה'],
  ['/recipe/brioche', 'מתכון'],
  ['/recipe/brioche/edit', 'עריכת מתכון'],
  ['/recipe/new', 'מתכון חדש'],
  ['/recipe/brioche/cook', 'Cook Mode'],
  ['/recipe/brioche/label', 'תווית'],
  ['/recipe/brioche/order', 'דף הזמנה'],
  ['/groups', 'קבוצות'],
  ['/group/group-course', 'קבוצה (תלמיד)'],
  ['/group/group-team', 'קבוצה (בעלים)'],
  ['/group/group-team/perms', 'הרשאות'],
  ['/group/group-course/item/item-brioche', 'מתכון קבוצתי (שמירה מותרת)'],
  ['/group/group-course/item/item-croissant', 'מתכון קבוצתי (שמירה חסומה)'],
  ['/ingredients', 'חומרי גלם'],
  ['/plans', 'תוכניות ייצור'],
  ['/plan/fixture-plan-1', 'יום ייצור'],
  ['/more', 'עוד'],
  ['/settings', 'הגדרות'],
  ['/tools', 'כלי מדידה'],
  ['/onboarding', 'Onboarding'],
  ['/join/fixture-token-open', 'הזמנה לקבוצה'],
  ['/__inspector/auth', 'AuthScreen (component)'],
];

const WIDTHS = process.argv[2]
  ? [[`w${process.argv[2]}`, Number(process.argv[2]), 900]]
  : [
      ['mobile', 402, 874],
      ['tablet', 820, 1180],
      ['desktop', 1440, 900],
    ];

const rows = [];
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

try {
  for (const [label, width, height] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await page.route('**/*', (route) =>
      route.request().url().startsWith('http://127.0.0.1:8131')
        ? route.continue()
        : route.abort(),
    );

    for (const [route, name] of ROUTES) {
      const errors = [];
      const onError = (e) => errors.push(String(e.message ?? e));
      const onConsole = (m) => {
        if (m.type() !== 'error') return;
        if (/ERR_CERT_AUTHORITY_INVALID|fonts\.(googleapis|gstatic)/.test(m.text())) return;
        errors.push(`console: ${m.text()}`);
      };
      page.on('pageerror', onError);
      page.on('console', onConsole);

      await page.goto(`${BASE}#${route}`, { waitUntil: 'load' });
      // A hash change alone does not remount; a reload after setting it does.
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(700);

      const found = await page.evaluate(() => {
        const h = document.querySelector('h1, h2');
        const alerts = [...document.querySelectorAll('[role="alert"]')].map((n) =>
          (n.textContent ?? '').trim().slice(0, 70),
        );
        const statuses = [...document.querySelectorAll('[role="status"]')].map((n) =>
          (n.textContent ?? '').trim().slice(0, 70),
        );
        return {
          heading: (h?.textContent ?? '').trim().slice(0, 40),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          alerts,
          statuses,
          nodes: document.querySelectorAll('*').length,
        };
      });

      rows.push({ width: label, route, name, ...found, errors });
      const safe = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
      await page.screenshot({ path: path.join(OUT, `${label}-${safe}.png`), fullPage: true });

      page.off('pageerror', onError);
      page.off('console', onConsole);
    }

    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(rows, null, 2));

const bad = rows.filter((r) => r.errors.length > 0 || r.overflow > 1);
console.log(`${rows.length} route/width pairs opened, ${bad.length} with a finding`);
for (const r of bad) {
  console.log(
    `FINDING ${r.width} ${r.route} overflow=${r.overflow}px ${r.errors.slice(0, 2).join(' | ')}`,
  );
}
console.log('\nheadings seen (mobile):');
for (const r of rows.filter((x) => x.width === 'mobile' || x.width.startsWith('w'))) {
  console.log(
    `  ${r.route.padEnd(46)} ${String(r.heading).padEnd(26)} nodes=${r.nodes} ` +
      `${r.alerts.length ? `alert="${r.alerts[0]}"` : ''}`,
  );
}
console.log(`\nscreenshots + probe.json in ${OUT}`);
