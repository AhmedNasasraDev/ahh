import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppDataProvider } from './app/AppDataProvider.js';
import { OnboardingGate } from './app/OnboardingGate.js';
import { AppShell } from './shell/AppShell.js';
import { OnboardingScreen } from './routes/OnboardingScreen.js';
import { NotebookScreen } from './routes/NotebookScreen.js';
import { RecipeScreen } from './routes/RecipeScreen.js';
import { NotImplementedScreen } from './routes/NotImplementedScreen.js';

/**
 * Routing mirrors spec §2 one screen at a time. `state.screen` in the prototype
 * becomes a URL here, which the product needs anyway: a shareable recipe link,
 * a working back button, and later a group invite token that has to be a link.
 *
 * §2's tabOf() mapping lives in shell/TabBar.tsx.
 */
export function App() {
  return (
    <BrowserRouter>
      <AppDataProvider>
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
            <Route path="/recipe/:recipeId" element={<RecipeScreen />} />
            <Route path="/home" element={<NotImplementedScreen screen="בית" />} />
            <Route path="/groups" element={<NotImplementedScreen screen="קבוצות" />} />
            <Route path="/more" element={<NotImplementedScreen screen="עוד" />} />
          </Route>
          <Route path="*" element={<Navigate to="/notebook" replace />} />
        </Routes>
      </AppDataProvider>
    </BrowserRouter>
  );
}
