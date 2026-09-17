import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { TabBar, tabOf } from './TabBar.js';

describe('§2 tabOf — a deep screen highlights the tab that owns it', () => {
  it('maps the notebook family', () => {
    expect(tabOf('/notebook')).toBe('/notebook');
    expect(tabOf('/recipe/brioche')).toBe('/notebook');
  });

  it('maps the groups family', () => {
    expect(tabOf('/groups')).toBe('/groups');
    expect(tabOf('/group/g1')).toBe('/groups');
    expect(tabOf('/perms')).toBe('/groups');
  });

  it('maps the "more" family, including plan and stock', () => {
    for (const p of ['/more', '/settings', '/tools', '/plan', '/stock']) {
      expect(tabOf(p)).toBe('/more');
    }
  });

  it('maps BOTH production-planning routes, the list and one plan', () => {
    // The stage-10 audit found `/plans` falling through to the notebook: the
    // matcher takes an exact path or a `${p}/` prefix, so `/plan/:id` matched
    // `/plan` and the list did not. A user in their plans was told they were
    // in the notebook.
    expect(tabOf('/plans')).toBe('/more');
    expect(tabOf('/plan/abc-123')).toBe('/more');
    expect(tabOf('/ingredients')).toBe('/more');
  });

  it('falls back to the notebook for anything unknown', () => {
    expect(tabOf('/nope')).toBe('/notebook');
  });
});

describe('the tab bar tells the truth about what is built', () => {
  it('renders all four §2 tabs', () => {
    render(
      <MemoryRouter initialEntries={['/notebook']}>
        <TabBar />
      </MemoryRouter>,
    );
    for (const label of ['בית', 'מחברת', 'קבוצות', 'עוד']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('marks nothing as pending, because nothing is', () => {
    render(
      <MemoryRouter initialEntries={['/notebook']}>
        <TabBar />
      </MemoryRouter>,
    );
    /*
      STAGE-12: none, where stage 11 had one. §10 is built — קבוצות now leads
      to the group list, a group, a group recipe and the permissions screen —
      so the label came off in the same commit that gave the tab somewhere to
      go.

      The assertion is kept as "exactly zero" rather than deleted: it is the
      one that catches the opposite mistake, a tab quietly marked pending
      again, or a new tab shipped with a label nobody removed.
    */
    expect(screen.queryAllByText('בהכנה')).toHaveLength(0);

    const pendingOf = (label: string) =>
      screen.getByRole('link', { name: new RegExp(`^${label}`) }).textContent ?? '';
    for (const label of ['בית', 'מחברת', 'קבוצות', 'עוד']) {
      expect(pendingOf(label)).not.toContain('בהכנה');
    }
  });
});
