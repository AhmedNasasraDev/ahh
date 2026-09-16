# @recipe-notebook/engine

מנוע החישוב המאוחד של "מחברת מתכונים". מודול עצמאי ב-TypeScript, בלי UI, בלי backend, בלי תלויות ריצה.

**מה זה כן:** מקור אמת אחד לצפיפויות, מסלול המרה אחד, provenance מלא, וזהות יציבה לכיול אישי.
**מה זה לא:** לא React, לא Supabase, לא auth, לא DB. הפרוטוטייפ ב-`design_handoff_recipe_notebook/` **לא נגע**.

```bash
npm install
npm run typecheck   # tsc --noEmit על src ועל test
npm test            # vitest run — 155 בדיקות
npm run build       # dist/
```

---

## המבנה — לפני ואחרי

### לפני

```
engine.js  (137 שורות)
├── DENS      7 שורות   צפיפות נוזלים, g/ml          ← טבלה 1
├── CUP_DRY   9 שורות   גרם לכוס                      ← טבלה 2
├── WATER_PCT 12 שורות  אחוז מים
├── ALLERGENS 8 קבוצות
├── cupGrams(ing)        כוס מקובעת ל-240 מ"ל
├── toGrams(ing)         ← פרמטר אחד. אין prefs.       ⚠ B1
└── compute(recipe, recipes, factor)

measure.js (297 שורות)
├── UNITS, TOOL_DEFAULTS, TOOL_OPTIONS
├── TABLE    25 שורות   g/100ml + conf                ← טבלה 3
├── calibFor()           substring דו-כיווני           ⚠ B4
│                        per100 מ-prefs הנוכחי         ⚠ B5
├── densityFor()         סדר קדימות נכון
├── convert(ing, to, prefs)  ✓ מכיר prefs
└── panArea / panFactor

parser.js  (93 שורות)
├── DRY       7 שורות   גרם לכוס                       ← טבלה 4
└── parseLocal()         240 מקובע בקוד                ⚠ B1

מחברת מתכונים.dc.html
├── volQty()             קורא ל-engine.cupGrams        ⚠ B1
└── convert: () => ...   מעביר גרמים לגלית             ⚠ B3
```

ארבע טבלאות צפיפות · שני מסלולי המרה מקבילים · שלושה מימושי פורמט.

### אחרי

```
packages/engine/src/
├── data/
│   ├── density-table.ts      ★ מקור האמת היחיד — 27 שורות, g/100ml
│   │                           + sources{} לכל ערך ישן
│   │                           + exclude + KNOWN_DATA_GAPS
│   ├── density-conflicts.ts    דוח קונפליקטים, נגזר מהטבלה
│   ├── water.ts                אחוז מים (הועבר כפי שהוא)
│   └── allergens.ts            אלרגנים (הועבר כפי שהוא)
├── text.ts                     normalizeName · ingredientKeyOf · sameIngredient
├── units.ts                    UNITS · TOOL_DEFAULTS · mlPerUnit(u, prefs)
├── provenance.ts               Source · weakest() · buildProvenance()
├── calibration.ts              זהות מדויקת · toolMl קפוא · suggestCalibrations
├── density.ts                  densityFor() — נקודת הכניסה היחידה
├── convert.ts                  toGrams(ing, prefs) · convert · convertScaled
├── format.ts                   formatForUnit · formatGrams · formatNis
├── compute.ts                  compute(recipe, recipes, {factor, prefs})
├── parse.ts                    parseLocal(text, prefs)
├── profiles.ts                 PROFILES · defaultPrefs
└── index.ts
```

טבלה אחת · מסלול אחד · `prefs` זורם מקצה לקצה.

---

## איך תוקנו B1–B5

### B1 — כלי המדידה מגיעים לכל חישוב

```ts
// לפני
function toGrams(ing) {
  case 'כוס':  return q * cupGrams(ing);        // 240 מקובע
  case 'כף':   return q * cupGrams(ing) / 16;   // יחס מקובע
}

// אחרי
export function toGrams(ing: IngredientLike, prefs?: MeasurementPrefs): GramsResult {
  const ml = mlPerUnit(uid, prefs);              // ← ההגדרה של המשתמש
  const d  = densityFor(ing, prefs, uid);        // ← מקור האמת היחיד
  if (!d) return { grams: null, provenance: unavailable(...) };
  return { grams: qty * ml * d.gPer100 / 100, provenance: ... };
}
```

כף וכפית קוראות עכשיו את ההגדרות **שלהן**, לא כוס חלקי 16 ו-48. בברירת המחדל (240/15/5) התוצאה זהה לפרוטוטייפ — יש בדיקת parity על כך — אבל כף אוסטרלית של 20 מ"ל סוף סוף עובדת.

### B2 — טבלה אחת, בלי לאבד נתונים ובלי לנחש

כל שורה נושאת את **כל** הערכים הישנים:

```ts
{
  key: 'cocoa', match: ['קקאו'], gPer100: 42, confidence: 'system',
  sources: { 'measure.TABLE': 42, 'engine.CUP_DRY': 45.83, 'parser.DRY': 45.83 },
  needsReview: true,
  reviewNote: 'engine.CUP_DRY ו-parser.DRY קיבצו קקאו יחד עם אבקת סוכר… הפער 9%.',
}
```

5 קונפליקטים ערכיים + 2 שורות במקור בודד → `DENSITY_CONFLICTS`. פירוט מלא ב-**[CONFLICTS.md](./CONFLICTS.md)**.

### B3 — provenance מלא, והחוליה החלשה קובעת

```ts
// לפני — מסך המתכון נתן לגלית גרמים
convert: () => this.setState({ convIng: { qty: row.g, unit: 'גרם', ... } })
// → convert(from='g', to='g') → "המרה מדויקת" על מספר מטבלת אומדן

// אחרי
convertScaled(ing, factor, 'g', prefs)   // מתחיל מהיחידה שבמתכון
// → provenance.chain = [{ from:'cup', to:'g', source:'system', gPer100:50, densityKey:'flour.white' }]
// → provenance.source = weakest(chain) = 'system'
// → provenance.exact  = false
// → original = { qty: 2, unit: 'כוס' }   ← לא נדרס על ידי סקיילינג
```

| דרגה | תג | צבע | `exact` |
|---|---|---|---|
| `exact` | המרה מדויקת | ירוק | ✓ |
| `personal` | כיול אישי | ירוק | ✓ |
| `recipe` | נתון מהמתכון | ירוק | ✓ |
| `system` | נתון מערכת | ענבר | ✗ |
| `estimate` | הערכה גסה | אדום | ✗ |
| `unavailable` | אין נתון אמין | אדום | ✗ |

`weakest()` מבטיח שאומדן לא יכול לצאת מהשרשרת כמדויק, בשום מספר צעדים.

### B4 — זהות יציבה, לא substring

```ts
// לפני
list.filter(c => n.includes(c.name) || c.name.includes(n))
// כיול ל"קמח" → הוחל על "קמח שקדים" עם תג "כיול אישי · מדויק"

// אחרי
const key = ingredientKeyOf(ing);              // ingredientKey || normalizeName(name)
const matches = list.filter(c => (c.ingredientKey ?? ingredientKeyOf(c)) === key);
```

- התאמה מדויקת בלבד, אחרי נרמול (רווחים, גרש/גרשיים, מקף, ניקוד).
- `ingredientKey` מפורש מנצח את השם — מוכן לקטלוג חומרי גלם אמיתי.
- התאמה-כמעט **מוצעת** דרך `suggestCalibrations()` כדי שהמשתמש יחיל במפורש. לא מוחלת אוטומטית.
- אותו כלל הוחל גם על **הטבלה**: `KNOWN_DATA_GAPS` דוחה קמח שקדים/קוקוס/אורז/תירס וכו' **לפני** התאמת שורות, כי `'קמח'` ו-`'שקד'` היו תופסים אותם. כיול אישי או `gPer100` מהמתכון כן עוקפים.

### B5 — הכיול קופא בזמן המדידה

```ts
// לפני
const ml = hit.ml || toolMl(prefs, hit.tool);   // prefs הנוכחי!
// כיול 132 גר'/כוס: ב-240 → 55 g/100ml. שינוי ל-250 → 52.8 בשקט.

// אחרי
interface Calibration { tool, toolMl, grams, ... }   // toolMl קפוא
createCalibration(input, prefs)  // מצלם את toolMl(prefs, tool) עכשיו
calibrationGPer100(c) = c.grams / c.toolMl * 100     // תמיד 55
```

רשומה ישנה בלי `toolMl` מקבלת `TOOL_DEFAULTS` **ומסומנת** `toolMlAssumed: true`, שמתגלגל ל-`needsReview` ולהערה *"גודל הכלי לא נשמר בכיול הזה… כדאי לאמת"* — במקום להתפרש מחדש בשקט.

---

## מה האיחוד חשף

באגים שלא היו בדוח הבדיקה, ושהתגלו רק כשהטבלאות נפגשו. `engine.cupGrams` התייעץ עם `engine.DENS` **רק** אם השם תאם `/מים|חלב|שמנת|שמן|מיץ|יין|ביצ/`:

| חומר גלם | הפרוטוטייפ | האמת מהטבלה שלו עצמו | שגיאה |
|---|---|---|---|
| דבש / גלוקוז / סילאן | 150 גר'/כוס | 340.8 | **×2.3** |
| סירופ / מולסה | 150 גר'/כוס | 319.2 | **×2.1** |
| יוגורט / לבנה | 150 גר'/כוס | 249.6 | **×1.7** |

כף דבש חושבה כ-9.4 גרם במקום 21.3. `SPLIT_TABLE_ERRORS` מתעד את זה, ויש בדיקות שמקבעות את שני הערכים.

---

## שימוש

```ts
import { compute, convert, convertScaled, createCalibration, defaultPrefs } from '@recipe-notebook/engine';

const prefs = { ...defaultPrefs('pro'), tools: { cup: 250, tbsp: 15, tsp: 5 } };

const r = convert({ name: 'קמח לבן', qty: 2, unit: 'כוס' }, 'g', prefs);
// { ok: true, value: 250, text: "250 גר'",
//   original: { qty: 2, unit: 'כוס', label: '2 כוס' },
//   provenance: { source: 'system', label: 'נתון מערכת', exact: false, chain: [...] } }

const c = compute(recipe, allRecipes, { factor: 2, prefs });
// c.rows[i].g            מספר, או null אם אין נתון אמין
// c.rows[i].provenance   התג לכל שורה
// c.unresolved           רכיבים שלא ניתן לשקול — לא מתומחרים בניחוש
// c.warnings             הנחות שנעשו, בגלוי
```

---

## מה עוד לא נעשה

בהיקף המאושר של שלב 1 **לא** נכללו:

- **B6** `panFactor` משווה מאפינס לתבנית עגולה (מקדם 26.18). `panArea`/`panFactor` נשארו בפרוטוטייפ, לא הועברו.
- **B7** ביטול נעילה חד-כיווני · **B8** הודעות ייצוא/שיתוף מטעות · **B9** תמונות חסרות · **B12**–**B17** — כולם ב-UI או בשכבות אחרות.
- `learn.js` (כרטיסי לימוד) לא הועבר.
- שום שינוי ב-UI, ב-backend, ב-DB או ב-auth.

**חריגה אחת מודעת מההיקף:** `format.ts` לא שחזר את B10 ו-B11. `fmt` היה חייב להיכתב כדי ש-`convert` יחזיר `text`, וכתיבת `'2 ביצהות'` או התנאי המת `cup ? 0.25 : 0.25` לתוך קוד חדש היא לא העברה — היא הטמעת תקלה מוכרת. שתיהן תצוגה בלבד, אף UI לא צורך את המודול הזה עדיין, וניתן להחזיר בשורה אחת אם תעדיף.

---

## בדיקות

```
test/conversion.test.ts     המרות, כלי מדידה, קונפליקט הקקאו, oz מול fl oz
test/calibration.test.ts    B4, B5, סדר קדימות, פערי נתונים
test/provenance.test.ts     B3, weakest(), שרשרת האודיט
test/compute.test.ts        סקיילינג, עלות/תשואה, unresolved, נוסחה
test/density-ssot.test.ts   מקור אמת יחיד, אף מונח ישן לא אבד, דוח הקונפליקטים
test/parity.test.ts         מול הפרוטוטייפ שלא נגע (node:vm)
test/acceptance.test.ts     AC #2 ו-AC #5 מהמפרט
```

`parity.test.ts` טוען את `design_handoff_recipe_notebook/engine.js` בתוך `node:vm` ומשווה מול 5 מתכוני הדמו — לוודא שאיחדנו ולא החלפנו.
