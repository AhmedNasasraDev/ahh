if (!window.PN_ENGINE) { (function(){
// מנוע חישוב — מחברת מתכונים מקצועית
const DENS = [
  [['שמן', 'קנולה', 'זית', 'חמניות'], 0.92],
  [['דבש', 'סילאן', 'גלוקוז', 'אינוורט', 'מייפל'], 1.42],
  [['סירופ', 'מולסה'], 1.33],
  [['חלב', 'ביצה', 'ביצים', 'חלמון', 'חלבון'], 1.03],
  [['שמנת', 'קרם פרש'], 0.99],
  [['ליקר', 'רום', 'ברנדי', 'וודקה'], 0.94],
  [['מיץ', 'פירה', 'פולפה'], 1.05],
];
function density(ing) {
  if (ing.density) return Number(ing.density);
  const n = ing.name || '';
  for (const [keys, d] of DENS) if (keys.some(k => n.includes(k))) return d;
  return 1.0;
}
const WATER_PCT = [
  [['חלב'], 87], [['שמנת', 'קרם פרש'], 65], [['ביצה', 'ביצים', 'מלנג\''], 75],
  [['חלמון'], 50], [['חלבון'], 88], [['יוגורט', 'לבנה'], 85],
  [['דבש', 'סילאן', 'גלוקוז', 'אינוורט'], 18], [['סירופ', 'מולסה'], 25],
  [['שמן', 'קנולה', 'זית', 'חמניות'], 0], [['חמאה'], 16],
  [['מיץ', 'פירה', 'פולפה'], 88], [['ליקר', 'רום', 'ברנדי', 'וודקה'], 60],
];
function waterPct(ing) {
  if (ing.waterPct !== '' && ing.waterPct != null) return Number(ing.waterPct);
  const n = ing.name || '';
  for (const [keys, p] of WATER_PCT) if (keys.some(k => n.includes(k))) return p;
  return 100;
}
const CUP_DRY = [
  [['קמח'], 120], [['סוכר חום', 'דמררה'], 190], [['אבקת סוכר', 'קקאו'], 110], [['סוכר'], 200],
  [['חמאה'], 227], [['שקד', 'אגוז', 'פיסטוק', 'פקאן', 'אורז'], 160], [['מלח'], 290],
  [['שיבולת שועל', 'קוואקר'], 90], [['שוקולד'], 170],
];
function cupGrams(ing) {
  const n = ing.name || '';
  if (ing.liquid || /מים|חלב|שמנת|שמן|מיץ|יין|ביצ/.test(n)) return 240 * density(ing);
  for (const [keys, w] of CUP_DRY) if (keys.some(k => n.includes(k))) return w;
  return 150;
}
const VOL_UNITS = ['כוס', 'כף', 'כפית'];
function toGrams(ing) {
  const q = Number(ing.qty) || 0, d = density(ing);
  switch (ing.unit) {
    case 'ק"ג': return q * 1000;
    case 'ליטר': return q * 1000 * d;
    case 'מ"ל': return q * d;
    case "יח'": return q * (Number(ing.unitWeight) || 0);
    case 'כוס': return q * cupGrams(ing);
    case 'כף': return q * cupGrams(ing) / 16;
    case 'כפית': return q * cupGrams(ing) / 48;
    default: return q;
  }
}
const ALLERGENS = [
  ['גלוטן', ['קמח', 'חיטה', 'שיפון', 'שעורה', 'כוסמין', 'סולת', 'פירורי לחם', 'פנקו']],
  ['ביצים', ['ביצה', 'ביצים', 'חלמון', 'חלבון ביצה', "מלנג'"]],
  ['חלב', ['חלב', 'חמאה', 'שמנת', 'גבינה', 'מסקרפונה', 'יוגורט', 'לבנה', 'קרם פרש', 'ריקוטה']],
  ['אגוזים', ['שקד', 'אגוז', 'פיסטוק', 'לוז', 'פקאן', 'קשיו', 'מקדמיה', 'מרציפן', 'פרלינה']],
  ['בוטנים', ['בוטן']],
  ['סויה', ['סויה', 'לציטין']],
  ['שומשום', ['שומשום', 'טחינה']],
  ['דגים', ['דג', 'אנשובי', 'סלמון']],
];

// חישוב מתכון. recipes = כל המתכונים (לפתרון תת־מתכונים). factor = מקדם שינוי כמויות.
function compute(recipe, recipes, factor = 1, seen = new Set()) {
  const f = (!factor || !isFinite(factor) || factor <= 0) ? 1 : factor;
  if (seen.has(recipe.id)) return { error: 'מעגל תת־מתכונים', rows: [], totalG: 0, cost: 0 };
  const next = new Set(seen); next.add(recipe.id);
  let totalG = 0, cost = 0, flour = 0, liquid = 0, water = 0;
  const rows = (recipe.ingredients || []).map(ing => {
    const g = toGrams(ing) * f;
    let lineCost = 0, subInfo = null;
    if (ing.subId) {
      const sub = recipes.find(r => r.id === ing.subId);
      if (sub) {
        const s = compute(sub, recipes, 1, next);
        const subYield = s.actualYield || s.totalG || 1;
        lineCost = (s.cost / subYield) * g;
        subInfo = s;
        if (ing.countSubFormula) {
          const k = g / subYield;
          flour += s.flour * k; liquid += s.liquid * k; water += (s.water || 0) * k;
        }
      }
    } else if (ing.price) {
      const p = Number(ing.price) || 0;
      lineCost = ing.priceUnit === 'ליטר' ? (g / density(ing) / 1000) * p : (g / 1000) * p;
    }
    if (ing.flour) flour += g;
    if (ing.liquid) { liquid += g; water += g * waterPct(ing) / 100; }
    totalG += g; cost += lineCost;
    return { ing, g, cost: lineCost, sub: subInfo };
  });
  const theoretical = totalG;
  const actualYield = recipe.yieldActual ? Number(recipe.yieldActual) * f : theoretical;
  const prodLoss = theoretical ? (theoretical - actualYield) / theoretical * 100 : 0;
  const wb = Number(recipe.weightBefore) || 0, wa = Number(recipe.weightAfter) || 0;
  const bakeLoss = wb ? (wb - wa) / wb * 100 : 0;
  const unitW = Number(recipe.unitWeight) || 0;
  const scaleWeight = unitW ? unitW / (1 - bakeLoss / 100) : 0;
  const unitsActual = scaleWeight ? actualYield / scaleWeight : (Number(recipe.yieldUnits) || 0) * f;
  const costPerUnit = unitsActual ? cost / unitsActual : 0;
  const costPerKg = actualYield ? (cost / actualYield) * 1000 : 0;
  const fc = Number(recipe.targetFC) || 0;
  const price = fc ? costPerUnit / (fc / 100) : 0;
  const hydration = flour ? liquid / flour * 100 : 0;
  const trueHydration = flour ? water / flour * 100 : 0;
  const waterTemp = recipe.doughMode
    ? 3 * (Number(recipe.ddt) || 0) - (Number(recipe.flourTemp) || 0) - (Number(recipe.roomTemp) || 0) - (Number(recipe.friction) || 0)
    : null;
  const target = (Number(recipe.yieldUnits) || 0) * f;
  const unitsWarn = target && Math.abs(unitsActual - target) / target > 0.05;
  const set = new Set(recipe.manualAllergens || []);
  const collect = (rs) => rs.forEach(r => {
    const n = r.ing.name || '';
    ALLERGENS.forEach(([a, keys]) => { if (keys.some(k => n.includes(k))) set.add(a); });
    if (r.sub) collect(r.sub.rows);
  });
  collect(rows);
  rows.forEach(r => { r.bakerPct = flour ? r.g / flour * 100 : 0; });
  return {
    rows, totalG, theoretical, actualYield, prodLoss, bakeLoss, scaleWeight,
    unitsActual, unitsWarn, cost, costPerUnit, costPerKg, price, flour, liquid,
    hydration, water, trueHydration, waterTemp, allergens: [...set], factor: f,
  };
}
const fmtG = (g) => g >= 1000
  ? (g / 1000).toFixed(g % 1000 === 0 ? 0 : 2).replace(/\.?0+$/, '') + ' ק"ג'
  : (g >= 10 ? Math.round(g) : Math.round(g * 10) / 10) + ' גר\'';
const nis = (n) => '₪' + (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('he-IL');

window.PN_ENGINE={density,toGrams,waterPct,cupGrams,VOL_UNITS,ALLERGENS,compute,fmtG,nis};

})(); }
