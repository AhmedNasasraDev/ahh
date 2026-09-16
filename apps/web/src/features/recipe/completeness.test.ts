// Requirement 8: a calculation is either whole, partial, or not possible, and
// the three must never look alike.
//
// The unit here is `calcState`. The screen's half of it is in
// RecipeScreen.test.tsx — this file pins the classification, because that is
// what decides whether a cost figure gets shown at all.

import { describe, expect, it } from 'vitest';
import { compute, defaultPrefs, type Recipe } from '@recipe-notebook/engine';
import { calcState } from './completeness.js';

const prefs = { ...defaultPrefs('pro'), done: true, tools: { cup: 240, tbsp: 15, tsp: 5 } };
const state = (recipe: Recipe) => calcState(compute(recipe, [recipe], { prefs }));

/** Everything by weight, so nothing needs a density. */
const ALL_WEIGHED: Recipe = {
  id: 'w',
  name: 'הכול בגרמים',
  yieldUnits: 10,
  unitWeight: 100,
  ingredients: [
    { id: 'i1', name: 'קמח לבן', qty: 500, unit: 'גרם', flour: true },
    { id: 'i2', name: 'מים', qty: 350, unit: 'גרם', liquid: true },
  ],
  steps: [],
} as unknown as Recipe;

/** Cocoa is pending-verification, so one row cannot be weighed. */
const ONE_MISSING: Recipe = {
  id: 'p',
  name: 'חלקי',
  yieldUnits: 10,
  unitWeight: 100,
  ingredients: [
    { id: 'i1', name: 'קמח לבן', qty: 2, unit: 'כוס', flour: true },
    { id: 'i2', name: 'קקאו', qty: 1, unit: 'כוס' },
  ],
  steps: [],
} as unknown as Recipe;

/** Nothing here has an agreed density, so there is no total at all. */
const NOTHING_WEIGHED: Recipe = {
  id: 'n',
  name: 'לא בר-חישוב',
  yieldUnits: 10,
  unitWeight: 100,
  ingredients: [
    { id: 'i1', name: 'קקאו', qty: 1, unit: 'כוס' },
    { id: 'i2', name: 'אורז', qty: 2, unit: 'כוס' },
  ],
  steps: [],
} as unknown as Recipe;

describe('full', () => {
  const s = state(ALL_WEIGHED);

  it('is reported when every ingredient was weighed', () => {
    expect(s.level).toBe('full');
    expect(s.missing).toBe(0);
    expect(s.counted).toBe(2);
  });

  it('says nothing, because there is nothing to disclose', () => {
    expect(s.summary).toBe('');
    expect(s.partialFigures).toBe(false);
  });
});

describe('partial', () => {
  const s = state(ONE_MISSING);

  it('counts what is missing and what is not', () => {
    expect(s.level).toBe('partial');
    expect(s.missing).toBe(1);
    expect(s.counted).toBe(1);
  });

  it('names the ingredient, so the gap is actionable', () => {
    expect(s.missingNames).toEqual(['קקאו']);
  });

  it('states the count in the wording the requirement asked for', () => {
    expect(s.summary).toContain('נתונים חלקיים');
    expect(s.summary).toContain('רכיב אחד');
    expect(s.summary).toContain('אינם מלאים');
  });

  it('marks every derived figure as incomplete', () => {
    expect(s.partialFigures).toBe(true);
  });

  it('gets the plural right for more than one', () => {
    const many = state({
      ...ONE_MISSING,
      ingredients: [
        { id: 'i1', name: 'קמח לבן', qty: 2, unit: 'כוס', flour: true },
        { id: 'i2', name: 'קקאו', qty: 1, unit: 'כוס' },
        { id: 'i3', name: 'אורז', qty: 1, unit: 'כוס' },
      ],
    } as unknown as Recipe);
    expect(many.missing).toBe(2);
    expect(many.summary).toContain('2 רכיבים');
  });
});

describe('not computable', () => {
  const s = state(NOTHING_WEIGHED);

  it('is distinguished from partial, not folded into it', () => {
    expect(s.level).toBe('none');
    expect(s.counted).toBe(0);
    expect(s.missing).toBe(2);
  });

  it('says outright that no weight, cost or price can be produced', () => {
    expect(s.summary).toContain('אי אפשר לחשב משקל, עלות או מחיר');
  });

  it('offers the two ways out, neither of which is a guessed number', () => {
    expect(s.summary).toContain('כיול אישי');
    expect(s.summary).toContain('משקל במקום נפח');
  });
});

describe('a personal calibration is the way out of partial', () => {
  it('turns an unresolvable row into a weighed one, with no table change', () => {
    const calibrated = {
      ...prefs,
      calib: [
        {
          id: 'c1',
          // The calibration identity is the normalised ingredient NAME, which is
          // what ingredientKeyOf() returns — not the density table's row key.
          // Those are two different namespaces and mixing them silently makes a
          // calibration never match (the substring bug B4 was in this area).
          ingredientKey: 'קקאו',
          name: 'קקאו',
          tool: 'cup',
          toolMl: 240,
          grams: 105,
          at: '2026-03-01',
        },
      ],
    };
    const before = calcState(compute(ONE_MISSING, [ONE_MISSING], { prefs }));
    const after = calcState(
      compute(ONE_MISSING, [ONE_MISSING], { prefs: calibrated as typeof prefs }),
    );
    expect(before.level).toBe('partial');
    expect(after.level).toBe('full');
  });
});
