<!-- GENERATED from artifact/inventory.json by artifact/scripts/report.mjs.
     Edit the JSON, not this file. -->

# Spec Coverage — המפרט כ-checklist

50 דרישות. **COMPLETED**: 36 · **PARTIAL**: 8 · **NOT BUILT**: 4 · **BLOCKED**: 2

COMPLETED פירושו שהיכולת קיימת בפועל וניתן להוכיח אותה מהקוד ומהבדיקות — לא «מצאתי קומפוננטה».

מקור האמת: הקוד ב-commit `7e5031c`. כל שורה כאן ניתנת למיפוי לקובץ בפרויקט.

| דרישה | מימוש | Route | קובץ | UI | Backend | Test | E2E | Status | הערה |
|---|---|---|---|---|---|---|---|---|---|
| §2 מסך 1 — Onboarding | OnboardingScreen | `/onboarding` | `routes/OnboardingScreen.tsx` | כן | profiles | כן | כן | **COMPLETED** |  |
| §2 מסך 2 — בית | HomeScreen | `/home` | `routes/HomeScreen.tsx` | כן | recipes + mirror | כן | כן | **COMPLETED** |  |
| §2 מסך 3 — מחברת | NotebookScreen | `/notebook` | `routes/NotebookScreen.tsx` | כן | recipes | כן | כן | **COMPLETED** |  |
| §2 מסך 4 — מתכון | RecipeScreen | `/recipe/:id` | `routes/RecipeScreen.tsx` | כן | recipes + versions + notes + images | כן | כן | **COMPLETED** |  |
| §2 מסך 5 — עריכה | RecipeEditScreen | `/recipe/:id/edit` | `routes/RecipeEditScreen.tsx` | כן | save_recipe | כן | כן | **COMPLETED** |  |
| §2 מסך 6 — הדבקה | PasteScreen | `/paste` | `routes/PasteScreen.tsx` | כן | save_recipe | כן | לא | **PARTIAL** | פענוח מקומי בלבד. «פענוח חכם» (proxy ל-Claude, HANDOFF §6) אינו קיים בקוד |
| §2 מסך 7 — Cook Mode | CookScreen | `/recipe/:id/cook` | `routes/CookScreen.tsx` | כן | קריאה + IndexedDB | כן | כן | **COMPLETED** |  |
| §2 מסך 8 — תווית | LabelScreen | `/recipe/:id/label` | `routes/LabelScreen.tsx` | כן | קריאה | כן | לא | **COMPLETED** | שורת ה-HACCP תלויה באצווה קיימת — ואין UI ליצור אצווה (ראו F3) |
| §2 מסך 9 — דף הזמנה | OrderScreen | `/recipe/:id/order` | `routes/OrderScreen.tsx` | כן | קריאה | כן | לא | **COMPLETED** |  |
| §2 מסך 10 — יום ייצור | PlansScreen + PlanScreen | `/plans · /plan/:id` | `routes/PlanScreen.tsx` | כן | production_plans + items + stock | דרך flow בלבד | לא | **COMPLETED** | אין קובץ בדיקה ייעודי למסכים עצמם |
| §2 מסך 11 — מלאי ומחירים | IngredientsScreen | `/ingredients` | `routes/IngredientsScreen.tsx` | כן | ingredient_catalog + record_purchase | כן | לא | **PARTIAL** | מחירים וקניות קיימים. «מלאי» ככמות במחסן קיים רק כ-onHand בתוך תוכנית ייצור, ואין route /stock שה-TabBar מכיר |
| §2 מסך 12 — מצב לימוד | — | `—` | `—` | לא | — | לא | לא | **NOT BUILT** | אין קומפוננטה, אין route. קיים בפרוטוטייפ (learn.js) ולא הועבר |
| §2 מסך 13 — אצוות | — | `—` | `features/batch/haccp.ts (מנוע בלבד)` | לא | batches (נקראות בלבד) | haccp.test.ts (13) | לא | **NOT BUILT** | אין מסך ואין נתיב כתיבה: ל-Repository אין שום מתודת batch |
| §2 מסך 14 — השוואת גרסאות | VersionCompare | `(בתוך VersionHistory)` | `features/recipe/VersionCompare.tsx` | חלקי | recipe_versions | VersionCompare.test.tsx | לא | **PARTIAL** | קיים כקומפוננטה בתוך היסטוריית הגרסאות, לא כמסך עם route כמו במפרט |
| §2 מסך 15 — קבוצות | GroupsScreen | `/groups` | `routes/GroupsScreen.tsx` | כן | groups + members + requests | כן | חלקי | **COMPLETED** | E2E בדפדפן מכסה רק את המצב ללא שרת |
| §2 מסך 16 — קבוצה | GroupScreen | `/group/:id` | `routes/GroupScreen.tsx` | כן | courses/lessons/items + roster | כן | לא | **COMPLETED** |  |
| §2 מסך 17 — מתכון קבוצתי | GroupRecipeScreen | `/group/:id/item/:itemId` | `routes/GroupRecipeScreen.tsx` | כן | recipes_group_read + save_group_recipe_copy | כן | לא | **COMPLETED** |  |
| §2 מסך 18 — הרשאות | PermsScreen | `/group/:id/perms` | `routes/PermsScreen.tsx` | כן | members_role + invites + items_write | כן | לא | **COMPLETED** | כולל חברים, תפקידים, בקשות והזמנות — המפרט לא נותן להם מסך נפרד |
| §2 מסך 19 — עוד | MoreScreen | `/more` | `routes/MoreScreen.tsx` | כן | auth session | דרך harness | כן | **COMPLETED** | אין קובץ בדיקה ייעודי |
| §2 מסך 20 — הגדרות | SettingsScreen | `/settings` | `routes/SettingsScreen.tsx` | כן | profiles + avatars + auth | כן | כן | **COMPLETED** |  |
| §2 מסך 21 — כלי המדידה שלי | ToolsScreen | `/tools` | `routes/ToolsScreen.tsx` | כן | profiles.tools + calibrations | כן | כן | **COMPLETED** |  |
| §3 Progressive disclosure | PROFILES + prefs.pro | `כל המסכים` | `packages/engine/src/profiles.ts` | כן | profiles.profile/pro | profiles.test.ts | כן | **COMPLETED** |  |
| §4 Onboarding פעם אחת | OnboardingGate | `—` | `app/OnboardingGate.tsx` | כן | profiles.onboarding_done | AppSession.test.tsx | כן | **COMPLETED** |  |
| §5 המרות יחידה | engine convert + ConvertSheet | `/recipe/:id` | `packages/engine/src/convert.ts` | כן | density_table | conversion.test.ts + parity.test.ts | חלקי | **COMPLETED** |  |
| §5.1 סדר קדימות של מקור | SourceBadge + resolve | `/recipe/:id` | `components/SourceBadge.tsx` | כן | calibrations + density_table | כן | לא | **COMPLETED** |  |
| §5.4 המרת מתכון שלם | שלושה מצבי תצוגה | `/recipe/:id` | `routes/RecipeScreen.tsx (VIEW_TABS)` | חלקי | — | RecipeScreen.test.tsx | לא | **PARTIAL** | שלושת המצבים קיימים והכיתוב «המתכון לא השתנה» קיים. «שמירה כגרסה» מתצוגה מומרת — אינו קיים |
| §6 שינוי מנות ותפוקה | ארבעה מצבי סקיילינג | `/recipe/:id` | `routes/RecipeScreen.tsx` | כן | — | RecipeScreen.test.tsx | לא | **PARTIAL** | המפרט עצמו מסמן «נפח סופי» כחסר — הוא עדיין חסר |
| §7 תבניות וציוד | PanCard + שדה ציוד | `/recipe/:id · /recipe/:id/edit` | `features/recipe/PanCard.tsx` | כן | recipes.pan/equipment | PanCard.test.tsx | לא | **COMPLETED** |  |
| §8 הערות אישיות | PrivateNote + הערת פריט | `/recipe/:id · /group/:id/item/:itemId` | `features/recipe/PrivateNote.tsx` | כן | private_notes (RLS own) | PrivateNote.test.tsx + private-notes.sql | לא | **COMPLETED** |  |
| §9 גרסאות מתכון | VersionHistory + restore | `/recipe/:id` | `features/recipe/VersionHistory.tsx` | כן | recipe_versions + restore RPC | VersionFlow + version-roundtrip | לא | **COMPLETED** |  |
| §10 קבוצות, קורסים ותפקידים | 4 מסכים + צ׳אט | `/groups …` | `routes/Group*.tsx` | כן | מיגרציות 0023-0037 | 5 חבילות SQL + 5 קובצי מסך | חלקי | **COMPLETED** | הצ׳אט לא הורץ מול שרת מהסביבה הזאת (F14) |
| §10.2 ארבע דרכי הצטרפות | invite/link/code/request | `/groups · /join/:token` | `migrations 0027/0030/0031` | כן | group_invites + join_requests | group-joining.sql + roles-and-invitations.sql | חלקי | **COMPLETED** |  |
| §10.4 הרשאות פר־מתכון | 5 מתגים + כרטיס «מה מותר לי» | `/group/:id/perms · item` | `routes/PermsScreen.tsx` | כן | group_recipe_items | group-teaching.sql (36) | לא | **COMPLETED** |  |
| §11 שמירת עותק למחברת | save_group_recipe_copy | `/group/:id/item/:itemId` | `migrations 0027/0036` | כן | RPC (server-side perm_save) | group-teaching.sql | לא | **COMPLETED** |  |
| §12 מודל פרטיות | RLS + roster ללא מייל | `—` | `migrations 0023-0037` | כן | RLS | rls-isolation.sql + group-teaching.sql | לא | **COMPLETED** |  |
| §13 יכולות מקצועיות | תמחור, food cost, DDT, HACCP חלקי | `/recipe/:id` | `features/pricing/*` | חלקי | ingredient_catalog | foodCost.test.ts ועוד | לא | **PARTIAL** | אצוות וניסיונות אינם מוצגים/נכתבים מה-UI |
| §13a HACCP ומעקב אצוות | haccpOf + שורת תווית | `/recipe/:id/label` | `features/batch/haccp.ts` | חלקי | batches (קריאה בלבד) | haccp.test.ts (13) | לא | **PARTIAL** | אין מסך אצוות, אין תיעוד מצולם, אין נתיב כתיבה (F3) |
| §14 Cook Mode | CookScreen | `/recipe/:id/cook` | `routes/CookScreen.tsx` | כן | mirror | CookScreen.test.tsx | כן | **COMPLETED** |  |
| §15 RTL ומספרים | dir=rtl + פורמט מספרים | `כל המסכים` | `styles/global.css` | כן | — | probe-nav (RTL) + בדיקות מסך | כן | **COMPLETED** |  |
| §15 ערבית | — | `—` | `routes/SettingsScreen.tsx (הצהרה)` | לא | — | SettingsScreen.test.tsx | לא | **NOT BUILT** | ההגדרות אומרות במפורש «בהכנה» ואין מתג שאינו עושה דבר |
| §16 Design System | tokens.css + בדיקת ניגודיות | `כל המסכים` | `styles/tokens.css` | כן | — | tokens.test.ts (80) | כן | **COMPLETED** |  |
| §17 אמיתי מול Demo | banner + סירובי demo repo | `כל המסכים` | `shell/AppShell.tsx` | כן | — | localDemoRepository.test.ts | כן | **COMPLETED** |  |
| HANDOFF §1 Database | 37 מיגרציות | `—` | `supabase/migrations` | — | 28 טבלאות | schema:check + חבילות SQL | — | **COMPLETED** |  |
| HANDOFF §2 Auth | AuthScreen + AuthProvider | `(AuthGate)` | `auth/*.tsx` | כן | GoTrue | אין בדיקה ל-AuthScreen | לא | **PARTIAL** | F11 |
| HANDOFF §3 RLS | כל הטבלאות | `—` | `supabase/migrations` | — | RLS | rls-isolation + 5 חבילות | — | **COMPLETED** |  |
| HANDOFF §4 RPC | 34 פונקציות מוצהרות | `—` | `supabase/migrations` | — | RPC | schema:check + חבילות SQL | — | **COMPLETED** |  |
| HANDOFF §5 Storage | recipe-images + avatars | `/recipe/:id · /settings` | `migrations 0029/0031` | כן | buckets פרטיים | recipe-images.sql (27) | לא | **COMPLETED** | URL חתום אינו נבדק מדפדפן מהסביבה הזאת |
| HANDOFF §6 Security — proxy ל-Claude | — | `—` | `—` | לא | — | — | — | **NOT BUILT** | «פענוח חכם» דורש proxy עם מפתח בצד שרת. לא נבנה |
| HANDOFF §4 מייל הזמנות | Edge Function send-group-invite | `(נקראת מ-PermsScreen)` | `supabase/functions/send-group-invite` | כן | Resend | — | לא | **BLOCKED** | נפרסה ופעילה; ממתינה לאימות דומיין ול-3 secrets. מעולם לא נקראה |
| §10 צ׳אט בזמן אמת | Realtime Broadcast | `/group/:id` | `migrations 0032 + GroupChat.tsx` | כן | realtime.messages RLS | group-chat.sql (45) + GroupChat.test.tsx (34) | לא | **BLOCKED** | הסביבה הזאת חוסמת *.supabase.co — הערוץ לא נפתח אף פעם מדפדפן |

## ממצאים (24)

| # | סוג | מה | איפה | חומרה |
|---|---|---|---|---|
| F1 | קוד מת | NotImplementedScreen אינו מוזכר באף route ובאף קומפוננטה | `apps/web/src/routes/NotImplementedScreen.tsx` | נמוך |
| F2 | ניווט | TabBar.owns כולל '/stock' — אין route כזה. tabOf('/stock') יאיר טאב לנתיב שאי אפשר להגיע אליו | `apps/web/src/shell/TabBar.tsx` | נמוך |
| F3 | פיצ'ר לא מחובר | אין שום נתיב שכותב אצווה: ל-Repository אין מתודת batch. שורת ה-HACCP בתווית תלויה באצווה שרק המסד יכול לקבל | `features/batch/haccp.ts · routes/LabelScreen.tsx · data/repository.ts` | בינוני |
| F4 | פיצ'ר לא מחובר | trials נקראות אל תוך אובייקט המתכון ואינן מוצגות בשום מסך | `data/mappers.ts` | נמוך |
| F5 | לא נבנה | מסך 12 «מצב לימוד» — אין קומפוננטה ואין route | `—` | בינוני |
| F6 | לא נבנה | מסך 13 «אצוות» — אין קומפוננטה ואין route | `—` | בינוני |
| F7 | חלקי | מסך 14 «השוואת גרסאות» קיים כקומפוננטה בתוך VersionHistory, לא כמסך | `features/recipe/VersionCompare.tsx` | נמוך |
| F8 | חלקי | §5.4: שלושת מצבי התצוגה קיימים; «שמירה כגרסה» מתצוגה מומרת אינה קיימת | `routes/RecipeScreen.tsx` | נמוך |
| F9 | חלקי | §6: מצב הסקיילינג «נפח סופי» חסר — המפרט עצמו מסמן אותו כחסר | `routes/RecipeScreen.tsx` | נמוך |
| F10 | לא נבנה | «פענוח חכם» בהדבקה — אין proxy ואין קריאה ל-Claude | `routes/PasteScreen.tsx` | בינוני |
| F11 | כיסוי בדיקות | ל-AuthScreen אין קובץ בדיקה ואינו נבדק בדפדפן | `routes/AuthScreen.tsx` | בינוני |
| F12 | כיסוי בדיקות | ל-PlansScreen ול-PlanScreen אין קובצי בדיקה ייעודיים (מכוסים דרך PlanningFlow) | `routes/Plan*.tsx` | נמוך |
| F13 | כיסוי בדיקות | ל-MoreScreen אין קובץ בדיקה ייעודי | `routes/MoreScreen.tsx` | נמוך |
| F14 | לא אומת | הצ׳אט וה-Realtime מעולם לא הורצו מדפדפן מול השרת — הסביבה חוסמת *.supabase.co | `features/groups/GroupChat.tsx` | גבוה |
| F15 | חסום | Edge Function send-group-invite נפרסה ולא נקראה; חסרים אימות דומיין ו-3 secrets | `supabase/functions/send-group-invite` | בינוני |
| F16 | כיסוי בדיקות | מסכי הקבוצות אינם בטבלת ה-routes של appHarness — אין flow test ברמת session שעובר עליהם | `apps/web/src/test/appHarness.tsx` | נמוך |
| F17 | לא נבנה | ערבית (§15/§17) אינה ממומשת; ההגדרות מצהירות «בהכנה» | `routes/SettingsScreen.tsx` | נמוך |
| F18 | ביצועים | 50 אזהרות multiple permissive policies מה-linter — עלות מדודה ומקובלת, מתועדת ב-0037 | `supabase/migrations/0037_advisor_findings.sql` | נמוך |
| F19 | הגדרת פרויקט | Leaked password protection כבוי ב-Supabase Auth — החלטה של בעל הפרויקט | `project setting` | בינוני |
| F20 | בקרת גרסאות | 39 מיגרציות מוחלות מול 37 קבצים: שתי מיגרציות תיקון מ-stage 10 הוטמעו בקבצים הממוספרים ונשארו בהיסטוריה המרוחקת | `supabase/migrations` | נמוך |
| F21 | הערת תצוגה | קישור ההזמנה נבנה מ-window.location.origin, ולכן בתצוגה הוא מציג את הכתובת של ה-Artifact | `routes/PermsScreen.tsx` | — |
| F22 | החלטה מתועדת | טוקן הזמנה נשמר כטקסט גלוי — הנימוק ב-0027 (קישור פתוח חייב להיות קריא שוב) | `supabase/migrations/0027` | נמוך |
| F23 | UX במוצר | שמירת תוכנית ייצור מצליחה בלי שום אישור על המסך — אין «נשמר», אין toast, המסך זהה לפני ואחרי. נמצא בסריקת הכפתורים | `apps/web/src/routes/PlanScreen.tsx (onSave)` | נמוך |
| F24 | מגבלת Artifact | שלושת כפתורי «הדפסה» (תווית, דף הזמנה, מתכון קבוצתי) קוראים ל-window.print(). בתוך ה-Artifact ייתכן שה-sandbox חוסם הדפסה — הכפתורים הם של המוצר ולא נשתנו | `LabelScreen · OrderScreen · GroupRecipeScreen` | — |

## הערות התצוגה (ARTIFACT FIXTURE)

- ה-Artifact הוא האפליקציה עצמה: המסכים, הקומפוננטות, הטקסטים, הניווט וה-CSS מיובאים מ-apps/web/src ללא שינוי.
- שני דברים נאלצו להשתנות מחוץ למוצר: MemoryRouter במקום BrowserRouter (לעמוד Artifact אין שליטה בשורת הכתובת), ו-AuthProvider מקבל client={null} — התפר הקיים שלו לבדיקות.
- dir="rtl" ו-lang="he" נקבעים בטעינה, כי בפרודקשן הם יושבים על <html> ב-apps/web/index.html והפלטפורמה היא שמחזיקה את <html> כאן.
- capabilities() מדווח source: 'supabase', canWrite: true. זה שקר לגבי ה-Artifact, והדרך היחידה לראות את המסכים כמו שמשתמש מחובר רואה אותם. תג «סימולציה מקומית» בפינה אומר זאת, ואינו יכול לחסום לחיצה (pointer-events: none).
- הנתונים: חמשת מתכוני הדמו הם נתוני המוצר (data/demoRecipes.ts). קבוצות, צ׳אט, הזמנות, בקשות, תוכנית ייצור, שישה חומרי גלם וגרסאות — ARTIFACT FIXTURE.
- פעולות שעובדות מקומית בתוך ה-Artifact: יצירת/עריכת/מחיקת מתכון (כולל סירוב מחיקה של מתכון בסיס בשימוש), שחזור גרסה, העלאת תמונה, יצירת קבוצה, בקשת הצטרפות בקוד, פדיון הזמנה, שליחה/עריכה/מחיקה בצ׳אט, שינוי תפקיד והרשאות, שמירת הערה אישית, שמירת עותק §11, שם ותמונת פרופיל, כיול כלים, חומרי גלם ותוכנית ייצור.
- אין Supabase, אין auth, אין Realtime, אין Storage ואין מייל. הודעות צ׳אט חדשות נמסרות בזיכרון הדף ולא בערוץ Realtime.
- רענון הדף מאפס את הנתונים — שכבת הסימולציה נבנית מחדש בכל טעינה.
- כלי בדיקה אחד שאינו במוצר: «משתמש פעיל בסימולציה» מעל הצ׳אט. הוא מחליף את החשבון שה-Artifact מדמה בין חברי ה-roster של אותה קבוצה, דרך אותו תפר שהבדיקות משתמשות בו (AppDataProvider repository + userId). אין במוצר מחליף משתמשים, והכלי מסומן במסגרת מקוטעת ובשורת הסבר.
- ההרשאות בצ׳אט אינן מגיעות מהכלי אלא מ-features/groups/roles.ts ומ-test/fakeGroups.ts: תלמיד אינו מקבל «הכרזה», דרגה≥2 מוחקת הודעה של אחר ואינה עורכת אותה, וקבוצה שבה החשבון אינו חבר אינה נראית כלל.
- מה נשמר במעבר בין משתמשים בסימולציה: הודעות, סימני קריאה, שמות, תמונות פרופיל ותפקידי חברים. מה נבנה מחדש מהזרע: קורסים, שיעורים, פריטים והרשאות פריט שנוצרו באותה סשן.
