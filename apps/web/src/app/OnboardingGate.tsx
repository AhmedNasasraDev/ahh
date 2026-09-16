import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppData } from './AppDataProvider.js';

/**
 * §4: the onboarding appears once, when `prefs.done === false`, and can be reset
 * from settings. Everything behind the tab bar waits for it.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { ready, prefs } = useAppData();
  const location = useLocation();

  if (!ready) return null;
  if (prefs.done !== true) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
