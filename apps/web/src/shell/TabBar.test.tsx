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

  it('marks exactly the unbuilt tabs as pending, and no others', () => {
    render(
      <MemoryRouter initialEntries={['/notebook']}>
        <TabBar />
      </MemoryRouter>,
    );
    // STAGE-11: one, not three. "עוד" had been flagged "בהכנה" since stage 2
    // while growing four working screens underneath it, and "בית" is now built.
    // Only קבוצות is genuinely unbuilt, and it still says so.
    expect(screen.getAllByText('בהכנה')).toHaveLength(1);

    const pendingOf = (label: string) =>
      screen.getByRole('link', { name: new RegExp(`^${label}`) }).textContent ?? '';
    expect(pendingOf('קבוצות')).toContain('בהכנה');
    expect(pendingOf('בית')).not.toContain('בהכנה');
    expect(pendingOf('מחברת')).not.toContain('בהכנה');
    expect(pendingOf('עוד')).not.toContain('בהכנה');
  });
});
