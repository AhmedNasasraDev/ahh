// Free-text recipe parsing — ported from parser.js.
//
// `parseTime` and `parseTemp` are verbatim; they had no defects.
//
// The cup/spoon handling changed, because it was the third copy of B1:
// parser.js:65,69,72 hard-coded 240 ml and carried its own `DRY` table. It now
// goes through the shared density path with the user's tool sizes, and when
// there is no reliable density it KEEPS the original unit instead of inventing
// 150 g per cup — the importer must not fabricate a weight either.

import type { IngredientLike, MeasurementPrefs } from './types.js';
import { densityFor } from './density.js';
import { mlPerUnit } from './units.js';

const UNIT_WORDS = [
  'גרם', "גר'", "ג'", 'ק"ג', 'קילו', 'מ"ל', 'מל', 'ליטר',
  'כוס', 'כוסות', 'כף', 'כפות', 'כפית', 'כפיות', "יח'", 'יחידות', 'יחידה',
];
const LIQUID_WORDS = ['מים', 'חלב', 'שמנת', 'שמן', 'מיץ', 'יין', 'ביצ', 'דבש', 'סירופ', 'יוגורט'];
const FLOUR_WORDS = ['קמח', 'סולת', 'כוסמין', 'שיפון'];
const FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
};
const SKIP_LINE =
  /^(רכיבים|מצרכים|חומרים|אופן ההכנה|הוראות הכנה|הכנה|לבצק|למילוי|אופן הכנה)\s*:?\s*$/;

export function parseQuantity(raw: string): number | null {
  const s = (raw ?? '').trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)?\s*(\d+)\s*\/\s*(\d+)/);
  if (frac) return (Number(frac[1]) || 0) + Number(frac[2]) / Number(frac[3]);
  for (const k of Object.keys(FRACTIONS)) {
    if (s.includes(k)) {
      const whole = s.match(/\d+(\.\d+)?/);
      return (whole ? parseFloat(whole[0]) : 0) + FRACTIONS[k]!;
    }
  }
  const m = s.match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

export function parseTime(line: string): number | '' {
  if (/שעתיים וחצי/.test(line)) return 150;
  if (/שעתיים/.test(line)) return 120;
  if (/שעה וחצי/.test(line)) return 90;
  if (/חצי שעה/.test(line)) return 30;
  const h = line.match(/(\d+(\.\d+)?)\s*שע/);
  if (h) return Math.round(parseFloat(h[1]!) * 60);
  if (/\bשעה\b/.test(line)) return 60;
  const m = line.match(/(\d+)\s*דק/);
  return m ? Number(m[1]) : '';
}

export function parseTemp(line: string): string {
  const m = line.match(/(\d{2,3})\s*(?:מעלות|°|C|c\b)/);
  return m ? m[1]! : '';
}

export interface ParsedRecipe {
  ingredients: IngredientLike[];
  steps: Array<{ id: string; text: string; temp: string; tempUnit: string; minutes: number | '' }>;
  /** lines whose cup/spoon amount could not be converted, kept in their own unit */
  keptAsWritten: Array<{ name: string; unit: string; reason: string }>;
}

/**
 * Local parser. `prefs` is required for any cup/spoon line to be converted; it
 * is optional only so a caller can parse with factory defaults on purpose.
 */
export function parseLocal(
  text: string,
  prefs?: MeasurementPrefs,
): ParsedRecipe {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !SKIP_LINE.test(l));

  const ingredients: IngredientLike[] = [];
  const steps: ParsedRecipe['steps'] = [];
  const keptAsWritten: ParsedRecipe['keptAsWritten'] = [];

  lines.forEach((line, i) => {
    const hasNum = /\d|½|¼|¾|⅓|⅔/.test(line);
    const unitWord = UNIT_WORDS.find((u) => line.includes(u));

    if (hasNum && unitWord && line.length < 60) {
      let name = line.replace(/^[-•*]\s*/, '').trim();
      const q = parseQuantity(name);
      name = name.replace(/^[\d½¼¾⅓⅔./\s]+/, '').trim();
      for (const u of [...UNIT_WORDS].sort((a, b) => b.length - a.length)) {
        if (name.startsWith(u)) {
          name = name.slice(u.length).trim();
          break;
        }
      }
      name = name
        .replace(/^(של|מ־|מ )\s*/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!name) return;

      const qty = q ?? 0;
      const isLiq = LIQUID_WORDS.some((k) => name.includes(k));
      const ing: IngredientLike = { id: `n${i}`, name, qty, unit: 'גרם' };

      if (/ק"ג|קילו/.test(line)) {
        ing.qty = qty;
        ing.unit = 'ק"ג';
      } else if (/ליטר/.test(line)) {
        ing.qty = qty;
        ing.unit = 'ליטר';
      } else if (/מ"ל|(^|\s)מל(\s|$)/.test(line)) {
        ing.qty = qty;
        ing.unit = 'מ"ל';
      } else if (/כוס/.test(line)) {
        applyHomeMeasure(ing, 'כוס', qty, prefs, keptAsWritten);
      } else if (/כפית|כפיות/.test(line)) {
        applyHomeMeasure(ing, 'כפית', qty, prefs, keptAsWritten);
      } else if (/כף|כפות/.test(line)) {
        applyHomeMeasure(ing, 'כף', qty, prefs, keptAsWritten);
      } else if (/יח'|יחיד/.test(line)) {
        ing.qty = qty;
        ing.unit = "יח'";
      }

      if (FLOUR_WORDS.some((k) => name.includes(k))) ing.flour = true;
      if (isLiq) ing.liquid = true;
      ingredients.push(ing);
      return;
    }

    if (line.length > 12) {
      steps.push({
        id: `s${i}`,
        text: line,
        temp: parseTemp(line),
        tempUnit: 'C',
        minutes: parseTime(line),
      });
    }
  });

  return { ingredients, steps, keptAsWritten };
}

/**
 * Convert a cup/spoon line to grams (or millilitres) through the shared density
 * path, preserving the original wording in `note` exactly as before. When there
 * is no reliable density the line keeps its home measure — no invented number.
 */
function applyHomeMeasure(
  ing: IngredientLike,
  heUnit: 'כוס' | 'כף' | 'כפית',
  qty: number,
  prefs: MeasurementPrefs | undefined,
  keptAsWritten: ParsedRecipe['keptAsWritten'],
): void {
  const ml = mlPerUnit(heUnit, prefs);
  const d = densityFor({ name: ing.name }, prefs, heUnit);
  ing.note = `במקור ${qty} ${heUnit}`;

  if (ml == null || !d) {
    ing.qty = qty;
    ing.unit = heUnit;
    keptAsWritten.push({
      name: ing.name ?? '',
      unit: heUnit,
      reason: d
        ? 'אין גודל כלי מוגדר'
        : 'אין נתון צפיפות אמין — הכמות נשמרה כפי שנכתבה',
    });
    return;
  }

  const grams = (qty * ml * d.gPer100) / 100;
  ing.qty = Math.round(grams * 10) / 10;
  ing.unit = 'גרם';
}

export const SMART_PARSE_PROMPT = (text: string, categories: string[]): string =>
  `נתח את המתכון הבא והחזר JSON בלבד, בלי טקסט נוסף.
סכימה: {"name":string,"category":one of ${JSON.stringify(categories)},"tags":string[],"ingredients":[{"name":string,"qty":number,"unit":"גרם"|"ק\\"ג"|"מ\\"ל"|"ליטר"|"יח'","unitWeight":number|null,"flour":boolean,"liquid":boolean,"note":string}],"steps":[{"text":string,"temp":string,"minutes":number}]}
כללים: קטגוריה ויחידה רק מהרשימות הסגורות. כוסות וכפות להמיר לגרם או מ"ל ולשמור את הניסוח המקורי בשדה note. לשמור את נוסח השלבים כמעט כפי שהוא. אסור להמציא רכיבים, כמויות, זמנים, טמפרטורות או מחירים. אין שדה מחיר.
המתכון:
${text}`;
