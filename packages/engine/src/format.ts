// Number formatting for measuring tools.
//
// Ported from measure.js:211. Two spec deviations that existed there are not
// reproduced, because writing a known defect into new code is not a port:
//   • the step was `x.tool === 'cup' ? 0.25 : 0.25` — a dead ternary, so every
//     tool rounded to quarters. Spec §5.2 asks for quarter cups and HALF
//     spoons. (This was logged as B11.)
//   • count plurals were built as `x.he + 'ות'`, which produced "2 ביצהות".
//     (Logged as B10.)
// Both are display-only and are called out in the hand-off notes.

import { unit } from './units.js';

const FRACTION_GLYPH: Record<string, string> = {
  '0.25': '¼',
  '0.5': '½',
  '0.75': '¾',
};

const TOOL_WORDS: Record<string, [string, string]> = {
  cup: ['כוס', 'כוסות'],
  tbsp: ['כף', 'כפות'],
  tsp: ['כפית', 'כפיות'],
};

const COUNT_WORDS: Record<string, [string, string]> = {
  unit: ["יח'", "יח'"],
  egg: ['ביצה', 'ביצים'],
  fruit: ['פרי', 'פירות'],
  slice: ['פרוסה', 'פרוסות'],
};

export function round1(n: number): number {
  return Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
}

/** Grams / kilograms, ported verbatim from engine.js:130 (fmtG). */
export function formatGrams(g: number): string {
  if (g >= 1000) {
    const kg = g / 1000;
    return (
      kg.toFixed(g % 1000 === 0 ? 0 : 2).replace(/\.?0+$/, '') + ' ק"ג'
    );
  }
  return (g >= 10 ? Math.round(g) : Math.round(g * 10) / 10) + " גר'";
}

/** Shekels, ported verbatim from engine.js:133 (nis). */
export function formatNis(n: number): string {
  return (
    '₪' +
    (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('he-IL')
  );
}

export function formatForUnit(value: number, u: string): string {
  const x = unit(u);
  if (!x) return String(round1(value));

  if (x.tool) {
    const step = x.tool === 'cup' ? 0.25 : 0.5; // spec §5.2
    const [one, many] = TOOL_WORDS[x.tool] ?? ['', ''];
    const r = Math.round(value / step) * step;
    if (r === 0) {
      return value > 0 ? `פחות מ${fractionWord(step)} ${one}` : `0 ${one}`;
    }
    const whole = Math.floor(r + 1e-9);
    const frac = Math.round((r - whole) * 100) / 100;
    const glyph = frac > 0 ? (FRACTION_GLYPH[String(frac)] ?? '') : '';
    const num = whole === 0 ? glyph : whole + (glyph ? ' ' + glyph : '');
    return `${num} ${r > 1 ? many : one}`;
  }

  if (x.group === 'count') {
    const r = Math.round(value * 2) / 2;
    const [one, many] = COUNT_WORDS[x.id] ?? [x.he, x.he];
    return `${r} ${r > 1 ? many : one}`;
  }

  if (x.id === 'g') return `${Math.round(value)} גר'`;
  if (x.id === 'ml') return `${Math.round(value)} מ"ל`;
  return `${round1(value)} ${x.short ?? x.he}`;
}

function fractionWord(step: number): string {
  return step === 0.25 ? 'רבע' : 'חצי';
}
