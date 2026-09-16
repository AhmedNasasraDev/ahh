// קבוצות פרטיות, קורסים והרשאות — נתוני Demo בלבד.
// כל מה שכאן הוא Mock: אין auth, אין חברות אמיתית, אין אכיפת הרשאות בשרת.
// ראו RECIPE_NOTEBOOK_IMPLEMENTATION_SPEC.md → REQUIRES BACKEND.
if (!window.PN_GROUPS) { (function(){

const ROLES = {
  owner:      { he:'בעל הקבוצה', rank:3, can:['manage','invite','teach','grade','perms'] },
  instructor: { he:'מדריך',      rank:2, can:['invite','teach','perms'] },
  member:     { he:'תלמיד',      rank:1, can:[] },
};

// ברירת המחדל להרשאות מתכון קבוצתי — הכי מגביל שיש
const PERM_DEFAULT = { view:true, save:false, print:false, download:false, shareOut:false };
const PERM_LABELS = [
  ['view',     'צפייה במתכון',        'בלי צפייה המתכון לא מופיע לתלמיד כלל'],
  ['save',     'שמירה למחברת האישית', 'נוצר עותק פרטי אצל התלמיד'],
  ['print',    'הדפסה',               'כולל שמירה כ־PDF'],
  ['download', 'הורדת קובץ',          'ייצוא המתכון כנתונים'],
  ['shareOut', 'שיתוף מחוץ לקבוצה',   'שליחה לאנשים שאינם חברי הקבוצה'],
];

const JOIN_METHODS = [
  ['invite',   'הזמנה אישית', 'המדריך שולח הזמנה לכתובת מייל או לטלפון'],
  ['link',     'קישור פרטי',  'קישור חד פעמי שפג בתוך 7 ימים'],
  ['code',     'קוד קבוצה',   'קוד שנמסר בשיעור, דורש אישור מנהל'],
  ['approval', 'אישור מנהל',  'כל בקשה מחכה לאישור ידני'],
];

const GROUPS = [
  {
    id:'g1', name:'קונדיטוריה מקצועית — מחזור י"ד', kind:'בית ספר לקונדיטוריה',
    privacy:'private', myRole:'member', code:'PT-4K9Q', joinBy:['invite','code','approval'],
    membersCount:18, instructor:'שף רונן אלמוג',
    note:'הקבוצה פרטית. לא ניתן למצוא אותה בחיפוש ולא להיכנס בלי הזמנה.',
    courses:[
      { id:'c1', name:'בצקים מועשרים', lessons:[
        { id:'l1', name:'שיעור 1 — בצק שמרים מועשר', date:'12.9', done:true,
          summary:'לישה, פיתוח גלוטן, קיפול וחלוקה. שני בצקים באותו יום.',
          items:[
            { id:'gr1', recipeId:'brioche', name:'בריוש נאנט', perms:{ view:true, save:true, print:true, download:false, shareOut:false } },
            { id:'gr2', recipeId:'croissant', name:'קרואסון חמאה', perms:{ view:true, save:true, print:false, download:false, shareOut:false } },
          ] },
        { id:'l2', name:'שיעור 2 — מלית ושוקולד', date:'19.9', done:false,
          summary:'גנאש ביחסים שונים, והרכבה בתוך בצק מועשר.',
          items:[
            { id:'gr3', recipeId:'ganache', name:'גנאש שוקולד מריר', perms:{ view:true, save:true, print:true, download:true, shareOut:false } },
            { id:'gr4', recipeId:'brioche-choc', name:'בריוש שוקולד', perms:{ view:true, save:false, print:false, download:false, shareOut:false } },
          ] },
      ] },
      { id:'c2', name:'קרמים בסיסיים', lessons:[
        { id:'l3', name:'שיעור 3 — קרם פטיסייר', date:'26.9', done:false,
          summary:'בישול עמילן, קירור מהיר ובטיחות מזון.',
          items:[
            { id:'gr5', recipeId:'pastrycream', name:'קרם פטיסייר', perms:{ view:true, save:true, print:true, download:false, shareOut:false } },
          ] },
      ] },
    ],
  },
  {
    id:'g2', name:'צוות מטבח — מסעדת ליבנה', kind:'צוות מקצועי',
    privacy:'private', myRole:'instructor', code:'LV-88TR', joinBy:['invite','link'],
    membersCount:6, instructor:'אתם',
    note:'אתם מדריכים בקבוצה הזו, ולכן אפשר לקבוע הרשאות לכל מתכון.',
    courses:[
      { id:'c3', name:'נוסחאות בית', lessons:[
        { id:'l4', name:'משמרת בוקר', date:'קבוע', done:false,
          summary:'הנוסחאות שהצוות מייצר בכל בוקר.',
          items:[
            { id:'gr6', recipeId:'croissant', name:'קרואסון חמאה', perms:{ view:true, save:true, print:true, download:true, shareOut:false } },
            { id:'gr7', recipeId:'pastrycream', name:'קרם פטיסייר', perms:{ view:true, save:false, print:true, download:false, shareOut:false } },
          ] },
      ] },
    ],
  },
];

const PENDING = [
  { id:'p1', groupId:'g2', name:'נועה בר־אור', via:'קישור פרטי', at:'לפני שעתיים' },
  { id:'p2', groupId:'g2', name:'איתי פרץ', via:'קוד קבוצה', at:'אתמול' },
];

function group(id) { return GROUPS.find(g => g.id === id) || null; }
function item(groupId, itemId) {
  const g = group(groupId); if (!g) return null;
  for (const c of g.courses) for (const l of c.lessons) {
    const it = l.items.find(x => x.id === itemId);
    if (it) return { item:it, lesson:l, course:c, group:g };
  }
  return null;
}
function can(g, action) {
  const r = ROLES[(g && g.myRole) || 'member'];
  return !!(r && r.can.includes(action));
}
function counts(g) {
  let lessons = 0, items = 0;
  (g.courses || []).forEach(c => c.lessons.forEach(l => { lessons++; items += l.items.length; }));
  return { courses:(g.courses || []).length, lessons, items };
}

window.PN_GROUPS = { ROLES, PERM_DEFAULT, PERM_LABELS, JOIN_METHODS, GROUPS, PENDING, group, item, can, counts };

})(); }
