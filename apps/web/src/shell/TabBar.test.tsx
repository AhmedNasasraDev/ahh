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

  it('marks the three unbuilt tabs as pending rather than pretending', () => {
    render(
      <MemoryRouter initialEntries={['/notebook']}>
        <TabBar />
      </MemoryRouter>,
    );
    expect(screen.getAllByText('בהכנה')).toHaveLength(3);
  });
});
