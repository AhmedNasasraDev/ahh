import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultPrefs } from '@recipe-notebook/engine';
import { NotebookScreen } from './NotebookScreen.js';
import { fakeRepository, renderRoute } from '../test/render.js';

const render = (pro = true) =>
  renderRoute(<NotebookScreen />, {
    repository: fakeRepository({
      prefs: { ...defaultPrefs(pro ? 'pro' : 'home'), done: true },
    }),
  });

describe('§2 the notebook', () => {
  it('lists the five demo recipes with a real count', async () => {
    render();
    expect(await screen.findByText('5 מתכונים · 2 בסיסים')).toBeInTheDocument();
    expect(screen.getByText('בריוש נאנטר')).toBeInTheDocument();
    expect(screen.getByText('גנאש שוקולד מריר 64%')).toBeInTheDocument();
  });

  it('marks a base recipe and an approved formula', async () => {
    render();
    await screen.findByText('בריוש נאנטר');
    expect(screen.getAllByText('מתכון בסיס')).toHaveLength(2);
    expect(screen.getByText('נוסחה מאושרת')).toBeInTheDocument();
  });

  it('shows cost per kilo for a pro profile', async () => {
    render(true);
    await screen.findByText('גנאש שוקולד מריר 64%');
    // from the engine: ₪45.6 per kilo
    expect(screen.getByText(/₪45.6/)).toBeInTheDocument();
  });

  it('hides cost for a home profile (§3)', async () => {
    render(false);
    await screen.findByText('גנאש שוקולד מריר 64%');
    expect(screen.queryByText(/₪/)).not.toBeInTheDocument();
  });

  it('searches name, tag and ingredient', async () => {
    const user = userEvent.setup();
    render();
    await screen.findByText('בריוש נאנטר');
    const box = screen.getByLabelText('חיפוש מתכון');

    await user.type(box, 'בריוש');
    expect(screen.getByText('בריוש נאנטר')).toBeInTheDocument();
    expect(screen.queryByText('קרואסון חמאה')).not.toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'למינציה'); // a tag on the croissant
    expect(screen.getByText('קרואסון חמאה')).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'גלוקוז'); // an ingredient of the ganache
    expect(screen.getByText('גנאש שוקולד מריר 64%')).toBeInTheDocument();
  });

  it('filters by category', async () => {
    const user = userEvent.setup();
    render();
    await screen.findByText('בריוש נאנטר');
    await user.click(screen.getByRole('button', { name: 'גנאשים ורטבים' }));
    expect(screen.getByText('גנאש שוקולד מריר 64%')).toBeInTheDocument();
    expect(screen.queryByText('בריוש נאנטר')).not.toBeInTheDocument();
  });

  it('explains an empty result instead of showing a blank list', async () => {
    const user = userEvent.setup();
    render();
    await screen.findByText('בריוש נאנטר');
    await user.type(screen.getByLabelText('חיפוש מתכון'), 'שקשוקה');
    expect(screen.getByText('אין מתכון שתואם לחיפוש.')).toBeInTheDocument();
  });

  it('does not render an export button, because there is nothing to export to', async () => {
    render();
    await screen.findByText('בריוש נאנטר');
    // B8: the prototype announced "X מתכונים הועתקו לקובץ" without a file
    expect(screen.queryByText(/ייצוא/)).not.toBeInTheDocument();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('stage-10 audit: the card costs what the recipe page costs', () => {
  /** One recipe with NO price of its own — the normal case since stage 7. */
  const inherited = [
    {
      id: 'inh',
      name: 'לחם לבן',
      category: 'לחמים',
      yieldUnits: 2,
      unitWeight: 500,
      ingredients: [
        { id: 'i1', name: 'קמח לבן', ingredientKey: 'קמח לבן', qty: 1000, unit: 'g', flour: true },
      ],
      steps: [],
    },
  ] as unknown as NonNullable<Parameters<typeof fakeRepository>[0]>['recipes'];

  const priced = [
    {
      id: 'cat-flour',
      key: 'קמח לבן',
      name: 'קמח לבן',
      purchaseUnit: 'kg' as const,
      packageQty: 1,
      packageCount: 1,
      purchaseTotal: 6,
      usablePct: null,
      supplier: '',
      purchasedAt: null,
      priceUpdatedAt: null,
      note: '',
      purchasePrice: 6,
      price: 6,
      priceUnit: 'ק"ג' as const,
      allergens: [],
    },
  ];

  it('shows the cost per kilo that comes from the ingredient centre', async () => {
    // The defect this pins: the list used to compute from the recipe's OWN row
    // prices only, so a recipe priced centrally — the documented normal case —
    // showed no cost on its card while its page showed ₪6/kg.
    renderRoute(<NotebookScreen />, {
      repository: fakeRepository({
        prefs: { ...defaultPrefs('pro'), done: true },
        recipes: inherited,
        catalog: priced,
      }),
    });
    const card = await screen.findByText('לחם לבן');
    const row = card.closest('a')!;
    expect(row).toHaveTextContent('₪6');
    expect(row).toHaveTextContent('לק"ג');
  });

  it('shows no cost when nothing prices the material, rather than ₪0', async () => {
    renderRoute(<NotebookScreen />, {
      repository: fakeRepository({
        prefs: { ...defaultPrefs('pro'), done: true },
        recipes: inherited,
        catalog: [],
      }),
    });
    const card = await screen.findByText('לחם לבן');
    expect(card.closest('a')!).not.toHaveTextContent('₪');
  });
});
