# artifact/ — AUDIT AND VISUALIZATION ONLY

Everything in this directory exists to LOOK at the product. Nothing in it is
imported by the product, shipped with it, or needed to build it.

**No file under `apps/`, `packages/` or `supabase/` was changed to make this
work.** The one thing outside this directory that changed in the same session is
`.git/config` (the remote was pointed at the renamed GitHub repository, which
was asked for separately). `git log -1 --stat` is the check.

## What is here

| | |
|---|---|
| `index.html` | the **ARTIFACT INSPECTOR** — the audit shell: route rail, width switcher, traceability, and the three reports. Published as an Artifact. |
| `app.html` + `viewer/app.tsx` | the mount point that renders the PRODUCT's own screens, unmodified, with a fixture repository. |
| `viewer/fixtures.ts` | **ARTIFACT FIXTURE — NOT PRODUCTION DATA.** |
| `vite.config.ts` | builds `app.html` → `dist/` (the product's own build config is untouched). |
| `inventory.json` | the audit's single source of data. The reports and the page are both rendered from it. |
| `UI_INVENTORY.md` · `UI_AUDIT.md` · `SPEC_COVERAGE.md` | generated — edit the JSON, not these. |
| `scripts/check-routes.mjs` | fails if the viewer's route table drifts from `apps/web/src/App.tsx`. |
| `scripts/probe.mjs` | opens all 24 routes at 402 / 820 / 1440 in Chromium and records errors and overflow. |
| `scripts/probe-nav.mjs` | clicks the product's own navigation: tabs, cards, group tabs, deep links, four fixture actions. |
| `scripts/probe-inspector.mjs` | drives this page itself, as it is published. |

## Rebuild and re-verify

```bash
node artifact/scripts/check-routes.mjs                 # the viewer still mirrors App.tsx
npx vite build --config artifact/vite.config.ts        # → artifact/dist
node artifact/scripts/report.mjs                       # reports + inject data into index.html
node artifact/scripts/probe.mjs                        # 72 route×width loads
node artifact/scripts/probe-nav.mjs                    # 30 navigation checks
node artifact/scripts/probe-inspector.mjs              # 27 checks on the page itself
```

`artifact/dist/` is not committed (`.gitignore` covers `dist/`).

## What the viewer is, exactly

It renders the product's screens from `apps/web/src/routes/` inside the
product's own `AuthProvider` → `AppDataProvider` → `OnboardingGate` →
`AppShell` stack. Two things differ, both forced, both in the viewer's header:

1. `MemoryRouter` instead of `BrowserRouter` — an artifact page does not own the
   address bar.
2. `AuthProvider` is handed `client={null}` (its existing test seam), so the
   session is 'unconfigured'. Nothing signs in.

The data is the five demo recipes from `apps/web/src/data/demoRecipes.ts`
(product data) plus the fixture layer: groups, chat, invitations, a plan, six
catalog materials. `capabilities()` reports a connected account — the only way
to see the screens as a signed-in user sees them — and the inspector says so on
every screen, because no request leaves the page.

**No Supabase, no auth, no Realtime, no Storage, no email.** An action that
looks like it succeeded succeeded in browser memory. Signed image URLs come
back null, which is a state the gallery already handles.
