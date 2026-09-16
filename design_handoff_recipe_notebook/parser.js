if (!window.PN_PARSER) { (function(){
const UNITS = ['גרם', 'גר\'', 'ג\'', 'ק"ג', 'קילו', 'מ"ל', 'מל', 'ליטר', 'כוס', 'כוסות', 'כף', 'כפות', 'כפית', 'כפיות', "יח'", 'יחידות', 'יחידה'];
const DRY = [[['קמח'], 120], [['סוכר חום', 'דמררה'], 190], [['אבקת סוכר', 'קקאו'], 110],
  [['סוכר'], 200], [['חמאה'], 227], [['אגוז', 'שקד', 'פיסטוק', 'אורז'], 160], [['מלח'], 290]];
const LIQ = ['מים', 'חלב', 'שמנת', 'שמן', 'מיץ', 'יין', 'ביצ', 'דבש', 'סירופ', 'יוגורט'];
const FLOUR = ['קמח', 'סולת', 'כוסמין', 'שיפון'];
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const SKIP = /^(רכיבים|מצרכים|חומרים|אופן ההכנה|הוראות הכנה|הכנה|לבצק|למילוי|אופן הכנה)\s*:?\s*$/;

function num(raw) {
  const s = (raw || '').trim();
  let total = 0, found = false;
  const mixed = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)?\s*(\d+)\s*\/\s*(\d+)/);
  if (frac) return (Number(frac[1]) || 0) + Number(frac[2]) / Number(frac[3]);
  for (const k in FRAC) if (s.includes(k)) {
    const whole = s.match(/\d+(\.\d+)?/);
    return (whole ? parseFloat(whole[0]) : 0) + FRAC[k];
  }
  const m = s.match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
function dryWeight(name) {
  for (const [keys, w] of DRY) if (keys.some(k => name.includes(k))) return w;
  return 150;
}
function parseTime(line) {
  if (/שעתיים וחצי/.test(line)) return 150;
  if (/שעתיים/.test(line)) return 120;
  if (/שעה וחצי/.test(line)) return 90;
  if (/חצי שעה/.test(line)) return 30;
  const h = line.match(/(\d+(\.\d+)?)\s*שע/);
  if (h) return Math.round(parseFloat(h[1]) * 60);
  if (/\bשעה\b/.test(line)) return 60;
  const m = line.match(/(\d+)\s*דק/);
  return m ? Number(m[1]) : '';
}
function parseTemp(line) {
  const m = line.match(/(\d{2,3})\s*(?:מעלות|°|C|c\b)/);
  return m ? m[1] : '';
}

function parseLocal(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean).filter(l => !SKIP.test(l));
  const ingredients = [], steps = [];
  lines.forEach((line, i) => {
    const hasNum = /\d|½|¼|¾|⅓|⅔/.test(line);
    const unit = UNITS.find(u => line.includes(u));
    if (hasNum && unit && line.length < 60) {
      let name = line.replace(/^[-•*]\s*/, '').trim();
      const q = num(name);
      name = name.replace(/^[\d½¼¾⅓⅔.\/\s]+/, '').trim();
      const sorted = UNITS.slice().sort((a, b) => b.length - a.length);
      for (const u of sorted) {
        if (name.startsWith(u)) { name = name.slice(u.length).trim(); break; }
      }
      name = name.replace(/^(של|מ־|מ )\s*/, '').replace(/\s{2,}/g, ' ').trim();
      const ing = { id: 'n' + i + Math.random().toString(36).slice(2, 6), name, qty: q || 0, unit: 'גרם' };
      const isLiq = LIQ.some(k => name.includes(k));
      if (/ק"ג|קילו/.test(line)) { ing.qty = q; ing.unit = 'ק"ג'; }
      else if (/ליטר/.test(line)) { ing.qty = q; ing.unit = 'ליטר'; }
      else if (/מ"ל|(^|\s)מל(\s|$)/.test(line)) { ing.qty = q; ing.unit = 'מ"ל'; }
      else if (/כוס/.test(line)) {
        if (isLiq) { ing.qty = Math.round(q * 240); ing.unit = 'מ"ל'; }
        else { ing.qty = Math.round(q * dryWeight(name)); ing.unit = 'גרם'; }
        ing.note = 'במקור ' + q + ' כוס';
      } else if (/כפית|כפיות/.test(line)) {
        ing.qty = Math.round(q * (isLiq ? 240 : dryWeight(name)) / 48 * 10) / 10;
        ing.unit = isLiq ? 'מ"ל' : 'גרם'; ing.note = 'במקור ' + q + ' כפית';
      } else if (/כף|כפות/.test(line)) {
        ing.qty = Math.round(q * (isLiq ? 240 : dryWeight(name)) / 16);
        ing.unit = isLiq ? 'מ"ל' : 'גרם'; ing.note = 'במקור ' + q + ' כף';
      } else if (/יח'|יחיד/.test(line)) { ing.qty = q; ing.unit = "יח'"; ing.unitWeight = 50; }
      if (FLOUR.some(k => name.includes(k))) ing.flour = true;
      if (isLiq) ing.liquid = true;
      if (name) ingredients.push(ing);
      return;
    }
    if (line.length > 12) steps.push({ id: 's' + i, text: line, temp: parseTemp(line), tempUnit: 'C', minutes: parseTime(line) });
  });
  return { ingredients, steps };
}

const SMART_PROMPT = (text, cats) => `נתח את המתכון הבא והחזר JSON בלבד, בלי טקסט נוסף.
סכימה: {"name":string,"category":one of ${JSON.stringify(cats)},"tags":string[],"ingredients":[{"name":string,"qty":number,"unit":"גרם"|"ק\\"ג"|"מ\\"ל"|"ליטר"|"יח'","unitWeight":number|null,"flour":boolean,"liquid":boolean,"note":string}],"steps":[{"text":string,"temp":string,"minutes":number}]}
כללים: קטגוריה ויחידה רק מהרשימות הסגורות. כוסות וכפות להמיר לגרם או מ"ל ולשמור את הניסוח המקורי בשדה note. לשמור את נוסח השלבים כמעט כפי שהוא. אסור להמציא רכיבים, כמויות, זמנים, טמפרטורות או מחירים. אין שדה מחיר.
המתכון:
${text}`;

window.PN_PARSER={parseTime,parseTemp,parseLocal,SMART_PROMPT};

})(); }
