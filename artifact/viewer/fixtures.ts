/*
  ARTIFACT FIXTURE — NOT PRODUCTION DATA.

  ─────────────────────────────────────────────────────────────────────────────
  WHAT THIS FILE IS

  A repository, in the shape of `apps/web/src/data/repository.ts`, that feeds
  the EXISTING screens with enough data for a person to look at them. It exists
  only for the audit viewer in this directory. Nothing here is imported by the
  product, and no product file was changed to accommodate it.

  WHAT IT IS MADE OF, AND WHY THAT ORDER

    · `createLocalDemoRepository()` — PRODUCTION code, and the source of the
      five demo recipes (`data/demoRecipes.ts`, generated from the prototype).
      Reads come from it wherever it has real answers.
    · `createFakeGroups()` — the fixture layer that ALREADY EXISTS in the
      project, at `apps/web/src/test/fakeGroups.ts`. It enforces the same rank
      model the policies do, so a group screen in the viewer refuses what the
      database would refuse.
    · a few local overrides, below, for the paths the demo repository answers
      with "there is nowhere to write": the catalog, the plans, personal notes,
      and saving a recipe.

  THE ONE THING THAT IS DELIBERATELY NOT HONEST, AND WHERE IT IS DISCLOSED

  `capabilities()` reports `source: 'supabase', canWrite: true`, which is a
  LIE about this viewer and the only way to see what the screens look like in
  production: several of them read that field and, on 'local-demo', correctly
  replace their controls with "there is no server here" (that state is worth
  seeing too, and the real demo build at `npm run e2e:build` shows it).

  So the product UI in the viewer renders as it does for a signed-in account,
  and the disclosure lives OUTSIDE the product UI, in the artifact inspector,
  which says on every screen that no request leaves the page.

  WHAT IS NOT FAKED

  Nothing that needs a server is simulated: no Supabase, no auth, no realtime
  socket, no storage, no edge function. Signed image URLs come back null, which
  is a real state the gallery already handles. Chat messages are delivered by
  the fixture's own in-memory publish, not by a socket — the inspector says so.
*/

import type { Calibration, MeasurementPrefs, Recipe } from '@recipe-notebook/engine';
import { defaultPrefs, ingredientKeyOf } from '@recipe-notebook/engine';
import { createLocalDemoRepository } from '../../apps/web/src/data/localDemoRepository.js';
import { createFakeGroups, type FakeGroupSeed } from '../../apps/web/src/test/fakeGroups.js';
import { DEMO_RECIPES } from '../../apps/web/src/data/demoRecipes.js';
import { basePriceOf, type CatalogItem } from '../../apps/web/src/features/pricing/catalog.js';
import type { ProductionPlan } from '../../apps/web/src/features/planning/plan.js';
import type { PurchaseRecord } from '../../apps/web/src/features/pricing/purchases.js';
import {
  RecipeInUseError,
  WriteNotAllowedError,
  type PlanSummary,
  type RecipeImage,
  type Repository,
  type RepositoryCapabilities,
  type StoredVersion,
} from '../../apps/web/src/data/repository.js';
import { convertErrorText, convertToWebp } from '../../apps/web/src/features/images/convert.js';
import type { ChatMessage, GroupMember } from '../../apps/web/src/features/groups/types.js';
import type { InviteView } from '../../apps/web/src/features/groups/invites.js';

/* ── the ingredient centre ───────────────────────────────────────────────── */

/**
 * Six materials, keyed the way the engine keys them: `ingredientKeyOf` falls
 * back to the normalised NAME, so these keys are computed from the names that
 * actually appear in the demo recipes rather than typed by hand. That is what
 * makes the costing panel in the viewer compute from these prices — real
 * engine, fixture numbers.
 */
const material = (
  name: string,
  purchaseUnit: CatalogItem['purchaseUnit'],
  packageQty: number,
  packageCount: number,
  purchaseTotal: number,
  allergens: string[] = [],
): CatalogItem => ({
  id: `fixture-${ingredientKeyOf({ name })}`,
  key: ingredientKeyOf({ name }),
  name,
  purchaseUnit,
  packageQty,
  packageCount,
  purchaseTotal,
  usablePct: null,
  supplier: 'ספק לדוגמה',
  purchasedAt: '2026-09-10',
  priceUpdatedAt: '2026-09-10',
  note: '',
  purchasePrice: null,
  price: null,
  priceUnit: null,
  allergens,
});

/** The database derives these three columns; `basePriceOf` is what it mirrors. */
function derive(item: CatalogItem): CatalogItem {
  const d = basePriceOf(item);
  return d
    ? { ...item, purchasePrice: d.purchase, price: d.price, priceUnit: d.unit }
    : { ...item, purchasePrice: null, price: null, priceUnit: null };
}

const CATALOG: CatalogItem[] = [
  material('קמח לחם 13% חלבון', 'kg', 25, 1, 89, ['גלוטן']),
  material('חמאה 82%', 'kg', 1, 10, 340, ['חלב']),
  material('סוכר', 'kg', 25, 1, 62),
  material('חלב 3%', 'l', 1, 12, 78, ['חלב']),
  material('ביצים', 'unit', 1, 30, 36, ['ביצים']),
  material('שוקולד מריר 64%', 'kg', 5, 1, 195, ['חלב', 'סויה']),
].map(derive);

/* ── one production plan ─────────────────────────────────────────────────── */

const PLAN: ProductionPlan = {
  id: 'fixture-plan-1',
  name: 'יום ייצור — חמישי',
  planDate: '2026-09-18',
  note: 'תוכנית לדוגמה בתצוגה. לא נשמרה בשום מקום.',
  locked: false,
  lockedAt: null,
  snapshot: null,
  updatedAt: '2026-09-17T06:00:00Z',
  items: [
    { id: 'pi1', recipeId: 'brioche', qty: 40, qtyUnit: 'unit', readyAt: '07:00', note: '' },
    { id: 'pi2', recipeId: 'croissant', qty: 60, qtyUnit: 'unit', readyAt: '07:30', note: '' },
    { id: 'pi3', recipeId: 'pastrycream', qty: 2, qtyUnit: 'kg', readyAt: null, note: '' },
  ],
  onHand: {},
};

/* ── §10: two groups, so both sides of the permission model are visible ──── */

const roster = (over: Partial<GroupMember> & { userId: string }): GroupMember => ({
  displayName: null,
  avatarPath: null,
  role: 'member',
  rank: 1,
  joinedAt: '2026-09-01T00:00:00Z',
  ...over,
});

/** The account the viewer is signed in as, as far as the screens can tell. */
export const VIEWER_USER_ID = 'viewer-me';

const STUDENT_GROUP: FakeGroupSeed = {
  id: 'group-course',
  name: 'קורס קונדיטוריה — מחזור ב׳',
  kind: 'בית ספר לקונדיטוריה',
  note: 'הקבוצה פרטית. אי אפשר למצוא אותה בחיפוש ואי אפשר להיכנס בלי הזמנה.',
  code: 'PT-4K9Q',
  joinBy: ['invite', 'code'],
  // A STUDENT here: this is the half of §10 that has no teaching controls.
  myRole: 'member',
  roster: [
    roster({ userId: VIEWER_USER_ID, displayName: 'אחמד נסאסרה' }),
    roster({ userId: 'u-teacher', displayName: 'רונן אלמוג', role: 'owner', rank: 4 }),
    roster({ userId: 'u-noa', displayName: 'נועה בר־אור' }),
    roster({ userId: 'u-itay', displayName: '' }),
  ],
  courses: [
    {
      id: 'course-doughs',
      groupId: 'group-course',
      name: 'בצקים מועשרים',
      ord: 0,
      lessons: [
        {
          id: 'lesson-1',
          courseId: 'course-doughs',
          name: 'שיעור 1 — בצק שמרים מועשר',
          date: '2026-09-12',
          summary: 'לישה, פיתוח גלוטן, קיפול וחלוקה. שני בצקים באותו יום.',
          done: true,
          ord: 0,
          items: [
            {
              id: 'item-brioche',
              lessonId: 'lesson-1',
              recipeId: 'brioche',
              name: 'בריוש נאנט',
              ord: 0,
              // save ON: §11's copy button is reachable from this one.
              perms: { view: true, save: true, print: true, download: false, shareOut: false },
              createdAt: '2026-09-11T08:00:00Z',
            },
            {
              id: 'item-croissant',
              lessonId: 'lesson-1',
              recipeId: 'croissant',
              name: 'קרואסון חמאה',
              ord: 1,
              // save OFF: the other half of §10.4, with the spec's own wording.
              perms: { view: true, save: false, print: false, download: false, shareOut: false },
              createdAt: '2026-09-11T08:05:00Z',
            },
          ],
        },
        {
          id: 'lesson-2',
          courseId: 'course-doughs',
          name: 'שיעור 2 — מלית ושוקולד',
          date: '2026-09-19',
          summary: 'גנאש ביחסים שונים, והרכבה בתוך בצק מועשר.',
          done: false,
          ord: 1,
          items: [],
        },
      ],
    },
  ],
};

const STAFF_GROUP: FakeGroupSeed = {
  id: 'group-team',
  name: 'צוות מטבח — משמרת בוקר',
  kind: 'צוות מקצועי',
  note: 'הנוסחאות שהצוות מייצר בכל בוקר.',
  code: 'LV-88TR',
  joinBy: ['invite', 'link'],
  // OWNER here: every staff control in §10 is reachable from this group.
  myRole: 'owner',
  roster: [
    roster({ userId: VIEWER_USER_ID, displayName: 'אחמד נסאסרה', role: 'owner', rank: 4 }),
    roster({ userId: 'u-dana', displayName: 'דנה לוי', role: 'instructor', rank: 2 }),
    roster({ userId: 'u-yossi', displayName: 'יוסי אברהם' }),
  ],
  courses: [
    {
      id: 'course-house',
      groupId: 'group-team',
      name: 'נוסחאות בית',
      ord: 0,
      lessons: [
        {
          id: 'lesson-morning',
          courseId: 'course-house',
          name: 'משמרת בוקר',
          date: null,
          summary: '',
          done: false,
          ord: 0,
          items: [
            {
              id: 'item-pastrycream',
              lessonId: 'lesson-morning',
              recipeId: 'pastrycream',
              name: 'קרם פטיסייר וניל',
              ord: 0,
              perms: { view: true, save: true, print: true, download: true, shareOut: false },
              createdAt: '2026-09-01T05:00:00Z',
            },
            {
              id: 'item-ganache',
              lessonId: 'lesson-morning',
              recipeId: 'ganache',
              name: 'גנאש שוקולד מריר 64%',
              ord: 1,
              // view OFF: staff see it greyed as "מוסתר"; a member sees nothing.
              perms: { view: false, save: false, print: false, download: false, shareOut: false },
              createdAt: '2026-09-01T05:02:00Z',
            },
          ],
        },
      ],
    },
  ],
};

const message = (
  over: Partial<ChatMessage> & { seq: number; groupId: string; authorId: string },
): ChatMessage => ({
  id: `msg-${over.groupId}-${over.seq}`,
  body: '',
  kind: 'text',
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: '2026-09-17T07:00:00Z',
  ...over,
});

const MESSAGES: ChatMessage[] = [
  message({
    seq: 1,
    groupId: 'group-course',
    authorId: 'u-teacher',
    kind: 'announcement',
    body: 'שיעור 2 נדחה ליום שישי. מי שלא קיבל הודעה — להגיד לי כאן.',
    createdAt: '2026-09-16T09:00:00Z',
  }),
  message({
    seq: 2,
    groupId: 'group-course',
    authorId: 'u-noa',
    body: 'איזו חמאה להביא לקיפולים?',
    createdAt: '2026-09-16T09:12:00Z',
  }),
  message({
    seq: 3,
    groupId: 'group-course',
    authorId: 'u-teacher',
    body: 'חמאת למינציה 84%. לא חמאה רגילה — היא נשברת בקיפול.',
    replyToId: 'msg-group-course-2',
    createdAt: '2026-09-16T09:20:00Z',
  }),
  message({
    seq: 4,
    groupId: 'group-course',
    authorId: VIEWER_USER_ID,
    body: 'תודה. אביא גם מדחום גלעין.',
    editedAt: '2026-09-16T09:31:00Z',
    createdAt: '2026-09-16T09:30:00Z',
  }),
  message({
    seq: 5,
    groupId: 'group-course',
    authorId: 'u-itay',
    body: '',
    deletedAt: '2026-09-16T10:00:00Z',
    createdAt: '2026-09-16T09:45:00Z',
  }),
  message({
    seq: 6,
    groupId: 'group-course',
    authorId: 'u-teacher',
    body: 'ומי שרוצה לתרגל לפני — הבריוש בשיעור פתוח לשמירה למחברת.',
    createdAt: '2026-09-17T06:10:00Z',
  }),
  message({
    seq: 7,
    groupId: 'group-team',
    authorId: 'u-dana',
    body: 'הקרם של אתמול יצא דליל. העליתי עמילן ב־5 גרם.',
    createdAt: '2026-09-17T05:40:00Z',
  }),
];

const INVITES: InviteView[] = [
  {
    id: 'invite-open',
    email: null,
    label: 'קישור למשמרת',
    token: 'fixture-token-open',
    status: 'pending',
    expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    createdAt: '2026-09-15T08:00:00Z',
    usedAt: null,
    revokedAt: null,
    replacesId: null,
  },
  {
    id: 'invite-expired',
    email: 'noa@example.com',
    label: '',
    token: 'fixture-token-expired',
    status: 'pending',
    expiresAt: '2026-09-01T08:00:00Z',
    createdAt: '2026-08-25T08:00:00Z',
    usedAt: null,
    revokedAt: null,
    replacesId: null,
  },
  {
    id: 'invite-used',
    email: 'dana@example.com',
    label: '',
    token: 'fixture-token-used',
    status: 'accepted',
    expiresAt: '2026-09-20T08:00:00Z',
    createdAt: '2026-09-10T08:00:00Z',
    usedAt: '2026-09-11T10:00:00Z',
    revokedAt: null,
    replacesId: null,
  },
];

/* ── the repository the viewer mounts ────────────────────────────────────── */

export function createViewerRepository(): Repository {
  const demo = createLocalDemoRepository();
  const groups = createFakeGroups({
    userId: VIEWER_USER_ID,
    groups: [STUDENT_GROUP, STAFF_GROUP],
    messages: MESSAGES,
    invites: INVITES,
    requests: [
      {
        id: 'req-1',
        groupId: 'group-team',
        userId: 'u-asker',
        note: 'עבדתי איתכם בקיץ',
        status: 'pending',
        createdAt: '2026-09-16T18:00:00Z',
        decidedAt: null,
      },
    ],
    lastRead: { 'group-course': 4 },
    identity: { displayName: 'אחמד נסאסרה', avatarPath: null },
    itemNotes: { 'item-brioche': 'התנור שלי חם ב־10 מעלות. לקצר ל־18 דקות.' },
    // `validToken` makes /join/:token refuse anything else, the way 0031 does.
    validToken: 'fixture-token-open',
  });

  let recipes: Recipe[] = [...DEMO_RECIPES];
  let catalog: CatalogItem[] = [...CATALOG];
  let plans: ProductionPlan[] = [PLAN];
  const notes: Record<string, string> = {
    brioche: 'לישה ארוכה מדי — הבצק מתחמם. לעצור בשלב הצלקת.',
  };
  let calib: readonly Calibration[] = [];
  let images: RecipeImage[] = [];
  const objectUrls = new Map<string, string>();
  let identity = { displayName: 'אחמד נסאסרה', avatarPath: null as string | null };
  let avatarUrl: string | null = null;

  /*
    §9 — two stored versions on one recipe, so the history, the comparison and
    the restore are all reachable by clicking. The snapshots are the live
    recipe with one number changed, which is what a real snapshot is: the
    whole recipe as it was.
  */
  const versionsOf = (recipeId: string): StoredVersion[] => {
    const live = recipes.find((r) => r.id === recipeId);
    /*
      Two recipes, on purpose. `brioche` is `locked: true` in the demo data, so
      its history shows the versions with the restore DISABLED — which is §9's
      rule about an approved formula, and worth seeing. `ganache` is unlocked,
      so the restore actually runs there.
    */
    if (!live || (recipeId !== 'brioche' && recipeId !== 'ganache')) return [];
    const older = {
      ...live,
      ingredients: (live.ingredients ?? []).map((ing, i) =>
        i === 0 ? { ...ing, qty: Math.round(((ing.qty ?? 0) as number) * 0.9) } : ing,
      ),
    };
    return [
      {
        id: `fixture-version-2-${recipeId}`,
        recipeId,
        tag: 'V2',
        what: 'העלאת אחוז החמאה, וקיצור הלישה',
        createdAt: '2026-09-12T07:00:00Z',
        snapshot: older as Recipe,
      },
      {
        id: `fixture-version-1-${recipeId}`,
        recipeId,
        tag: 'V1',
        what: 'הנוסחה כפי שנכתבה בשיעור',
        createdAt: '2026-09-05T07:00:00Z',
        snapshot: older as Recipe,
      },
    ];
  };
  /*
    `done: true`, so the onboarding gate lets the tabs render. The gate itself
    is real: with `done: false` every route redirects to /onboarding, which is
    the true first-run behaviour — and /onboarding is outside the gate, so the
    inspector can still open it.
  */
  let prefs: MeasurementPrefs | null = { ...defaultPrefs('pro'), done: true };

  const capabilities = (): RepositoryCapabilities => ({
    // See the header: this is what makes the screens render their connected
    // state. The inspector outside the app says no request leaves the page.
    source: 'supabase',
    online: true,
    canWrite: true,
    servingFromCache: false,
  });

  const summary = (p: ProductionPlan): PlanSummary => ({
    id: p.id,
    name: p.name,
    planDate: p.planDate,
    locked: p.locked,
    items: p.items.length,
  });

  return {
    ...demo,
    ...groups,
    capabilities,

    // Recipes: the demo five, writable in memory so the edit form can be used.
    listRecipes: async () => [...recipes],
    getRecipe: async (id: string) => recipes.find((r) => r.id === id) ?? null,
    saveRecipe: async (recipe: Recipe) => {
      const saved =
        !recipe.id || recipe.id.startsWith('new-')
          ? { ...recipe, id: `fixture-recipe-${recipes.length + 1}` }
          : recipe;
      recipes = [...recipes.filter((r) => r.id !== saved.id), saved];
      return saved;
    },
    deleteRecipe: async (id: string) => {
      recipes = recipes.filter((r) => r.id !== id);
    },

    // Preferences, so the settings and tools screens can be operated.
    getPrefs: async () => prefs,
    savePrefs: async (next: MeasurementPrefs) => {
      prefs = next;
      return next;
    },
    listCalibrations: async () => [...calib],
    saveCalibrations: async (list: readonly Calibration[]) => {
      calib = [...list];
      return [...calib];
    },

    // The ingredient centre.
    listCatalog: async () => [...catalog],
    saveCatalogItem: async (item: CatalogItem) => {
      const saved = derive(item);
      catalog = [...catalog.filter((c) => c.key !== saved.key), saved];
      return saved;
    },
    deleteCatalogItem: async (key: string) => {
      catalog = catalog.filter((c) => c.key !== key);
    },
    recordPurchase: async (input) => {
      const existing = catalog.find((c) => c.key === input.key);
      const saved = derive({
        ...(existing ?? material(input.name, input.purchaseUnit, 1, 1, 0)),
        key: input.key,
        name: input.name,
        purchaseUnit: input.purchaseUnit,
        packageQty: input.packageQty,
        packageCount: input.packageCount,
        purchaseTotal: input.purchaseTotal,
        usablePct: input.usablePct,
        supplier: input.supplier,
        purchasedAt: input.purchasedAt,
        note: input.note,
      });
      catalog = [...catalog.filter((c) => c.key !== saved.key), saved];
      return saved;
    },
    purchaseHistory: async (): Promise<PurchaseRecord[]> => [],

    // Production plans.
    listPlans: async () => plans.map(summary),
    getPlan: async (id: string) => plans.find((p) => p.id === id) ?? null,
    savePlan: async (plan: ProductionPlan) => {
      const saved =
        plan.id === '' ? { ...plan, id: `fixture-plan-${plans.length + 1}` } : plan;
      plans = [...plans.filter((p) => p.id !== saved.id), saved];
      return saved;
    },
    deletePlan: async (id: string) => {
      plans = plans.filter((p) => p.id !== id);
    },
    setPlanLocked: async (id: string, locked: boolean, snapshot: unknown) => {
      plans = plans.map((p) =>
        p.id === id
          ? { ...p, locked, lockedAt: locked ? new Date().toISOString() : null, snapshot }
          : p,
      );
    },

    /*
      §9 versions. The demo repository answers "there is no history at all",
      which is true of it and would leave the panel empty here; these two make
      the history, the comparison and the restore clickable.
    */
    listVersions: async (recipeId: string) => versionsOf(recipeId),
    restoreVersion: async (versionId: string) => {
      const all = recipes.flatMap((r) => versionsOf(r.id));
      const v = all.find((x) => x.id === versionId);
      if (!v) throw new WriteNotAllowedError('הגרסה אינה קיימת בסימולציה.');
      const restored = { ...v.snapshot, id: v.recipeId } as Recipe;
      recipes = recipes.map((r) => (r.id === v.recipeId ? restored : r));
      return restored;
    },

    /*
      The delete guard. `ingredients.sub_recipe_id` is NO ACTION in migration
      0008, so deleting a recipe another recipe uses as a base is refused BY
      THE DATABASE — and the demo set really does have such a link (the
      chocolate brioche uses the ganache). Mirrored here so the refusal is
      demonstrable instead of the fixture quietly deleting what the server
      would not.
    */
    deleteRecipe: async (id: string) => {
      const usedBy = recipes
        .filter((r) => r.id !== id && (r.ingredients ?? []).some((i) => i.subId === id))
        .map((r) => ({ id: r.id, name: String(r.name ?? '') }));
      if (usedBy.length > 0) throw new RecipeInUseError(usedBy);
      recipes = recipes.filter((r) => r.id !== id);
    },
    recipesUsing: async (id: string) =>
      recipes
        .filter((r) => r.id !== id && (r.ingredients ?? []).some((i) => i.subId === id))
        .map((r) => ({ id: r.id, name: String(r.name ?? '') })),

    /*
      §5 photographs. The real path converts to WebP in the browser and uploads
      to a private bucket; the conversion is the product's own code and runs
      here unchanged — only the upload is replaced by an object URL, so a photo
      chosen on the device really appears on the recipe.
    */
    listRecipeImages: async (recipeId: string) =>
      images.filter((i) => i.recipeId === recipeId),
    addRecipeImage: async (recipeId: string, file: File | Blob) => {
      const converted = await convertToWebp(file);
      if (!converted.ok) throw new WriteNotAllowedError(convertErrorText(converted));
      const image: RecipeImage = {
        id: `fixture-image-${images.length + 1}`,
        recipeId,
        storagePath: `${recipeId}/fixture-${images.length + 1}.webp`,
        ord: images.filter((i) => i.recipeId === recipeId).length,
        width: converted.width,
        height: converted.height,
        bytes: converted.bytes,
        caption: '',
        createdAt: new Date().toISOString(),
      };
      objectUrls.set(image.storagePath, URL.createObjectURL(converted.blob));
      images = [...images, image];
      return image;
    },
    removeRecipeImage: async (image: RecipeImage) => {
      const url = objectUrls.get(image.storagePath);
      if (url) URL.revokeObjectURL(url);
      objectUrls.delete(image.storagePath);
      images = images.filter((i) => i.id !== image.id);
    },
    signedImageUrl: async (storagePath: string) => objectUrls.get(storagePath) ?? null,

    /*
      §10.1 identity. `createFakeGroups` keeps a name and a path; this keeps
      the PICTURE too, as an object URL, so uploading an avatar in הגדרות
      actually shows the avatar — in the settings card and beside the reader's
      own chat messages.
    */
    getIdentity: async () => ({ ...identity }),
    saveDisplayName: async (name: string) => {
      identity = { ...identity, displayName: name.trim() };
    },
    setAvatar: async (file: File | Blob) => {
      const converted = await convertToWebp(file, {}, { maxBytes: 512 * 1024, maxEdge: 512 });
      if (!converted.ok) throw new WriteNotAllowedError(convertErrorText(converted));
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
      avatarUrl = URL.createObjectURL(converted.blob);
      identity = { ...identity, avatarPath: `${VIEWER_USER_ID}/avatar.webp` };
      return identity.avatarPath as string;
    },
    removeAvatar: async () => {
      if (avatarUrl) URL.revokeObjectURL(avatarUrl);
      avatarUrl = null;
      identity = { ...identity, avatarPath: null };
    },
    avatarUrl: async (path: string | null) => (path ? avatarUrl : null),
    avatarUrls: async (paths: readonly string[]) => {
      const out: Record<string, string> = {};
      for (const p of paths) {
        if (identity.avatarPath && p === identity.avatarPath && avatarUrl) out[p] = avatarUrl;
      }
      return out;
    },

    // §8 personal notes.
    getPrivateNote: async (recipeId: string) => notes[recipeId] ?? null,
    savePrivateNote: async (recipeId: string, body: string) => {
      if (body.trim() === '') delete notes[recipeId];
      else notes[recipeId] = body;
    },
  };
}
