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
