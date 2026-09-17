// §14 Cook Mode.
//
// The arithmetic of the timers is tested in `features/cook/timers.test.ts`.
// What is tested here is the screen: that marking a step advances and undoes,
// that the bar can be jumped, that a timer started on one step is visible from
// another — which is the whole point of a parallel timer — and that a recipe
// with no steps says so instead of opening an empty dark screen.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryIdb, resetMemoryIdb } from '../test/memoryIdb.js';

// Cook Mode keeps its progress in the device mirror, which is idb-keyval.
vi.mock('idb-keyval', () => memoryIdb());

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { defaultPrefs, type Recipe } from '@recipe-notebook/engine';
import { CookScreen } from './CookScreen.js';
import { AppDataProvider } from '../app/AppDataProvider.js';
import { fakeRepository } from '../test/render.js';

beforeEach(() => {
  resetMemoryIdb();
});

const BREAD: Recipe = {
  id: 'bread',
  name: 'לחם כפרי',
  category: 'לחמים',
  ingredients: [
    { id: 'i1', name: 'קמח לחם', qty: 1000, unit: 'g', flour: true },
    { id: 'i2', name: 'מים', qty: 700, unit: 'g', liquid: true },
  ],
  steps: [
    { id: 's1', text: 'לשים 8 דקות', minutes: 8, kind: 'active' },
    { id: 's2', text: 'תפיחה ראשונה', minutes: 90, kind: 'proof' },
    { id: 's3', text: 'אפייה', minutes: 40, temp: 230, kind: 'bake' },
  ],
} as unknown as Recipe;

function show(recipe: Recipe = BREAD) {
  return render(
    <MemoryRouter initialEntries={[`/recipe/${recipe.id}/cook`]}>
      <AppDataProvider repository={fakeRepository({
        prefs: { ...defaultPrefs('pro'), done: true },
        recipes: [recipe],
      })}
      >
        <Routes>
          <Route path="/recipe/:recipeId/cook" element={<CookScreen />} />
          <Route path="/recipe/:recipeId" element={<p>דף המתכון</p>} />
          <Route path="/notebook" element={<p>המחברת</p>} />
        </Routes>
      </AppDataProvider>
    </MemoryRouter>,
  );
}

describe('§14 one step at a time', () => {
  it('opens on the first step, with its number, text and timing', async () => {
    show();
    expect(await screen.findByText('לשים 8 דקות')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 מתוך 3');
  });

  it('marks a step as done and advances, which is §14\'s rule', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('לשים 8 דקות');

    await user.click(screen.getByRole('button', { name: 'סימון השלב כהושלם' }));
    expect(await screen.findByText('תפיחה ראשונה')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 מתוך 3');
  });

  it('un-marks on a second press, and does not move', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('לשים 8 דקות');

    // Mark step 1 (advances to 2), jump back, press again.
    await user.click(screen.getByRole('button', { name: 'סימון השלב כהושלם' }));
    await user.click(screen.getByRole('button', { name: 'שלב 1, הושלם' }));
    await user.click(
      screen.getByRole('button', { name: 'השלב מסומן כהושלם · ביטול' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('0 מתוך 3');
    expect(screen.getByText('לשים 8 דקות')).toBeInTheDocument();
  });

  it('does not advance off the end when the LAST step is marked', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('לשים 8 דקות');
    await user.click(screen.getByRole('button', { name: 'שלב 3' }));
    await user.click(screen.getByRole('button', { name: 'סימון השלב כהושלם' }));

    expect(screen.getByText('אפייה')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 מתוך 3');
  });

  it('jumps straight to a step from the progress bar (§14)', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('לשים 8 דקות');
    await user.click(screen.getByRole('button', { name: 'שלב 3' }));
    expect(screen.getByText('אפייה')).toBeInTheDocument();
    expect(screen.getByText('230°C')).toBeInTheDocument();
  });

  it('offers "סיום ההכנה" on the last step and nowhere else', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('לשים 8 דקות');
    expect(screen.queryByRole('button', { name: 'סיום ההכנה' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'שלב 3' }));
    expect(screen.getByRole('button', { name: 'סיום ההכנה' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'הבא' })).not.toBeInTheDocument();
  });

  it('disables "הקודם" on the first step rather than hiding it', async () => {
    show();
    await screen.findByText('לשים 8 דקות');
    expect(screen.getByRole('button', { name: 'הקודם' })).toBeDisabled();
  });

  it('keeps the ingredients one tap away, so checking does not lose your place', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByText('הרכיבים'));
    expect(screen.getByText('קמח לחם')).toBeInTheDocument();
    // Still on the same step.
    expect(screen.getByText('לשים 8 דקות')).toBeInTheDocument();
  });
});

describe('§14 the parallel timers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

  it('starts a timer for the step, from the step', async () => {
    const u = user();
    show();
    await screen.findByText('לשים 8 דקות');
    await u.click(screen.getByRole('button', { name: /הפעלת טיימר/ }));

    const timers = screen.getByRole('region', { name: 'טיימרים' });
    expect(timers).toHaveTextContent('08:00');
  });

  it('is still visible from ANOTHER step, which is what parallel means', async () => {
    const u = user();
    show();
    await screen.findByText('לשים 8 דקות');
    await u.click(screen.getByRole('button', { name: /הפעלת טיימר/ }));
    await u.click(screen.getByRole('button', { name: 'שלב 3' }));

    expect(screen.getByText('אפייה')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'טיימרים' })).toHaveTextContent('שלב 1');
  });

  it('runs two at once, each with its own clock', async () => {
    const u = user();
    show();
    await screen.findByText('לשים 8 דקות');
    await u.click(screen.getByRole('button', { name: /הפעלת טיימר/ }));
    await u.click(screen.getByRole('button', { name: 'שלב 2' }));
    await u.click(screen.getByRole('button', { name: /הפעלת טיימר/ }));

    const timers = screen.getByRole('region', { name: 'טיימרים' });
    expect(timers).toHaveTextContent('08:00');
    expect(timers).toHaveTextContent('1:30:00');
  });

  it('counts down in real time, and turns into an alert at zero', async () => {
    const u = user();
    show();
    await screen.findByText('לשים 8 דקות');
    await u.click(screen.getByRole('button', { name: /הפעלת טיימר/ }));

    vi.advanceTimersByTime(7 * 60_000);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'טיימרים' })).toHaveTextContent('01:00'),
    );

    // §14 marks a finished timer in red; `role="alert"` is the same statement
    // to a screen reader, which cannot see red.
    vi.advanceTimersByTime(65_000);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('00:00'));
  });

  it('pauses and resumes', async () => {
    const u = user();
    show();
    await screen.findByText('לשים 8 דקות');
    await u.click(screen.getByRole('button', { name: /הפעלת טיימר/ }));

    vi.advanceTimersByTime(60_000);
    await u.click(screen.getByRole('button', { name: 'עצירת הטיימר של שלב 1' }));
    const frozen = screen.getByRole('region', { name: 'טיימרים' }).textContent ?? '';
    expect(frozen).toContain('07:00');

    vi.advanceTimersByTime(5 * 60_000);
    expect(screen.getByRole('region', { name: 'טיימרים' })).toHaveTextContent('07:00');

    await u.click(screen.getByRole('button', { name: 'המשך הטיימר של שלב 1' }));
    vi.advanceTimersByTime(60_000);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'טיימרים' })).toHaveTextContent('06:00'),
    );
  });

  it('deletes one', async () => {
    const u = user();
    show();
    await screen.findByText('לשים 8 דקות');
    await u.click(screen.getByRole('button', { name: /הפעלת טיימר/ }));
    await u.click(screen.getByRole('button', { name: 'מחיקת הטיימר של שלב 1' }));

    expect(screen.queryByRole('region', { name: 'טיימרים' })).not.toBeInTheDocument();
    // And the step offers to start it again.
    expect(screen.getByRole('button', { name: /הפעלת טיימר/ })).toBeInTheDocument();
  });
});

describe('§17 a screen that cannot do its job says so', () => {
  it('explains a recipe with no steps, and offers the editor', async () => {
    const noSteps = { ...BREAD, steps: [] } as unknown as Recipe;
    show(noSteps);
    expect(await screen.findByText(/לא נרשמו שלבי הכנה/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'עריכת המתכון' })).toBeInTheDocument();
  });

  it('explains a recipe id that is not in the notebook', async () => {
    // The URL has to name an id the repository does NOT hold — passing a
    // renamed recipe to `show` also renames the route, and the first version
    // of this test found the recipe it was supposed to be missing.
    render(
      <MemoryRouter initialEntries={['/recipe/no-such-recipe/cook']}>
        <AppDataProvider repository={fakeRepository({
          prefs: { ...defaultPrefs('pro'), done: true },
          recipes: [BREAD],
        })}
        >
          <Routes>
            <Route path="/recipe/:recipeId/cook" element={<CookScreen />} />
            <Route path="/notebook" element={<p>המחברת</p>} />
          </Routes>
        </AppDataProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('המתכון הזה לא נמצא במחברת.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'מצב הכנה' })).toBeInTheDocument();
  });

  it('shows a step with no text as a step rather than as a blank', async () => {
    const odd = {
      ...BREAD,
      steps: [{ id: 's1', minutes: 30, kind: 'chill' }],
    } as unknown as Recipe;
    show(odd);
    expect(await screen.findByText('שלב בלי תיאור')).toBeInTheDocument();
    expect(screen.getByText(/קירור/)).toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// §14 progress that survives the app being closed.
//
// `CookProgress` had been sitting in `offlineMirror` since stage 3 with no
// caller. It matters in exactly the situation Cook Mode exists for: a
// 90-minute proof means the phone goes in a pocket, and coming back to a reset
// checklist is the difference between a tool and a toy.
describe('§14 the progress is remembered on the device', () => {
  it('comes back to the step you were on, with the ticks you made', async () => {
    const user = userEvent.setup();
    const first = show();
    await screen.findByText('לשים 8 דקות');

    // Tick step 1 — which advances to step 2 — then leave.
    await user.click(screen.getByRole('button', { name: 'סימון השלב כהושלם' }));
    await screen.findByText('תפיחה ראשונה');
    first.unmount();

    // Reopening is what a backgrounded app coming back really is.
    show();
    expect(await screen.findByText('תפיחה ראשונה')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('1 מתוך 3'),
    );
  });

  it('starts clean after "סיום ההכנה", because the next bake is a new one', async () => {
    const user = userEvent.setup();
    const first = show();
    await screen.findByText('לשים 8 דקות');
    await user.click(screen.getByRole('button', { name: 'סימון השלב כהושלם' }));
    await user.click(screen.getByRole('button', { name: 'שלב 3' }));
    await user.click(screen.getByRole('button', { name: 'סיום ההכנה' }));
    await screen.findByText('דף המתכון');
    first.unmount();

    show();
    await screen.findByText('לשים 8 דקות');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('0 מתוך 3'),
    );
  });

  it('keeps each recipe\'s progress to itself', async () => {
    const user = userEvent.setup();
    const CAKE = {
      ...BREAD,
      id: 'cake',
      name: 'עוגה',
      steps: [{ id: 'c1', text: 'לערבב', minutes: 5 }],
    } as unknown as Recipe;

    const first = show();
    await screen.findByText('לשים 8 דקות');
    await user.click(screen.getByRole('button', { name: 'סימון השלב כהושלם' }));
    first.unmount();

    show(CAKE);
    await screen.findByText('לערבב');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('0 מתוך 1'),
    );
  });
});
