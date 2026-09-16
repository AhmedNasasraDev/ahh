import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultPrefs, type Recipe } from '@recipe-notebook/engine';
import { RecipeEditScreen } from './RecipeEditScreen.js';
import { fakeRepository, renderRoute } from '../test/render.js';

const prefs = { ...defaultPrefs('pro'), done: true, tools: { cup: 240, tbsp: 15, tsp: 5 } };

const BRIOCHE: Recipe = {
  id: 'r1',
  name: 'בריוש נאנטר',
  category: 'לחמים',
  tags: ['חג'],
  yieldUnits: 12,
  unitWeight: 85,
  targetFC: 28,
  ingredients: [
    { id: 'i1', name: 'קמח לחם', qty: 1000, unit: 'גרם', flour: true, price: 4.2, priceUnit: 'ק"ג' },
    { id: 'i2', name: 'חמאה 82%', qty: 250, unit: 'גרם' },
  ],
  steps: [{ id: 's1', text: 'ללוש 12 דקות', minutes: 12 }],
};

function renderNew(opts: { onSaveRecipe?(r: Recipe): void; canWrite?: boolean } = {}) {
  return renderRoute(<RecipeEditScreen />, {
    path: '/recipe/new',
    route: '/recipe/new',
    repository: fakeRepository({
      prefs,
      recipes: [],
      canWrite: opts.canWrite ?? true,
      ...(opts.onSaveRecipe ? { onSaveRecipe: opts.onSaveRecipe } : {}),
    }),
  });
}

function renderEdit(
  recipe: Recipe = BRIOCHE,
  opts: { onSaveRecipe?(r: Recipe): void } = {},
) {
  return renderRoute(<RecipeEditScreen />, {
    path: '/recipe/:recipeId/edit',
    route: `/recipe/${recipe.id}/edit`,
    repository: fakeRepository({
      prefs,
      recipes: [recipe],
      canWrite: true,
      ...(opts.onSaveRecipe ? { onSaveRecipe: opts.onSaveRecipe } : {}),
    }),
  });
}

describe('creating a recipe', () => {
  it('opens an empty form with one ingredient row to start from', async () => {
    renderNew();
    expect(await screen.findByRole('heading', { name: 'מתכון חדש' })).toBeInTheDocument();
    expect(screen.getByLabelText('שם המתכון')).toHaveValue('');
    expect(screen.getByLabelText('שם הרכיב בשורה 1')).toBeInTheDocument();
  });

  it('refuses to save a nameless recipe and says what is missing', async () => {
    const user = userEvent.setup();
    const onSaveRecipe = vi.fn();
    renderNew({ onSaveRecipe });
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.click(screen.getByRole('button', { name: 'שמירת המתכון' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('למתכון חייב להיות שם.');
    expect(onSaveRecipe).not.toHaveBeenCalled();
  });

  it('refuses a recipe with no ingredients', async () => {
    const user = userEvent.setup();
    const onSaveRecipe = vi.fn();
    renderNew({ onSaveRecipe });
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.type(screen.getByLabelText('שם המתכון'), 'לחם');
    await user.click(screen.getByRole('button', { name: 'שמירת המתכון' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('צריך לפחות רכיב אחד.');
    expect(onSaveRecipe).not.toHaveBeenCalled();
  });

  it('saves a filled-in recipe through the repository', async () => {
    const user = userEvent.setup();
    const saved: Recipe[] = [];
    renderNew({ onSaveRecipe: (r) => saved.push(r) });
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.type(screen.getByLabelText('שם המתכון'), 'לחם כוסמין');
    await user.type(screen.getByLabelText('שם הרכיב בשורה 1'), 'קמח מלא');
    await user.type(screen.getByLabelText('כמות של קמח מלא'), '600');

    await user.click(screen.getByRole('button', { name: 'הוספת רכיב' }));
    await user.type(screen.getByLabelText('שם הרכיב בשורה 2'), 'מים');
    await user.type(screen.getByLabelText('כמות של מים'), '420');

    await user.click(screen.getByRole('button', { name: 'שמירת המתכון' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toBe('לחם כוסמין');
    expect(saved[0]!.ingredients!.map((i) => i.name)).toEqual(['קמח מלא', 'מים']);
    expect(saved[0]!.ingredients!.map((i) => i.qty)).toEqual(['600', '420']);
  });

  it('cannot save when the repository cannot write, and says so', async () => {
    renderNew({ canWrite: false });
    await screen.findByRole('heading', { name: 'מתכון חדש' });
    expect(screen.getByRole('button', { name: 'שמירת המתכון' })).toBeDisabled();
    expect(screen.getByText(/אי אפשר לשמור/)).toBeInTheDocument();
  });
});

describe('ingredient rows — add, remove, reorder', () => {
  it('adds a row', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });
    await user.click(screen.getByRole('button', { name: 'הוספת רכיב' }));
    expect(screen.getByLabelText('שם הרכיב בשורה 2')).toBeInTheDocument();
  });

  it('removes a row, by a button that names the ingredient', async () => {
    const user = userEvent.setup();
    renderEdit();
    await screen.findByRole('heading', { name: 'עריכת מתכון' });

    // The accessible name carries the ingredient, so a screen-reader user does
    // not get a list of identical "הסרה" buttons.
    await user.click(screen.getByRole('button', { name: 'הסרת חמאה 82%' }));

    expect(screen.queryByDisplayValue('חמאה 82%')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('קמח לחם')).toBeInTheDocument();
  });

  it('moves a row down and the numbering follows', async () => {
    const user = userEvent.setup();
    renderEdit();
    await screen.findByRole('heading', { name: 'עריכת מתכון' });

    expect(screen.getByLabelText('שם הרכיב בשורה 1')).toHaveValue('קמח לחם');
    await user.click(screen.getByRole('button', { name: 'הורדת קמח לחם למטה' }));
    expect(screen.getByLabelText('שם הרכיב בשורה 1')).toHaveValue('חמאה 82%');
    expect(screen.getByLabelText('שם הרכיב בשורה 2')).toHaveValue('קמח לחם');
  });

  it('disables the move buttons at the ends rather than hiding them', async () => {
    renderEdit();
    await screen.findByRole('heading', { name: 'עריכת מתכון' });
    expect(screen.getByRole('button', { name: 'העלאת קמח לחם למעלה' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'הורדת חמאה 82% למטה' })).toBeDisabled();
  });

  it('saves the new order', async () => {
    const user = userEvent.setup();
    const saved: Recipe[] = [];
    renderEdit(BRIOCHE, { onSaveRecipe: (r) => saved.push(r) });
    await screen.findByRole('heading', { name: 'עריכת מתכון' });

    await user.click(screen.getByRole('button', { name: 'הורדת קמח לחם למטה' }));
    await user.click(screen.getByRole('button', { name: 'שמירת השינויים' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.ingredients!.map((i) => i.name)).toEqual(['חמאה 82%', 'קמח לחם']);
  });
});

describe('opening a saved recipe for editing', () => {
  it('fills the form from the stored recipe', async () => {
    renderEdit();
    await screen.findByRole('heading', { name: 'עריכת מתכון' });
    expect(screen.getByLabelText('שם המתכון')).toHaveValue('בריוש נאנטר');
    expect(screen.getByLabelText('תגים')).toHaveValue('חג');
    expect(screen.getByLabelText('כמות של קמח לחם')).toHaveValue('1000');
  });

  it('explains a recipe id that is not in the notebook', async () => {
    renderRoute(<RecipeEditScreen />, {
      path: '/recipe/:recipeId/edit',
      route: '/recipe/nope/edit',
      repository: fakeRepository({ prefs, recipes: [], canWrite: true }),
    });
    expect(await screen.findByText(/לא נמצא במחברת/)).toBeInTheDocument();
  });

  it('saves an edit against the same id, rather than creating a second recipe', async () => {
    const user = userEvent.setup();
    const saved: Recipe[] = [];
    renderEdit(BRIOCHE, { onSaveRecipe: (r) => saved.push(r) });
    await screen.findByRole('heading', { name: 'עריכת מתכון' });

    await user.clear(screen.getByLabelText('שם המתכון'));
    await user.type(screen.getByLabelText('שם המתכון'), 'בריוש נאנטר 2');
    await user.click(screen.getByRole('button', { name: 'שמירת השינויים' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.id).toBe('r1');
    expect(saved[0]!.name).toBe('בריוש נאנטר 2');
  });

  it('warns that an approved production formula is being edited (§9, §18.7)', async () => {
    renderEdit({ ...BRIOCHE, locked: true });
    await screen.findByRole('heading', { name: 'עריכת מתכון' });
    expect(screen.getByText(/נוסחה מאושרת לייצור/)).toBeInTheDocument();
    expect(screen.getByText(/כדאי לשכפל אותו/)).toBeInTheDocument();
  });
});

describe('requirement 11 — full / partial / none inside the editor', () => {
  it('says the calculation is complete when every row can be weighed', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.type(screen.getByLabelText('שם הרכיב בשורה 1'), 'קמח לבן');
    await user.type(screen.getByLabelText('כמות של קמח לבן'), '500');

    expect(screen.getByLabelText('שלמות החישוב')).toHaveTextContent('חישוב מלא');
  });

  it('announces a partial calculation the moment an unweighable row is typed', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.type(screen.getByLabelText('שם הרכיב בשורה 1'), 'קמח לבן');
    await user.type(screen.getByLabelText('כמות של קמח לבן'), '500');
    await user.click(screen.getByRole('button', { name: 'הוספת רכיב' }));
    await user.type(screen.getByLabelText('שם הרכיב בשורה 2'), 'קקאו');
    await user.type(screen.getByLabelText('כמות של קקאו'), '1');
    // cocoa in cups: pending-verification, so no weight can be produced
    await user.selectOptions(screen.getByLabelText('יחידת המדידה של קקאו'), 'cup');

    const notice = screen.getByLabelText('שלמות החישוב');
    expect(notice).toHaveTextContent('נתונים חלקיים');
    expect(notice).toHaveTextContent('קקאו');
  });

  it('marks the running total as partial rather than presenting it as final', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.type(screen.getByLabelText('שם הרכיב בשורה 1'), 'קמח לבן');
    await user.type(screen.getByLabelText('כמות של קמח לבן'), '500');
    await user.click(screen.getByRole('button', { name: 'הוספת רכיב' }));
    await user.type(screen.getByLabelText('שם הרכיב בשורה 2'), 'קקאו');
    await user.type(screen.getByLabelText('כמות של קקאו'), '1');
    await user.selectOptions(screen.getByLabelText('יחידת המדידה של קקאו'), 'cup');

    const totalRow = screen.getByText('סך המשקל').closest('div')!;
    expect(within(totalRow).getByText('חלקי')).toBeInTheDocument();
  });

  it('shows a dash, not a zero, when nothing at all can be weighed', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.type(screen.getByLabelText('שם הרכיב בשורה 1'), 'קקאו');
    await user.type(screen.getByLabelText('כמות של קקאו'), '1');
    await user.selectOptions(screen.getByLabelText('יחידת המדידה של קקאו'), 'cup');

    expect(screen.getByLabelText('שלמות החישוב')).toHaveTextContent('לא ניתן לחשב');
    const totalRow = screen.getByText('סך המשקל').closest('div')!;
    expect(within(totalRow).getByText('—')).toBeInTheDocument();
  });

  it('offers the two honest ways out of an unweighable row, and no third one', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.type(screen.getByLabelText('שם הרכיב בשורה 1'), 'קקאו');
    await user.type(screen.getByLabelText('כמות של קקאו'), '1');
    await user.selectOptions(screen.getByLabelText('יחידת המדידה של קקאו'), 'cup');

    expect(screen.getByRole('button', { name: 'כיול אישי של קקאו' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'מדידת קקאו בגרמים' })).toBeInTheDocument();
  });

  it('switching the row to grams resolves it, with no invented density', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.type(screen.getByLabelText('שם הרכיב בשורה 1'), 'קקאו');
    await user.type(screen.getByLabelText('כמות של קקאו'), '100');
    await user.selectOptions(screen.getByLabelText('יחידת המדידה של קקאו'), 'cup');
    expect(screen.getByLabelText('שלמות החישוב')).toHaveTextContent('לא ניתן לחשב');

    await user.click(screen.getByRole('button', { name: 'מדידת קקאו בגרמים' }));
    expect(screen.getByLabelText('שלמות החישוב')).toHaveTextContent('חישוב מלא');
  });

  it('shows the computed weight and its source badge per row', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.type(screen.getByLabelText('שם הרכיב בשורה 1'), 'קמח לבן');
    await user.type(screen.getByLabelText('כמות של קמח לבן'), '2');
    await user.selectOptions(screen.getByLabelText('יחידת המדידה של קמח לבן'), 'cup');

    // 2 cups at 240 ml and 50 g/100 ml = 240 g, tagged as a system value —
    // never as an exact conversion (that was B3). Scoped to the row, because
    // the running total legitimately shows the same figure.
    const result = within(screen.getByLabelText('המשקל המחושב של קמח לבן'));
    expect(result.getByText("240 גר'")).toBeInTheDocument();
    expect(result.getByText(/נתון מערכת/)).toBeInTheDocument();
  });
});

describe('the null-versus-zero rule is explained where the user meets it', () => {
  it('says so next to the measured-yield field', async () => {
    const user = userEvent.setup();
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });
    await user.click(screen.getByRole('button', { name: 'תשואה ותמחור' }));
    expect(
      screen.getByText(/שדה ריק פירושו .*לפי החישוב.*אפס פירושו שנמדדה תשואה של אפס/s),
    ).toBeInTheDocument();
  });

  it('keeps an untouched measured yield out of the saved recipe', async () => {
    const user = userEvent.setup();
    const saved: Recipe[] = [];
    renderNew({ onSaveRecipe: (r) => saved.push(r) });
    await screen.findByRole('heading', { name: 'מתכון חדש' });

    await user.type(screen.getByLabelText('שם המתכון'), 'לחם');
    await user.type(screen.getByLabelText('שם הרכיב בשורה 1'), 'קמח לבן');
    await user.type(screen.getByLabelText('כמות של קמח לבן'), '500');
    await user.click(screen.getByRole('button', { name: 'שמירת המתכון' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.yieldActual).toBe('');
  });
});

describe('accessibility of the per-row controls', () => {
  it('gives every row control a name that identifies its row', async () => {
    renderEdit();
    await screen.findByRole('heading', { name: 'עריכת מתכון' });

    for (const name of [
      'כמות של קמח לחם',
      'יחידת המדידה של קמח לחם',
      'הסרת קמח לחם',
      'הורדת קמח לחם למטה',
      'כמות של חמאה 82%',
      'הסרת חמאה 82%',
    ]) {
      expect(screen.getByLabelText(name) ?? screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('falls back to the row number before the ingredient has a name', async () => {
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });
    expect(screen.getByRole('button', { name: 'הסרת רכיב 1' })).toBeInTheDocument();
    expect(screen.getByLabelText('כמות של רכיב 1')).toBeInTheDocument();
  });

  it('names the step controls by their position', async () => {
    renderNew();
    await screen.findByRole('heading', { name: 'מתכון חדש' });
    expect(screen.getByLabelText('תיאור שלב 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'הסרת שלב 1' })).toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Stage-10 audit, §11 — what the editor does when the SERVER says no.
//
// The rule being tested is the one that matters most in this section: a save
// that did not happen must never look like one that did. The form stays open
// with its typed values, the reason is announced, and nothing navigates away
// to a page that would then show the old recipe as if it had been updated.
describe('stage-10 audit, §11: a save the server refuses', () => {
  /** A repository whose write fails the way PostgREST reports a failure. */
  function renderWithFailingSave(message: string) {
    const calls: Recipe[] = [];
    renderRoute(<RecipeEditScreen />, {
      path: '/recipe/:recipeId/edit',
      route: `/recipe/${BRIOCHE.id}/edit`,
      repository: fakeRepository({
        prefs,
        recipes: [BRIOCHE],
        canWrite: true,
        onSaveRecipe: (r) => {
          calls.push(r);
          throw new Error(message);
        },
      }),
    });
    return calls;
  }

  it('keeps the user on the form and says why, rather than reporting success', async () => {
    const user = userEvent.setup();
    // The message the RPC really raises when another device saved in between
    // (migration 0007, errcode serialization_failure).
    renderWithFailingSave(
      'עדכון המתכון נכשל: המתכון שונה במקום אחר מאז שנטען. יש לרענן ולנסות שוב.',
    );
    await screen.findByRole('heading', { name: 'עריכת מתכון' });

    await user.clear(screen.getByLabelText('שם המתכון'));
    await user.type(screen.getByLabelText('שם המתכון'), 'בריוש מעודכן');
    await user.click(screen.getByRole('button', { name: 'שמירת השינויים' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/המתכון שונה במקום אחר/);
    // Still the editor, and still holding what was typed: nothing was lost and
    // nothing pretended to be saved.
    expect(screen.getByRole('heading', { name: 'עריכת מתכון' })).toBeInTheDocument();
    expect(screen.getByLabelText('שם המתכון')).toHaveValue('בריוש מעודכן');
  });

  it('can be retried after the failure, rather than leaving the button dead', async () => {
    const user = userEvent.setup();
    const calls = renderWithFailingSave('עדכון המתכון נכשל: השרת לא זמין.');
    await screen.findByRole('heading', { name: 'עריכת מתכון' });

    const save = screen.getByRole('button', { name: 'שמירת השינויים' });
    await user.click(save);
    await screen.findByRole('alert');
    // `busy` is cleared in a finally block, so the second attempt is possible.
    await waitFor(() => expect(save).not.toBeDisabled());
    await user.click(save);
    await waitFor(() => expect(calls.length).toBe(2));
  });
});
