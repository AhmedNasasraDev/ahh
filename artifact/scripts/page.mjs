// Builds the page that gets PUBLISHED as the artifact: the app itself.
//
// The artifact platform wraps the published file in its own
// <!doctype>/<html>/<head>/<body>, so the page cannot be a whole document —
// and the Vite build emits a whole document. This turns one into the other,
// from the build output, so the hashed asset names can never drift:
//
//   · <title> and the Google Fonts links are the product's own, copied from
//     apps/web/index.html — the §16 typefaces are part of the design.
//   · `dir="rtl"` and `lang="he"` are set on the root element, because in the
//     product those live on <html> in that same file, and the platform owns
//     <html> here.
//   · the built CSS is INLINED rather than linked: one less same-origin fetch
//     to depend on inside the artifact sandbox.
//   · the JS stays a published file, which is how a multi-file artifact works.
//
// The only thing added that the product does not have is one fixed, 11px,
// pointer-events:none badge reading "סימולציה מקומית". It takes no layout
// space and can never intercept a click, and it is there because an app whose
// writes go nowhere must say so somewhere.
//
//   node artifact/scripts/page.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const built = readFileSync(at('../dist/app.html'), 'utf8');
const js = built.match(/src="\.\/(assets\/[^"]+\.js)"/)?.[1];
const css = built.match(/href="\.\/(assets\/[^"]+\.css)"/)?.[1];
if (!js || !css) {
  console.error('could not find the built asset names in artifact/dist/app.html');
  process.exit(1);
}
const cssText = readFileSync(at(`../dist/${css}`), 'utf8');

const productHtml = readFileSync(at('../../apps/web/index.html'), 'utf8');
const fonts = productHtml
  .split('\n')
  .filter((l) => l.includes('fonts.g'))
  .join('\n')
  .trim();

const page = `<title>מחברת מתכונים</title>
${fonts}
<style>
/* ── the host page, not the product ────────────────────────────────────────
   Three rules and a badge. Everything else on this page is the product's own
   stylesheet, inlined below exactly as the build emitted it. */
html, body { height: 100%; margin: 0; }
#root { min-height: 100%; }

.simBadge {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9;
  /* Cannot intercept a tap, ever. */
  pointer-events: none;
  padding: 2px 7px;
  border-end-end-radius: 6px;
  background: rgba(23, 26, 24, 0.55);
  color: #fff;
  font: 500 10px/1.4 'Heebo', system-ui, sans-serif;
  letter-spacing: 0.02em;
  opacity: 0.75;
}
@media print { .simBadge { display: none; } }

/* ── the product's built stylesheet, verbatim ─────────────────────────── */
${cssText}
</style>
<script>
  /* In the product these two attributes sit on <html> in apps/web/index.html.
     The platform owns <html> here, so they are set at boot instead. */
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'he');
</script>
<span class="simBadge" title="Backend מדומה. הנתונים והפעולות מקומיים לדפדפן הזה ואינם נשמרים בשרת.">סימולציה מקומית</span>
<div id="root"></div>
<script type="module" src="./${js}"></script>
`;

writeFileSync(at('../app-page.html'), page);
console.log(
  `artifact/app-page.html written — ${(page.length / 1024).toFixed(0)}KB ` +
    `(css inlined), script ./${js}`,
);
