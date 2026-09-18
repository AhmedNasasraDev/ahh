// Can a conversation actually be held in the artifact?
//
// This drives the PUBLISHED page in Chromium and plays out the scenario that
// was asked for: write as the student, switch, answer as another student,
// answer as the owner, switch back and carry on — then check the behaviours
// the product already has around it (reply, announcement, soft delete, edit,
// the unread line, long and consecutive messages, RTL, scrolling).
//
// It clicks the product's own controls by their own Hebrew labels. Nothing
// here reaches into React state: if a button is not on screen, the check
// fails, which is the point.
//
//   node artifact/scripts/probe-chat.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PW = process.env['PW'] ?? '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = (await import(PW)).default ?? (await import(PW));
const HERE = path.dirname(fileURLToPath(import.meta.url));
/* Both default to the local build, and both can be pointed at the files the
   artifact service actually serves (downloaded with `Artifact action:"read"`),
   so this can check the LIVE page and not only the one on disk:
     PAGE=<dir>/index.html DIST=<dir> node artifact/scripts/<this>.mjs */
const DIST = process.env['DIST'] ?? path.join(HERE, '..', 'dist');
const OUT = path.join(HERE, '..', '..', '.e2e-shots', 'audit');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env['CHROME'] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const PAGE = fs.readFileSync(
  process.env['PAGE'] ?? path.join(HERE, '..', 'app-page.html'),
  'utf8',
);
/* The platform's OWN skeleton, copied verbatim from the published page
   (`Artifact action:"read"` with `path:"index.html"` returns the page as the
   service stores it, wrapper included). It is quoted rather than approximated
   because two of its declarations decide layout here: the safe-area padding on
   `:root`, and `box-sizing: border-box`. */
const HEAD =
  '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';
const WRAPPED = `${HEAD}${PAGE}</body></html>`;

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
await new Promise((r) => server.listen(8144, '127.0.0.1', r));

const results = [];
const check = (l, p, d = '') => {
  results.push({ l, p });
  console.log(`${p ? 'ok  ' : 'FAIL'} ${l}${d ? ` -- ${d}` : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 402, height: 860 } });
await page.route('**/*', (r) =>
  r.request().url().startsWith('http://127.0.0.1:8144') ? r.continue() : r.abort(),
);

/* ── helpers, all of them over the product's own DOM ─────────────────────── */

const CHAT = 'section[aria-label="צ׳אט הקבוצה"]';

/** Every message on screen: who it is from, its text, and how it is drawn. */
const readChat = () =>
  page.evaluate((sel) => {
    const chat = document.querySelector(sel);
    if (!chat) return null;
    const rows = [...chat.querySelectorAll('article')];
    const cls = (el) => el.className;
    return rows.map((r) => ({
      who: r.querySelector('p > span:first-child')?.textContent ?? '',
      text: r.querySelector('p:last-of-type')?.textContent ?? '',
      body: [...r.querySelectorAll('p')].map((p) => p.textContent).join(' | '),
      mine: /mine/.test(cls(r)),
      announcement: /announcement/.test(cls(r)),
      gone: /gone/.test(cls(r)),
      quote: r.querySelector('p[class*="quote"]')?.textContent ?? null,
      edited: /נערכה/.test(r.textContent ?? ''),
      actions: [...r.querySelectorAll('button')].map((b) => b.textContent?.trim()),
    }));
  }, CHAT);

const switchTo = async (label) => {
  await page.click(`[data-artifact-tool="active-sim-user"] button:has-text("${label}")`);
  await page.waitForTimeout(500);
};

const send = async (text) => {
  await page.fill('#chat-draft', text);
  await page.click(`${CHAT} button:has-text("שליחה")`);
  await page.waitForTimeout(400);
};

try {
  /* ── 1. into the group, into the chat ─────────────────────────────────── */
  await page.goto('http://127.0.0.1:8144/index.html#/group/group-course', {
    waitUntil: 'load',
  });
  await page.waitForTimeout(1200);
  await page.click('button[role="tab"]:has-text("צ׳אט")');
  await page.waitForTimeout(700);

  check('the chat opens from the group screen', (await page.$(CHAT)) !== null);

  const bar = await page.evaluate(() => {
    const host = document.querySelector('[data-artifact-tool="active-sim-user"]');
    if (!host) return null;
    const chat = document.querySelector('section[aria-label="צ׳אט הקבוצה"]');
    return {
      caption: host.querySelector('p')?.textContent ?? '',
      people: [...host.querySelectorAll('button')].map((b) => b.textContent?.trim()),
      pressed: [...host.querySelectorAll('button[aria-pressed="true"]')].map((b) =>
        b.textContent?.trim(),
      ),
      aboveTheChat: host.nextElementSibling === chat,
    };
  });
  check('the switcher is above the chat and says what it is', bar?.aboveTheChat === true, bar?.caption);
  check(
    'it offers this group’s four members with the product’s own role labels',
    bar?.people.length === 4 && bar.people.every((p) => / — /.test(p)),
    (bar?.people ?? []).join(' · '),
  );
  check('אחמד is the active person to begin with', bar?.pressed?.[0]?.startsWith('אחמד') === true, bar?.pressed?.join());

  /* ── 2. the student writes ────────────────────────────────────────────── */
  const before = (await readChat()).length;
  await send('לא הבנתי למה בשלב הזה צריך להוסיף את החמאה.');
  let rows = await readChat();
  const ahmed = rows.at(-1);
  check(
    'a typed message appears in the conversation at once',
    rows.length === before + 1 && ahmed.body.includes('להוסיף את החמאה'),
    `${before} → ${rows.length}`,
  );
  check('and it is drawn as the reader’s own message', ahmed.mine === true);
  check('a member has no הכרזה checkbox', (await page.$(`${CHAT} input[type="checkbox"]`)) === null);

  /* ── 3. switch: the same message is now somebody else’s ───────────────── */
  await switchTo('נועה');
  rows = await readChat();
  const asNoa = rows.find((r) => r.body.includes('להוסיף את החמאה'));
  check('after the switch the conversation is still there', rows.length === before + 1, `${rows.length} messages`);
  check('and אחמד’s message is now an incoming message', asNoa?.mine === false);
  check(
    'the unread line is drawn for a person who has not read',
    (await page.$(`${CHAT} p:has-text("הודעות שלא נקראו")`)) !== null,
  );

  /* reply, with the product's own תשובה button on that message */
  await page.evaluate(() => {
    const chat = document.querySelector('section[aria-label="צ׳אט הקבוצה"]');
    const row = [...chat.querySelectorAll('article')].find((r) =>
      (r.textContent ?? '').includes('להוסיף את החמאה'),
    );
    [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'תשובה')?.click();
  });
  await page.waitForTimeout(250);
  check(
    'the composer shows what is being replied to',
    (await page.$(`${CHAT} p:has-text("בתשובה ל")`)) !== null,
  );
  await send('גם אני לא הבנתי, אפשר להסביר?');
  rows = await readChat();
  const noaReply = rows.at(-1);
  check(
    'the reply is sent with the quoted message above it',
    noaReply.mine === true && (noaReply.quote ?? '').includes('להוסיף את החמאה'),
    noaReply.quote ?? 'no quote',
  );

  /* ── 4. the owner answers, and may announce ───────────────────────────── */
  await switchTo('רונן');
  check(
    'rank ≥ 2 gets the הכרזה checkbox — can(role, "announce")',
    (await page.$(`${CHAT} input[type="checkbox"]`)) !== null,
  );
  await send('כן. החמאה נכנסת בשלב הזה בגלל הטמפרטורה של התערובת.');
  rows = await readChat();
  check(
    'the owner’s answer is on the conversation',
    rows.at(-1).body.includes('הטמפרטורה של התערובת') && rows.at(-1).mine === true,
  );

  await page.check(`${CHAT} input[type="checkbox"]`);
  await send('מי שמביא חמאת למינציה — להביא גם מדחום.');
  rows = await readChat();
  check('an announcement is tagged as one', rows.at(-1).announcement === true, rows.at(-1).body);

  /* soft delete of somebody else's message — rank ≥ 2 only */
  const canModerate = await page.evaluate(() => {
    const chat = document.querySelector('section[aria-label="צ׳אט הקבוצה"]');
    const row = [...chat.querySelectorAll('article')].find((r) =>
      (r.textContent ?? '').includes('אפשר להסביר?'),
    );
    const names = [...row.querySelectorAll('button')].map((b) => b.textContent?.trim());
    const del = [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'מחיקה');
    del?.click();
    return { names, clicked: Boolean(del) };
  });
  check('a moderator is offered מחיקה on another member’s message', canModerate.clicked, canModerate.names.join());
  check(
    'but never עריכה on it — the 0033 asymmetry',
    !canModerate.names.includes('עריכה'),
    canModerate.names.join(),
  );
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const box = document.querySelector('section[aria-label="צ׳אט הקבוצה"] div[class*="confirm"]');
    [...box.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'מחיקה')?.click();
  });
  await page.waitForTimeout(600);
  rows = await readChat();
  const tomb = rows.find((r) => r.body.includes('ההודעה נמחקה'));
  check('the deleted message becomes a tombstone with no words left', Boolean(tomb) && tomb.gone === true);
  check(
    'and nothing on screen still carries the removed text',
    !rows.some((r) => r.body.includes('אפשר להסביר?')),
  );

  /* ── 5. back to the first person, and the conversation is intact ──────── */
  await switchTo('אחמד');
  rows = await readChat();
  check(
    'switching back keeps every message written during the session',
    rows.length === before + 4,
    `${rows.length} messages (expected ${before + 4})`,
  );
  check('אחמד’s own message is his again', rows.find((r) => r.body.includes('להוסיף את החמאה'))?.mine === true);
  check(
    'and the owner’s answer is incoming',
    rows.find((r) => r.body.includes('הטמפרטורה של התערובת'))?.mine === false,
  );
  check('a member is not offered הכרזה again', (await page.$(`${CHAT} input[type="checkbox"]`)) === null);
  const onOthers = await page.evaluate(() => {
    const chat = document.querySelector('section[aria-label="צ׳אט הקבוצה"]');
    const row = [...chat.querySelectorAll('article')].find((r) =>
      (r.textContent ?? '').includes('הטמפרטורה של התערובת'),
    );
    return [...row.querySelectorAll('button')].map((b) => b.textContent?.trim());
  });
  check(
    'and has neither עריכה nor מחיקה on the owner’s message',
    !onOthers.includes('עריכה') && !onOthers.includes('מחיקה'),
    onOthers.join(),
  );

  /* ── 6. editing one’s own message ─────────────────────────────────────── */
  await page.evaluate(() => {
    const chat = document.querySelector('section[aria-label="צ׳אט הקבוצה"]');
    const row = [...chat.querySelectorAll('article')].find((r) =>
      (r.textContent ?? '').includes('להוסיף את החמאה'),
    );
    [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'עריכה')?.click();
  });
  await page.waitForTimeout(250);
  const editId = await page.evaluate(() => {
    const t = document.querySelector('section[aria-label="צ׳אט הקבוצה"] textarea[id^="edit-"]');
    return t?.id ?? null;
  });
  check('the message opens for editing in place', editId !== null, editId ?? '');
  await page.fill(`#${editId}`, 'לא הבנתי למה החמאה נכנסת דווקא בשלב הזה.');
  await page.evaluate(() => {
    const box = document.querySelector('section[aria-label="צ׳אט הקבוצה"] div[class*="editor"]');
    [...box.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'שמירה')?.click();
  });
  await page.waitForTimeout(500);
  rows = await readChat();
  const editedRow = rows.find((r) => r.body.includes('דווקא בשלב הזה'));
  check('the edit is saved and marked נערכה', Boolean(editedRow) && editedRow.edited === true);

  /* ── 7. long, consecutive, RTL, scrolling ────────────────────────────── */
  await send(
    'שאלה ארוכה: כשאני מקפל את הבצק בבוקר אחרי לילה במקרר, החמאה יוצאת קשה מדי ' +
      'ונשברת בקיפול הראשון, ואם אני מחכה עשרים דקות הבצק מתחיל לתסוס ואני מאבד ' +
      'את הצורה. מה עושים — מוציאים את החמאה מוקדם יותר, מורידים את טמפרטורת ' +
      'המקרר, או מקפלים בשני שלבים עם מנוחה קצרה ביניהם?',
  );
  await send('ועוד משהו קצר.');
  await send('ועוד אחד, כדי לראות שלוש הודעות רצופות מאותו אדם.');
  await page.waitForTimeout(400);

  const layout = await page.evaluate(() => {
    const chat = document.querySelector('section[aria-label="צ׳אט הקבוצה"]');
    const scroller = chat.querySelector('div[class*="scroll"]');
    const rows = [...chat.querySelectorAll('article')];
    const last3 = rows.slice(-3);
    const wide = rows.filter((r) => r.getBoundingClientRect().width > window.innerWidth + 1);
    return {
      dir: getComputedStyle(chat).direction,
      pageScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      scrollable: scroller.scrollHeight > scroller.clientHeight + 4,
      atBottom:
        Math.abs(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop) < 40,
      overflowing: wide.length,
      consecutiveMine: last3.every((r) => /mine/.test(r.className)),
      total: rows.length,
    };
  });
  check('the chat is right-to-left', layout.dir === 'rtl', layout.dir);
  check('a long message does not widen the screen', layout.overflowing === 0 && layout.pageScroll === 0);
  check('three messages in a row from one person are all drawn as his', layout.consecutiveMine === true);
  check('the conversation scrolls inside its own frame', layout.scrollable === true);
  check('and the newest message is in view', layout.atBottom === true, `${layout.total} messages`);
  check('the page itself still does not scroll', layout.docScroll === 0, `${layout.docScroll}px`);

  /* ── 8. history paging still works over a session-grown conversation ─── */
  const older = await page.$(`${CHAT} button:has-text("הודעות קודמות")`);
  check('no "older messages" button while the whole history fits', older === null);

  /* ── 9. the other group: a different roster and a different rank ─────── */
  /* By clicking, not by changing the hash: a hash-only change does not reload
     the document, so the app would never see it — the first version of this
     probe "found" a bug that was its own. */
  await page.click('nav[aria-label="ניווט ראשי"] a[href="/groups"]');
  await page.waitForTimeout(700);
  await page.click('a[href="/group/group-team"]');
  await page.waitForTimeout(900);
  await page.click('button[role="tab"]:has-text("צ׳אט")');
  await page.waitForTimeout(600);
  const team = await page.evaluate(() => {
    const host = document.querySelector('[data-artifact-tool="active-sim-user"]');
    return [...(host?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim());
  });
  check(
    'the switcher follows the group — three people here, not four',
    team.length === 3 && team.some((t) => t.includes('דנה')),
    team.join(' · '),
  );

  await switchTo('דנה');
  check(
    'an instructor may announce in the group she teaches',
    (await page.$(`${CHAT} input[type="checkbox"]`)) !== null,
  );
  await page.click('nav[aria-label="ניווט ראשי"] a[href="/groups"]');
  await page.waitForTimeout(900);
  const visible = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/group/"]')].map((a) => a.getAttribute('href')),
  );
  check(
    'and sees only the group she is a member of — a non-member sees nothing of the other',
    visible.every((h) => h.includes('group-team')),
    visible.join(' · '),
  );

  await page.screenshot({ path: path.join(OUT, 'chat-simulation.png'), fullPage: false });
} catch (e) {
  check(`the run itself: ${e.message}`, false);
} finally {
  const failed = results.filter((r) => !r.p);
  console.log(`\n${results.length - failed.length}/${results.length} chat checks passed`);
  for (const f of failed) console.log(`  FAILED: ${f.l}`);
  await browser.close();
  server.close();
  process.exitCode = failed.length === 0 ? 0 : 1;
}
