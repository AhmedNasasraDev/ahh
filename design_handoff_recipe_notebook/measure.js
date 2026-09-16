// מנוע יחידות מדידה, כלי מדידה וכיול אישי — מחברת מתכונים
// window.PN_MEASURE. אינו דורס את engine.js; מרחיב אותו.
if (!window.PN_MEASURE) { (function(){

// ── קטלוג יחידות ─────────────────────────────────────────────
// group: weight | volume | count.  g = גרם ליחידה. ml = מיליליטר ליחידה.
// tool = נמדד בכלי מדידה של המשתמש (הגודל נקבע בהגדרות).
const UNITS = [
  { id:'mg',   he:'מ"ג',    group:'weight', g:0.001,   short:'מ"ג' },
  { id:'g',    he:'גרם',    group:'weight', g:1,       short:'גר\'' },
  { id:'kg',   he:'ק"ג',    group:'weight', g:1000,    short:'ק"ג' },
  { id:'oz',   he:'oz משקל', group:'weight', g:28.3495, short:'oz' },
  { id:'ml',   he:'מ"ל',    group:'volume', ml:1,      short:'מ"ל' },
  { id:'l',    he:'ליטר',   group:'volume', ml:1000,   short:'ליטר' },
  { id:'floz', he:'fl oz נפח', group:'volume', ml:29.5735, short:'fl oz' },
  { id:'shot', he:'shot',   group:'volume', ml:30,     short:'shot' },
  { id:'cup',  he:'כוס',    group:'volume', tool:'cup' },
  { id:'tbsp', he:'כף',     group:'volume', tool:'tbsp' },
  { id:'tsp',  he:'כפית',   group:'volume', tool:'tsp' },
  { id:'unit', he:"יח'",    group:'count' },
  { id:'egg',  he:'ביצה',   group:'count', g:50, conf:'estimate' },
  { id:'fruit',he:'פרי',    group:'count' },
  { id:'slice',he:'פרוסה',  group:'count' },
];
const byId = {}; UNITS.forEach(u => byId[u.id] = u);

// שמות היחידות הישנים שכבר שמורים במתכונים
const LEGACY = { 'גרם':'g', 'ק"ג':'kg', 'מ"ל':'ml', 'ליטר':'l', 'כוס':'cup', 'כף':'tbsp', 'כפית':'tsp', "יח'":'unit' };
function uid(u) { return byId[u] ? u : (LEGACY[u] || null); }
function unit(u) { return byId[uid(u)] || null; }
function label(u) { const x = unit(u); return x ? (x.short || x.he) : (u || ''); }

// ── כלי המדידה של המשתמש ─────────────────────────────────────
const TOOL_DEFAULTS = { cup:240, tbsp:15, tsp:5 };
const TOOL_OPTIONS = {
  cup:  [ {ml:240, he:'240 מ"ל — תקן מטבח בינלאומי'}, {ml:250, he:'250 מ"ל — כוס מטרית'},
          {ml:236.6, he:'8 fl oz — כוס אמריקאית'}, {ml:266.2, he:'9 fl oz'}, {ml:295.7, he:'10 fl oz'} ],
  tbsp: [ {ml:15, he:'15 מ"ל — תקן'}, {ml:14.8, he:'0.5 fl oz — ארה"ב'}, {ml:20, he:'20 מ"ל — אוסטרליה'} ],
  tsp:  [ {ml:5, he:'5 מ"ל — תקן'}, {ml:4.93, he:'ארה"ב'} ],
};
function toolMl(prefs, tool) {
  const t = (prefs && prefs.tools) || {};
  return Number(t[tool]) || TOOL_DEFAULTS[tool];
}
function mlPerUnit(u, prefs) {
  const x = unit(u); if (!x) return null;
  if (x.ml) return x.ml;
  if (x.tool) return toolMl(prefs, x.tool);
  return null;
}

// ── טבלת מערכת: גרם לכל 100 מ"ל, תלוי חומר הגלם ─────────────
// conf: 'system' = נתון מדוד ומקובל. 'estimate' = משתנה מאוד לפי חומר הגלם עצמו.
// מי שאין לו רשומה כאן — המערכת לא ממציאה מספר.
const TABLE = [
  { keys:['קמח מלא','כוסמין'],            per100:54,  conf:'system',   note:'כוס מכופלת בכף, בלי לדחוס' },
  { keys:['קמח תופח','קמח לבן','קמח'],     per100:50,  conf:'system',   note:'כוס מכופלת בכף, בלי לדחוס' },
  { keys:['קורנפלור','קורן פלור','עמילן'], per100:50,  conf:'system' },
  { keys:['אבקת סוכר'],                   per100:46,  conf:'system' },
  { keys:['קקאו'],                        per100:42,  conf:'system' },
  { keys:['סוכר חום','דמררה','מוסקובדו'], per100:79,  conf:'system',   note:'נמדד דחוס קלות' },
  { keys:['אבקת סוכר וניל','סוכר'],       per100:83,  conf:'system' },
  { keys:['חמאה','מרגרינה'],              per100:95,  conf:'system',   note:'רכה, נדחסת לכלי' },
  { keys:['מים'],                         per100:100, conf:'system' },
  { keys:['חלב'],                         per100:103, conf:'system' },
  { keys:['שמנת','קרם פרש','מסקרפונה'],   per100:99,  conf:'system' },
  { keys:['יוגורט','לבנה','שמנת חמוצה'],  per100:104, conf:'system' },
  { keys:['שמן','קנולה','זית','חמניות'],  per100:92,  conf:'system' },
  { keys:['דבש','סילאן','גלוקוז','מייפל','אינוורט'], per100:142, conf:'system' },
  { keys:['מלח'],                         per100:121, conf:'system',   note:'מלח שולחן דק' },
  { keys:['אבקת אפייה','סודה לשתייה'],    per100:92,  conf:'system' },
  { keys:['שמרים יבשים','שמרים אינסטנט'], per100:62,  conf:'system' },
  { keys:['שוקולד','צ\'יפס שוקולד'],       per100:71,  conf:'estimate', note:'תלוי בגודל הפיסות' },
  { keys:['שקד','אגוז','פקאן','פיסטוק','קשיו'], per100:42, conf:'estimate', note:'תלוי בטחינה ובגודל' },
  { keys:['שיבולת שועל','קוואקר'],        per100:38,  conf:'estimate' },
  { keys:['אורז'],                        per100:77,  conf:'system' },
  { keys:['מיץ','פולפה','פירה'],          per100:105, conf:'system' },
  { keys:['יין','ליקר','רום','ברנדי','וודקה'], per100:98, conf:'system' },
  { keys:['אספרסו','קפה נוזלי'],          per100:100, conf:'system' },
  { keys:['קפה טחון','קפה'],              per100:42,  conf:'estimate', note:'תלוי בדרגת הטחינה' },
];
function tableLookup(name) {
  const n = name || '';
  for (const row of TABLE) if (row.keys.some(k => n.includes(k))) return row;
  return null;
}

// ── כיול אישי ────────────────────────────────────────────────
// prefs.calib = [{ name, tool, ml, grams, at }]  — "אצלי כוס מהקמח הזה = 132 גרם"
function calibFor(prefs, name, u) {
  const list = (prefs && prefs.calib) || [];
  const x = unit(u); if (!x) return null;
  const n = (name || '').trim();
  if (!n) return null;
  const tool = x.tool || null;
  const hit = list.filter(c => n.includes(c.name) || c.name.includes(n))
    .sort((a, b) => (b.name.length - a.name.length))[0];
  if (!hit) return null;
  if (tool && hit.tool && hit.tool !== tool) {
    // כיול של כוס תקף גם לכף ולכפית ביחס נפח
    const from = toolMl(prefs, hit.tool), to = toolMl(prefs, tool);
    if (!from || !to) return null;
    return { per100: hit.grams / from * 100, source:'personal', note:'נגזר מהכיול של ' + labelTool(hit.tool) };
  }
  const ml = hit.ml || (hit.tool ? toolMl(prefs, hit.tool) : null);
  if (!ml) return null;
  return { per100: hit.grams / ml * 100, source:'personal', note:'כיול אישי מ־' + (hit.at || 'המטבח שלך') };
}
function labelTool(t) { return t === 'cup' ? 'כוס' : t === 'tbsp' ? 'כף' : 'כפית'; }

// ── מקור הצפיפות לחומר גלם ───────────────────────────────────
// מחזיר {per100, source:'personal'|'recipe'|'system'|'estimate', note} או null אם אין נתון אמין.
function densityFor(ing, prefs, fromUnit) {
  const c = calibFor(prefs, ing.name, fromUnit || 'cup');
  if (c) return c;
  if (ing.gPer100 != null && ing.gPer100 !== '') {
    return { per100: Number(ing.gPer100), source:'recipe', note:'נתון שהוזן במתכון עצמו' };
  }
  const t = tableLookup(ing.name);
  if (t) return { per100: t.per100, source: t.conf === 'estimate' ? 'estimate' : 'system', note: t.note || '' };
  return null;
}

const SOURCE_HE = {
  personal: { he:'כיול אישי', color:'#1E6B4C', exact:true },
  recipe:   { he:'נתון מהמתכון', color:'#1E6B4C', exact:true },
  system:   { he:'נתון מערכת', color:'#A56A0E', exact:false },
  estimate: { he:'הערכה גסה', color:'#9E362C', exact:false },
};

// ── המרה ─────────────────────────────────────────────────────
// convert({name, qty, unit, unitWeight, gPer100}, toUnit, prefs)
// → { ok, grams, value, text, source, sourceHe, sourceColor, exact, why, toolNote }
function convert(ing, toUnit, prefs) {
  const from = unit(ing.unit), to = unit(toUnit);
  const qty = Number(ing.qty) || 0;
  const fail = (why) => ({ ok:false, why });
  if (!from || !to) return fail('יחידה לא מזוהה');
  if (!qty) return fail('אין כמות להמיר');

  const fromToolMl = from.tool ? toolMl(prefs, from.tool) : null;
  const toToolMl = to.tool ? toolMl(prefs, to.tool) : null;
  const toolNote = fromToolMl ? labelTool(from.tool) + ' = ' + round(fromToolMl) + ' מ"ל לפי ההגדרות שלך' :
    (toToolMl ? labelTool(to.tool) + ' = ' + round(toToolMl) + ' מ"ל לפי ההגדרות שלך' : '');

  // משקל ↔ משקל, נפח ↔ נפח, ספירה ↔ ספירה: מדויק, בלי צפיפות
  if (from.group === to.group && from.group !== 'count') {
    const a = from.group === 'weight' ? from.g : mlPerUnit(ing.unit, prefs);
    const b = to.group === 'weight' ? to.g : mlPerUnit(toUnit, prefs);
    if (!a || !b) return fail('אין גודל כלי מוגדר');
    const v = qty * a / b;
    return ok(v, toUnit, { source:'exact', sourceHe:'המרה מדויקת', sourceColor:'#1E6B4C', exact:true, toolNote,
      why: from.group === 'weight' ? 'המרת משקל למשקל היא יחס קבוע.' : 'המרת נפח לנפח היא יחס קבוע לפי גודל הכלי.' });
  }

  // ספירה: צריך משקל ליחידה
  if (from.group === 'count' || to.group === 'count') {
    const cu = from.group === 'count' ? from : to;
    const per = Number(ing.unitWeight) || cu.g || null;
    if (!per) return fail('אין משקל ליחידה. אפשר להזין אותו בעריכת הרכיב.');
    const grams = from.group === 'count' ? qty * per : null;
    if (from.group === 'count') {
      if (to.group === 'weight') return ok(grams / to.g, toUnit, srcCount(cu, ing, toolNote));
      const per100 = densityFor(ing, prefs, toUnit);
      if (!per100) return fail(noData(ing.name));
      const ml = grams / per100.per100 * 100;
      return ok(ml / mlPerUnit(toUnit, prefs), toUnit, srcDens(per100, toolNote));
    }
    const g = from.group === 'weight' ? qty * from.g : null;
    if (g == null) {
      const per100 = densityFor(ing, prefs, ing.unit);
      if (!per100) return fail(noData(ing.name));
      const grams2 = qty * mlPerUnit(ing.unit, prefs) * per100.per100 / 100;
      return ok(grams2 / per, toUnit, srcDens(per100, toolNote));
    }
    return ok(g / per, toUnit, srcCount(cu, ing, toolNote));
  }

  // נפח ↔ משקל: חייב צפיפות של חומר הגלם הספציפי
  const d = densityFor(ing, prefs, from.tool ? ing.unit : toUnit);
  if (!d) return fail(noData(ing.name));
  if (from.group === 'volume') {
    const ml = qty * mlPerUnit(ing.unit, prefs);
    const grams = ml * d.per100 / 100;
    return ok(grams / to.g, toUnit, srcDens(d, toolNote));
  }
  const grams = qty * from.g;
  const ml = grams / d.per100 * 100;
  return ok(ml / mlPerUnit(toUnit, prefs), toUnit, srcDens(d, toolNote));
}
function noData(name) {
  return 'אין נתון אמין להמרת ' + (name || 'הרכיב הזה') + ' בין נפח למשקל. אפשר לשקול כוס אחת ולהוסיף כיול אישי.';
}
function srcCount(cu, ing, toolNote) {
  const own = !!Number(ing.unitWeight);
  return { source: own ? 'recipe' : 'estimate', sourceHe: own ? 'משקל יחידה מהמתכון' : 'משקל יחידה ממוצע',
    sourceColor: own ? '#1E6B4C' : '#A56A0E', exact: own, toolNote,
    why: own ? 'משתמש במשקל היחידה שהוזן במתכון.' : 'משתמש במשקל ממוצע (' + cu.g + ' גרם ליחידה). מומלץ לשקול.' };
}
function srcDens(d, toolNote) {
  const m = SOURCE_HE[d.source] || SOURCE_HE.estimate;
  return { source:d.source, sourceHe:m.he, sourceColor:m.color, exact:m.exact, toolNote,
    why: (d.note ? d.note + '. ' : '') + round(d.per100) + ' גרם ל־100 מ"ל.' };
}
function ok(value, toUnit, meta) {
  return Object.assign({ ok:true, value, text: fmt(value, toUnit) }, meta);
}
function round(n) { return Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10; }

// עיגול לכלי מדידה: 1/4 הקרוב לכוסות, 1/2 לכפיות
function fmt(v, u) {
  const x = unit(u); if (!x) return String(round(v));
  if (x.tool) {
    const step = x.tool === 'cup' ? 0.25 : 0.25;
    const r = Math.round(v / step) * step;
    const whole = Math.floor(r + 1e-9), frac = r - whole;
    const fr = frac > 0.7 ? '¾' : frac > 0.45 ? '½' : frac > 0.2 ? '¼' : '';
    const num = whole === 0 ? (fr || '0') : (whole + (fr ? ' ' + fr : ''));
    const many = r > 1;
    const word = x.tool === 'cup' ? (many ? 'כוסות' : 'כוס') : x.tool === 'tbsp' ? (many ? 'כפות' : 'כף') : (many ? 'כפיות' : 'כפית');
    return num + ' ' + word;
  }
  if (x.group === 'count') {
    const r = Math.round(v * 2) / 2;
    return r + ' ' + (x.id === 'unit' ? "יח'" : x.he + (r > 1 && x.id === 'egg' ? 'ות' : ''));
  }
  if (x.id === 'g' || x.id === 'ml') return Math.round(v) + ' ' + x.short;
  return round(v) + ' ' + (x.short || x.he);
}

// ── תבניות וציוד ─────────────────────────────────────────────
const PAN_KINDS = [
  { id:'round', he:'תבנית עגולה', fields:['diameter','height'] },
  { id:'rect',  he:'תבנית מלבנית', fields:['width','length','height'] },
  { id:'gn',    he:'תבנית GN', fields:['gn'] },
  { id:'loaf',  he:'תבנית אינגליש קייק', fields:['length','width','height'] },
  { id:'muffin',he:'תבנית מאפינס', fields:['cavities'] },
  { id:'none',  he:'בלי תבנית', fields:[] },
];
const GN = { '1/1':{w:32.5,l:53}, '1/2':{w:32.5,l:26.5}, '1/3':{w:32.5,l:17.6}, '2/3':{w:35.4,l:32.5}, '1/6':{w:17.6,l:16.2} };
function panArea(p) {
  if (!p || !p.kind) return null;
  if (p.kind === 'round') { const d = Number(p.diameter); return d ? Math.PI * (d / 2) * (d / 2) : null; }
  if (p.kind === 'rect' || p.kind === 'loaf') { const w = Number(p.width), l = Number(p.length); return w && l ? w * l : null; }
  if (p.kind === 'gn') { const g = GN[p.gn]; return g ? g.w * g.l : null; }
  if (p.kind === 'muffin') { const c = Number(p.cavities); return c ? c * 1 : null; }
  return null;
}
// יחס התאמה בין תבנית המתכון לתבנית של המשתמש. גובה זהה → לפי שטח, גובה שונה → לפי נפח.
function panFactor(from, to) {
  const a = panArea(from), b = panArea(to);
  if (!a || !b) return null;
  const ha = Number(from.height) || null, hb = Number(to.height) || null;
  const f = (ha && hb) ? (b * hb) / (a * ha) : b / a;
  return { factor: f, byVolume: !!(ha && hb) };
}
function panLabel(p) {
  if (!p || !p.kind || p.kind === 'none') return '';
  if (p.kind === 'round') return 'Ø' + p.diameter + (p.height ? '×' + p.height : '') + ' ס"מ';
  if (p.kind === 'rect' || p.kind === 'loaf') return p.width + '×' + p.length + (p.height ? '×' + p.height : '') + ' ס"מ';
  if (p.kind === 'gn') return 'GN ' + p.gn;
  if (p.kind === 'muffin') return p.cavities + ' שקעי מאפינס';
  return '';
}

// ── העדפות מדידה: ברירות מחדל לפי פרופיל ─────────────────────
const PROFILES = [
  { id:'home', he:'ביתי', desc:'מדידות ביתיות, בלי נתוני ייצור ותמחור',
    units:['g','cup','tbsp','tsp','unit'], pro:false },
  { id:'pro',  he:'מקצועי', desc:'גרמים, תשואה, פחת, עלויות ותמחור',
    units:['g','kg','ml','l','unit'], pro:true },
  { id:'study',he:'לימוד', desc:'מצב לימוד פתוח, קבוצות וקורסים בקדמת הבמה',
    units:['g','ml','cup','unit'], pro:true },
];
const UNIT_GROUPS = [
  { id:'weight', he:'משקל', ids:['mg','g','kg','oz'] },
  { id:'volume', he:'נפח', ids:['ml','l','floz'] },
  { id:'home',   he:'מדידות ביתיות', ids:['cup','tbsp','tsp'] },
  { id:'count',  he:'יחידות', ids:['unit','egg','fruit','slice'] },
  { id:'bar',    he:'בר וקפה', ids:['shot'] },
];
function defaultPrefs(profileId) {
  const p = PROFILES.find(x => x.id === profileId) || PROFILES[1];
  return { profile:p.id, units:p.units.slice(), tools:Object.assign({}, TOOL_DEFAULTS), calib:[], pro:p.pro, done:false };
}
// היחידה המועדפת להצגה, בתוך קבוצה נתונה
function preferred(prefs, group) {
  const list = (prefs && prefs.units) || [];
  const hit = list.map(unit).filter(u => u && u.group === group)[0];
  return hit ? hit.id : (group === 'weight' ? 'g' : group === 'volume' ? 'ml' : 'unit');
}

window.PN_MEASURE = { UNITS, UNIT_GROUPS, PROFILES, TOOL_OPTIONS, TOOL_DEFAULTS, PAN_KINDS, GN, SOURCE_HE,
  uid, unit, label, labelTool, toolMl, mlPerUnit, tableLookup, densityFor, calibFor,
  convert, fmt, panArea, panFactor, panLabel, defaultPrefs, preferred };

})(); }
