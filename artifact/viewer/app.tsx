/*
  The audit viewer's mount point.

  ─────────────────────────────────────────────────────────────────────────────
  WHAT IT DOES AND DOES NOT DO

  It mounts the PRODUCT's own screens, unmodified, inside the product's own
  provider stack, with the fixture repository from ./fixtures.ts. Every screen
  below is imported from `apps/web/src/routes/`; not one of them is
  reimplemented here, and no product file was touched to make this work.

  TWO DELIBERATE DIFFERENCES FROM `apps/web/src/App.tsx`, BOTH FORCED

  1. `MemoryRouter` instead of `BrowserRouter`. An artifact page does not own
     the address bar, and a `pushState` to `/groups` inside it would produce a
     URL that 404s on reload. The router is the only swapped part; every
     navigation component (`TabBar`, every `Link`, every `navigate()`) is the
     product's own and is exercised as written.

  2. `AuthProvider` is given `client={null}` — its existing test seam — so the
     session status is 'unconfigured', exactly as in a checkout with no
     `.env.local`. Nothing here signs anybody in.

  THE ROUTE TABLE IS CHECKED AGAINST THE PRODUCT'S

  A copied route table can drift from the real one, and a viewer that shows a
  route the product does not have (or misses one it does) is worse than no
  viewer. `../scripts/check-routes.mjs` parses `App.tsx` and this file and
  fails if the two lists disagree. It runs in the build.

  ONE PATH THAT DOES NOT EXIST IN THE PRODUCT, AND IT IS NAMESPACED

  `/__inspector/auth` renders `AuthScreen`, which in production is not a route
  at all: `AuthGate` shows it when the session status is 'signed-out'. It is
  namespaced under `/__inspector/` so it can never be mistaken for a product
  route, and the inspector labels it as a component preview.
*/

import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import { AuthProvider } from '../../apps/web/src/auth/AuthProvider.js';
import { AppDataProvider } from '../../apps/web/src/app/AppDataProvider.js';
import { OnboardingGate } from '../../apps/web/src/app/OnboardingGate.js';
import { AppShell } from '../../apps/web/src/shell/AppShell.js';
import { OnboardingScreen } from '../../apps/web/src/routes/OnboardingScreen.js';
import { NotebookScreen } from '../../apps/web/src/routes/NotebookScreen.js';
import { RecipeScreen } from '../../apps/web/src/routes/RecipeScreen.js';
import { RecipeEditScreen } from '../../apps/web/src/routes/RecipeEditScreen.js';
import { IngredientsScreen } from '../../apps/web/src/routes/IngredientsScreen.js';
import { PlansScreen } from '../../apps/web/src/routes/PlansScreen.js';
import { PlanScreen } from '../../apps/web/src/routes/PlanScreen.js';
import { MoreScreen } from '../../apps/web/src/routes/MoreScreen.js';
import { CookScreen } from '../../apps/web/src/routes/CookScreen.js';
import { LabelScreen } from '../../apps/web/src/routes/LabelScreen.js';
import { OrderScreen } from '../../apps/web/src/routes/OrderScreen.js';
import { PasteScreen } from '../../apps/web/src/routes/PasteScreen.js';
import { HomeScreen } from '../../apps/web/src/routes/HomeScreen.js';
import { SettingsScreen } from '../../apps/web/src/routes/SettingsScreen.js';
import { ToolsScreen } from '../../apps/web/src/routes/ToolsScreen.js';
import { GroupsScreen } from '../../apps/web/src/routes/GroupsScreen.js';
import { GroupScreen } from '../../apps/web/src/routes/GroupScreen.js';
import { PermsScreen } from '../../apps/web/src/routes/PermsScreen.js';
import { GroupRecipeScreen } from '../../apps/web/src/routes/GroupRecipeScreen.js';
import { JoinScreen } from '../../apps/web/src/routes/JoinScreen.js';
import { AuthScreen } from '../../apps/web/src/routes/AuthScreen.js';

import { createViewerRepository, VIEWER_USER_ID } from './fixtures.js';
import '../../apps/web/src/styles/tokens.css';
import '../../apps/web/src/styles/global.css';

/** Tells the inspector where the product navigated, and takes its requests. */
function InspectorBridge() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    window.parent?.postMessage(
      { source: 'recipe-notebook-viewer', type: 'route', path: location.pathname },
      '*',
    );
  }, [location.pathname]);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { target?: string; type?: string; path?: string } | null;
      if (!data || data.target !== 'recipe-notebook-viewer') return;
      if (data.type === 'goto' && typeof data.path === 'string') navigate(data.path);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [navigate]);

  return null;
}

const repository = createViewerRepository();
const initialPath = window.location.hash.replace(/^#/, '') || '/notebook';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider client={null}>
        <AppDataProvider repository={repository} userId={VIEWER_USER_ID}>
          <InspectorBridge />
          <Routes>
            <Route path="/onboarding" element={<OnboardingScreen />} />
            <Route
              element={
                <OnboardingGate>
                  <AppShell />
                </OnboardingGate>
              }
            >
              <Route path="/notebook" element={<NotebookScreen />} />
              <Route path="/paste" element={<PasteScreen />} />
              <Route path="/recipe/new" element={<RecipeEditScreen />} />
              <Route path="/recipe/:recipeId/edit" element={<RecipeEditScreen />} />
              <Route path="/recipe/:recipeId" element={<RecipeScreen />} />
              <Route path="/home" element={<HomeScreen />} />
              <Route path="/groups" element={<GroupsScreen />} />
              <Route path="/group/:groupId" element={<GroupScreen />} />
              <Route path="/group/:groupId/perms" element={<PermsScreen />} />
              <Route path="/group/:groupId/item/:itemId" element={<GroupRecipeScreen />} />
              <Route path="/ingredients" element={<IngredientsScreen />} />
              <Route path="/plans" element={<PlansScreen />} />
              <Route path="/plan/:planId" element={<PlanScreen />} />
              <Route path="/more" element={<MoreScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/tools" element={<ToolsScreen />} />
            </Route>
            <Route
              path="/recipe/:recipeId/cook"
              element={
                <OnboardingGate>
                  <CookScreen />
                </OnboardingGate>
              }
            />
            <Route
              path="/recipe/:recipeId/label"
              element={
                <OnboardingGate>
                  <LabelScreen />
                </OnboardingGate>
              }
            />
            <Route
              path="/recipe/:recipeId/order"
              element={
                <OnboardingGate>
                  <OrderScreen />
                </OnboardingGate>
              }
            />
            <Route
              path="/join/:token"
              element={
                <OnboardingGate>
                  <JoinScreen />
                </OnboardingGate>
              }
            />
            {/* VIEWER ONLY — not a product route. See the header. */}
            <Route path="/__inspector/auth" element={<AuthScreen />} />
            <Route path="*" element={<Navigate to="/notebook" replace />} />
          </Routes>
        </AppDataProvider>
      </AuthProvider>
    </MemoryRouter>
  </StrictMode>,
);
