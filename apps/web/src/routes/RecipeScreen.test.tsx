import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { compute, defaultPrefs, type Recipe } from '@recipe-notebook/engine';
import { RecipeScreen } from './RecipeScreen.js';
import { fakeRepository, renderRoute } from '../test/render.js';
import { DEMO_RECIPES } from '../data/demoRecipes.js';

const prefsAt = (cupMl: number) => ({
  ...defaultPrefs('pro'),
  done: true,
  tools: { cup: cupMl, tbsp: 15, tsp: 5 },
});

/** A cup-measured recipe, so the tool setting is observable on screen. */
const CUP_CAKE: Recipe = {
  id: 'cupcake',
  name: 'עוגה במדידות ביתיות',
  category: 'עוגות ועוגיות',
  yieldUnits: 12,
  unitWeight: 60,
  targetFC: 25,
  ingredients: [
    { id: 'i1', name: 'קמח לבן', qty: 2, unit: 'כוס', flour: true, price: 5.4, priceUnit: 'ק"ג' },
    { id: 'i2', name: 'קקאו', qty: 1, unit: 'כוס' },
  ],
  steps: [{ id: 's1', text: 'מערבבים ואופים.', minutes: 40 }],
};

function renderRecipe(id: string, opts: { cupMl?: number; recipes?: Recipe[] } = {}) {
  return renderRoute(<RecipeScreen />, {
    path: '/recipe/:recipeId',
    route: `/recipe/${id}`,
    repository: fakeRepository({
      prefs: prefsAt(opts.cupMl ?? 240),
      recipes: opts.recipes ?? [...DEMO_RECIPES],
    }),
  });
}

describe('the recipe page renders the engine, not its own arithmetic', () => {
  it('shows the figures compute() produces for the brioche', async () => {
    renderRecipe('brioche');
    await screen.findByRole('heading', { name: 'בריוש נאנטר' });

    const c = compute(
      DEMO_RECIPES.find((r) => r.id === 'brioche')!,
      DEMO_RECIPES,
      { prefs: prefsAt(240) },
    );
    // 12 units at 85 g, from the engine
    expect(screen.getByText(/12 יחידות/)).toBeInTheDocument();
    expect(Math.round(c.unitsActual)).toBe(12);
  });

  it('marks an approved formula as locked (§9)', async () => {
    renderRecipe('brioche');
    expect(await screen.findByText('נוסחה מאושרת לייצור')).toBeInTheDocument();
  });

  it('says plainly that scaling does not change the recipe (§6)', async () => {
    renderRecipe('brioche');
    expect(
      await screen.findByText(/שינוי הכמויות כאן הוא חישוב בלבד/),
    ).toBeInTheDocument();
  });

  it('explains a missing recipe instead of rendering an empty page', async () => {
    renderRecipe('does-not-exist');
    expect(await screen.findByText(/לא נמצא במחברת/)).toBeInTheDocument();
  });
});

describe('B1 at the UI level — the cup setting reaches the screen', () => {
  const flourRow = () => screen.getByText('קמח לבן').closest('button')!;

  it('2 cups of flour reads 240 g with a 240 ml cup', async () => {
    renderRecipe('cupcake', { cupMl: 240, recipes: [CUP_CAKE] });
    await screen.findByRole('heading', { name: CUP_CAKE.name! });
    const row = within(flourRow());
    expect(row.getByText('2 כוס')).toBeInTheDocument();
    expect(row.getByText("240 גר'")).toBeInTheDocument();
  });

  it('and 250 g with a 250 ml cup — the prototype stayed at 240', async () => {
    renderRecipe('cupcake', { cupMl: 250, recipes: [CUP_CAKE] });
    await screen.findByRole('heading', { name: CUP_CAKE.name! });
    const row = within(flourRow());
    expect(row.getByText("250 גר'")).toBeInTheDocument();
    expect(row.queryByText("240 גר'")).not.toBeInTheDocument();
  });
});

describe('an unresolvable ingredient is shown honestly, not silently priced', () => {
  it('shows a dash and the reason for cocoa, which has no agreed value', async () => {
    renderRecipe('cupcake', { recipes: [CUP_CAKE] });
    await screen.findByRole('heading', { name: CUP_CAKE.name! });
    // cocoa is pending-verification in the merged table
    expect(screen.getByText(/נתונים סותרים/)).toBeInTheDocument();
    expect(
      screen.getByText(/לא נכנס לסך המשקל ולעלות/),
    ).toBeInTheDocument();
  });
});

describe('§5.3 conversion sheet — the B3 regression, at the UI level', () => {
  it('labels a cup ingredient converted to grams "נתון מערכת", never "המרה מדויקת"', async () => {
    const user = userEvent.setup();
    renderRecipe('cupcake', { recipes: [CUP_CAKE] });
    await screen.findByRole('heading', { name: CUP_CAKE.name! });

    // tap the flour row
    await user.click(screen.getByText('קמח לבן').closest('button')!);
    const sheet = await screen.findByRole('dialog', { name: 'המרת יחידה' });

    // §5.3: the recipe's own quantity and unit are shown, not just the grams
    expect(within(sheet).getByText('כפי שכתוב במתכון')).toBeInTheDocument();
    expect(within(sheet).getByText('2 כוס')).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'גרם' }));

    expect(within(sheet).getByLabelText('תוצאת ההמרה')).toHaveTextContent("240 גר'");
    expect(within(sheet).getByText(/נתון מערכת/)).toBeInTheDocument();
    expect(within(sheet).queryByText('המרה מדויקת')).not.toBeInTheDocument();
  });

  it('states the tool size in force, so the number is explainable', async () => {
    const user = userEvent.setup();
    renderRecipe('cupcake', { cupMl: 250, recipes: [CUP_CAKE] });
    await screen.findByRole('heading', { name: CUP_CAKE.name! });
    await user.click(screen.getByText('קמח לבן').closest('button')!);
    const sheet = await screen.findByRole('dialog', { name: 'המרת יחידה' });
    expect(within(sheet).getByLabelText('גודל כלי המדידה')).toHaveTextContent('250');
  });

  it('refuses a conversion with no reliable density, and says why', async () => {
    const user = userEvent.setup();
    renderRecipe('cupcake', { recipes: [CUP_CAKE] });
    await screen.findByRole('heading', { name: CUP_CAKE.name! });
    await user.click(screen.getByText('קקאו').closest('button')!);
    const sheet = await screen.findByRole('dialog', { name: 'המרת יחידה' });
    await user.click(within(sheet).getByRole('button', { name: 'גרם' }));
    expect(within(sheet).getByText(/נתונים סותרים/)).toBeInTheDocument();
  });

  it('offers weight targets only for a sub-recipe line (§18.6)', async () => {
    const user = userEvent.setup();
    renderRecipe('brioche-choc');
    await screen.findByRole('heading', { name: /בריוש שוקולד/ });
    await user.click(screen.getByText(/גנאש שוקולד מריר/).closest('button')!);
    const sheet = await screen.findByRole('dialog', { name: 'המרת יחידה' });
    expect(within(sheet).getByRole('button', { name: 'כוס' })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: 'גרם' })).toBeEnabled();
  });
});

describe('§6 scaling, through the engine', () => {
  it('scaling by units recomputes the quantities on screen', async () => {
    const user = userEvent.setup();
    renderRecipe('brioche');
    await screen.findByRole('heading', { name: 'בריוש נאנטר' });

    await user.click(screen.getByRole('button', { name: 'יחידות' }));
    await user.type(screen.getByPlaceholderText('מספר יחידות'), '24');

    await waitFor(() => {
      expect(screen.getByText(/מקדם ×/)).toBeInTheDocument();
    });
    // 12 units at 85 g with 12% baking loss gives 11.906 actual units, so
    // targeting 24 is a factor of 2.02 — the engine's number, not a round guess
    expect(screen.getByText('2.02')).toBeInTheDocument();
  });
});

describe('§3 progressive disclosure', () => {
  it('hides cost behind the production toggle, and shows it for a pro profile', async () => {
    const user = userEvent.setup();
    renderRecipe('brioche');
    await screen.findByRole('heading', { name: 'בריוש נאנטר' });

    expect(screen.queryByText('עלות ותמחור')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'נתוני ייצור ועלויות' }));
    expect(screen.getByText('תשואה ופחת')).toBeInTheDocument();
    expect(screen.getByText('עלות ותמחור')).toBeInTheDocument();
    // §13: baker's formula appears only when there is flour
    expect(screen.getByText('נוסחה')).toBeInTheDocument();
  });

  it('a home profile sees yield but not cost', async () => {
    const user = userEvent.setup();
    renderRoute(<RecipeScreen />, {
      path: '/recipe/:recipeId',
      route: '/recipe/brioche',
      repository: fakeRepository({
        prefs: { ...defaultPrefs('home'), done: true },
        recipes: [...DEMO_RECIPES],
      }),
    });
    await screen.findByRole('heading', { name: 'בריוש נאנטר' });
    await user.click(screen.getByRole('button', { name: 'נתוני ייצור ועלויות' }));
    expect(screen.getByText('תשואה ופחת')).toBeInTheDocument();
    expect(screen.queryByText('עלות ותמחור')).not.toBeInTheDocument();
  });
});

describe('§5.4 unit display modes', () => {
  it('grams view says the recipe has not changed', async () => {
    const user = userEvent.setup();
    renderRecipe('brioche');
    await screen.findByRole('heading', { name: 'בריוש נאנטר' });
    const group = screen.getByRole('group', { name: 'תצוגת יחידות' });
    await user.click(within(group).getByRole('button', { name: 'גרמים' }));
    expect(screen.getByText(/המתכון המקורי לא השתנה/)).toBeInTheDocument();
  });

  it('home view warns that a row with no reliable data stays in grams', async () => {
    const user = userEvent.setup();
    renderRecipe('brioche');
    await screen.findByRole('heading', { name: 'בריוש נאנטר' });
    const group = screen.getByRole('group', { name: 'תצוגת יחידות' });
    await user.click(within(group).getByRole('button', { name: 'ביתי' }));
    expect(screen.getByText(/נשאר בגרמים ומסומן ככזה/)).toBeInTheDocument();
  });
});
