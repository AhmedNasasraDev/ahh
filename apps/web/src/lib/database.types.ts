// The database's shape, as TypeScript.
//
// Hand-written on purpose, and kept that way after the project was provisioned.
// `supabase gen types` widens every CHECK constraint to `string` and every jsonb
// column to `Json`, which throws away exactly the distinctions this app runs on:
// ToolId, PriceUnit, temp_unit 'C' | 'F', and the four density resolution
// states. Those unions are load-bearing, so the narrow version stays.
//
// The safety net for a hand-written file is mechanical, not vigilance:
//   npm run schema:check
// compares the column names and nullability here against
// supabase/schema.snapshot.json, which is read back out of the live database.

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

export type ProfileKind = 'home' | 'pro' | 'study';
export type Locale = 'he' | 'ar';
export type ToolId = 'cup' | 'tbsp' | 'tsp';
/** Re-exported from the engine so a row type and a domain type cannot drift. */
export type { StepKind } from '@recipe-notebook/engine';
import type { StepKind } from '@recipe-notebook/engine';

export type PriceUnit = 'ק"ג' | 'ליטר' | "יח'";
export type DensityConfidence = 'system' | 'estimate';
export type DensityResolution =
  | 'accepted'
  | 'accepted-single-source'
  | 'pending-verification'
  | 'pending-form';

/**
 * One table's three shapes.
 *
 * A TYPE alias, not an interface, and the same goes for every row type below.
 * postgrest-js constrains a table's Row/Insert/Update to
 * `Record<string, unknown>`; TypeScript gives an object type literal an
 * implicit index signature but gives an interface none. Declared as interfaces,
 * `Database['public']` quietly fails postgrest's `GenericSchema` check, the
 * client's `Schema` parameter resolves to `never`, and every insert and update
 * argument in the repository is rejected as `never` with no hint as to why.
 */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ProfileRow = {
  user_id: string;
  profile: ProfileKind;
  pro: boolean;
  units: string[];
  tools: Partial<Record<ToolId, number>>;
  touched_units: boolean;
  locale: Locale;
  onboarding_done: boolean;
  created_at: string;
  updated_at: string;
};

export type CalibrationRow = {
  id: string;
  user_id: string;
  ingredient_name: string;
  ingredient_key: string;
  tool: ToolId;
  /** engine B5: the tool volume frozen at calibration time */
  tool_ml: number;
  grams: number;
  tool_ml_assumed: boolean;
  created_at: string;
};

export type RecipeRow = {
  id: string;
  owner_id: string;
  group_id: string | null;
  name: string;
  category: string;
  tags: string[];
  is_sub: boolean;
  locked: boolean;
  yield_units: number;
  unit_weight: number;
  /** null = theoretical yield, which is not zero (§18.11) */
  yield_actual: number | null;
  weight_before: number | null;
  weight_after: number | null;
  dough_mode: boolean;
  ddt: number | null;
  flour_temp: number | null;
  room_temp: number | null;
  friction: number | null;
  target_fc: number;
  /** stage 7: what the user charges. null = not set; 0 = given away */
  sale_price: number | null;
  /**
   * stage 8: is `sale_price` the price of the whole batch or of one unit?
   * Stored rather than guessed — guessing is the difference between a 5% and a
   * 500% food cost.
   */
  sale_price_basis: 'batch' | 'unit';
  /**
   * stage 8, requirement E: the cost breakdown, ENTERED and never invented.
   * null = not entered; 0 = there is none, and the screen says which.
   */
  packaging_cost: number | null;
  labor_cost: number | null;
  other_cost: number | null;
  /** stage 8, requirement G: a target gross margin, in percent. < 100 */
  target_gm: number | null;
  shelf_life: string;
  storage: string;
  freezing: string;
  thawing: string;
  equipment: string;
  notes: string;
  manual_allergens: string[];
  pan: Json | null;
  version_of: string | null;
  version_note: string;
  saved_from_item_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IngredientRow = {
  id: string;
  recipe_id: string;
  ord: number;
  name: string;
  ingredient_key: string | null;
  qty: number;
  unit: string;
  flour: boolean;
  liquid: boolean;
  /** null = use the shared water table; not 0 */
  water_pct: number | null;
  unit_weight: number | null;
  /** §5.1 precedence rank 2 */
  g_per_100: number | null;
  price: number | null;
  price_unit: PriceUnit | null;
  sub_recipe_id: string | null;
  note: string;
};

export type StepRow = {
  id: string;
  recipe_id: string;
  ord: number;
  text: string;
  temp: number | null;
  temp_unit: 'C' | 'F';
  minutes: number | null;
  /** stage 9: null = nobody classified this step. See migration 0018 */
  kind: StepKind | null;
};

export type IssueRow = {
  id: string;
  recipe_id: string;
  ord: number;
  problem: string;
  solution: string;
};

export type TrialRow = {
  id: string;
  recipe_id: string;
  date: string | null;
  note: string;
};

export type BatchRow = {
  id: string;
  recipe_id: string;
  code: string;
  date: string | null;
  core_temp: number | null;
  /** §13a: null is not an excursion — an empty field is not a measurement */
  chill_temp: number | null;
  weight: number | null;
  owner: string;
  note: string;
  ccp: Record<string, boolean>;
  /** §13a REQUIRES BACKEND: private bucket path */
  photo_path: string | null;
  /** §13a: set by the server. A user-editable timestamp is worthless in an audit. */
  taken_at: string | null;
  created_at: string;
};

export type RecipeVersionRow = {
  id: string;
  recipe_id: string;
  tag: string;
  what: string;
  snapshot: Json;
  created_at: string;
  created_by: string | null;
};

export type PrivateNoteRow = {
  id: string;
  user_id: string;
  recipe_id: string | null;
  group_item_id: string | null;
  body: string;
  updated_at: string;
};

/** What a material is bought in. Not everything is bought by the kilogram. */
export type PurchaseUnit = 'kg' | 'g' | 'l' | 'ml' | 'unit';

export type IngredientCatalogRow = {
  id: string;
  owner_id: string | null;
  group_id: string | null;
  key: string;
  name: string;
  /** what was actually bought — the source of truth for the price (0011) */
  purchase_unit: PurchaseUnit;
  /** how much is in ONE package, in `purchase_unit`. null = unknown */
  package_qty: number | null;
  /** how many packages were bought. 6 packs of 500 g is `6` (0013) */
  package_count: number;
  /** what the whole purchase cost. null = unpriced; 0 = free, and they differ */
  purchase_total: number | null;
  /**
   * usable share after cleaning/trimming, in percent. null = nobody declared a
   * yield, and then the usable cost IS the purchase cost — it is NOT 0% (0013).
   */
  usable_pct: number | null;
  supplier: string;
  /** the date of the purchase, as the user entered it (0013) */
  purchased_at: string | null;
  /** stamped only when the package actually changes — see 0011 */
  price_updated_at: string | null;
  note: string;
  /**
   * GENERATED STORED in the database, from the purchase above. Read-only: an
   * insert or update that includes any of these is rejected by Postgres,
   * which is the point — they cannot drift from the purchase they came from.
   *
   * `purchase_price` is the cost per base unit AS BOUGHT; `price` is the cost
   * per USABLE base unit, and it is the one the engine reads. With no declared
   * yield the two are the same number.
   */
  purchase_price: number | null;
  price: number | null;
  price_unit: PriceUnit | null;
  g_per_100: number | null;
  water_pct: number | null;
  allergens: string[];
  created_at: string;
  updated_at: string;
};

/**
 * The columns a client may actually write. `purchase_price`, `price` and
 * `price_unit` are generated, so they are absent here on purpose — the type is
 * what stops a caller trying.
 */
export type IngredientCatalogWrite = Omit<
  IngredientCatalogRow,
  | 'id'
  | 'purchase_price'
  | 'price'
  | 'price_unit'
  | 'created_at'
  | 'updated_at'
  | 'price_updated_at'
>;

/**
 * One recorded purchase (migration 0013, requirement C). Append-only: a new
 * price never overwrites the previous one, it is a new row here, and the
 * ACTIVE price is unambiguously the `ingredient_catalog` row.
 *
 * Keyed by `key`, not by catalog id, so a purchase survives the material
 * being renamed or re-created.
 */
export type IngredientPurchaseRow = {
  id: string;
  owner_id: string;
  key: string;
  purchase_unit: PurchaseUnit;
  package_count: number;
  package_qty: number | null;
  purchase_total: number | null;
  usable_pct: number | null;
  supplier: string;
  purchased_at: string;
  note: string;
  created_at: string;
  /** GENERATED STORED, exactly as in the catalog */
  purchase_price: number | null;
  price: number | null;
};

export type DensityTableRow = {
  key: string;
  match_terms: string[];
  exclude_terms: string[];
  word_match: boolean;
  /** null when no value may be used yet — see CONFLICTS.md */
  g_per_100: number | null;
  confidence: DensityConfidence;
  resolution: DensityResolution;
  note: string;
  sources: Record<string, number>;
  needs_review: boolean;
  review_note: string;
  forms: string[];
  ord: number;
  updated_at: string;
};

/**
 * A production plan (migration 0018). It holds INTENT only — the requirement,
 * the purchase list and the cost are derived from the recipes and the
 * ingredient centre every time the plan is opened.
 */
export type ProductionPlanRow = {
  id: string;
  owner_id: string;
  name: string;
  plan_date: string;
  note: string;
  /**
   * Requirement 14. A locked plan is a record of what happened, and its
   * snapshot is what is read; an unlocked plan has no snapshot and is
   * computed live. The two always move together.
   */
  locked: boolean;
  locked_at: string | null;
  snapshot: Json | null;
  created_at: string;
  updated_at: string;
};

export type PlanQtyUnit = 'unit' | 'kg' | 'g';

export type ProductionPlanItemRow = {
  id: string;
  plan_id: string;
  recipe_id: string;
  ord: number;
  qty: number;
  qty_unit: PlanQtyUnit;
  /** the hour the product must be READY. null = the user did not say */
  ready_at: string | null;
  note: string;
};

export type ProductionPlanStockRow = {
  id: string;
  plan_id: string;
  key: string;
  /** null = not entered. 0 = there is none left. NOT the same thing */
  on_hand: number | null;
};

export type Database = {
  /**
   * supabase-js reads this to pick its PostgREST behaviour. It is part of the
   * generated shape, so it is part of this one.
   */
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      calibrations: Table<CalibrationRow>;
      recipes: Table<RecipeRow>;
      ingredients: Table<IngredientRow>;
      steps: Table<StepRow>;
      issues: Table<IssueRow>;
      trials: Table<TrialRow>;
      batches: Table<BatchRow>;
      recipe_versions: Table<RecipeVersionRow>;
      private_notes: Table<PrivateNoteRow>;
      ingredient_catalog: Table<IngredientCatalogRow>;
      ingredient_purchases: Table<IngredientPurchaseRow>;
      production_plans: Table<ProductionPlanRow>;
      production_plan_items: Table<ProductionPlanItemRow>;
      production_plan_stock: Table<ProductionPlanStockRow>;
      density_table: Table<DensityTableRow>;
      density_data_gaps: Table<{ name: string }>;
    };
    // Empty MAPPED types, not `Record<string, never>`. Record<string, never>
    // says every possible name is a view whose row type is `never`, so
    // `from('recipes')` resolves against Views instead of Tables and every
    // insert argument collapses to `never`.
    Views: { [_ in never]: never };
    Functions: {
      owns_recipe: { Args: { p_recipe_id: string }; Returns: boolean };
      // migration 0007 — the atomic write paths (§9, stage-5 requirement 9)
      save_recipe: {
        Args: {
          p_recipe: Json;
          p_ingredients: Json;
          p_steps: Json;
          p_issues: Json;
          p_recipe_id: string | null;
          p_expected_updated_at: string | null;
          p_version_note: string;
        };
        Returns: string;
      };
      restore_recipe_version: { Args: { p_version_id: string }; Returns: string };
      recipes_using: {
        Args: { p_recipe_id: string };
        Returns: Array<{ id: string; name: string }>;
      };
      recipe_snapshot: { Args: { p_recipe_id: string }; Returns: Json };
      next_version_tag: { Args: { p_recipe_id: string }; Returns: string };
      // migration 0009 — stage-6 requirements 1-6. Returns void; the refusal is
      // an error with code 23503, not a value.
      delete_recipe: { Args: { p_recipe_id: string }; Returns: undefined };
      // migration 0011 — which of the caller's recipes a price change moves
      recipes_pricing_on: {
        Args: { p_key: string };
        Returns: Array<{ id: string; name: string; rows: number; overridden: number }>;
      };
      // migration 0013 — the purchase as it was actually made (requirements A, C)
      record_purchase: {
        Args: {
          p_key: string;
          p_name: string;
          p_purchase_unit: PurchaseUnit;
          p_package_count: number;
          p_package_qty: number | null;
          p_purchase_total: number | null;
          p_usable_pct: number | null;
          p_supplier: string;
          p_purchased_at: string | null;
          p_note: string;
        };
        Returns: string;
      };
      purchase_history: {
        Args: { p_key: string };
        Returns: Array<{
          id: string;
          purchased_at: string;
          supplier: string;
          purchase_unit: PurchaseUnit;
          package_count: number;
          package_qty: number | null;
          purchase_total: number | null;
          usable_pct: number | null;
          purchase_price: number | null;
          price: number | null;
          /** the USABLE price of the purchase before this one. null = the first */
          prev_price: number | null;
          /** null when there is no previous price, or it was 0 (no ratio) */
          pct_change: number | null;
        }>;
      };
      purchase_base_qty: {
        Args: { p_unit: PurchaseUnit; p_count: number; p_qty: number | null };
        Returns: number | null;
      };
      // migration 0014 — an internal helper of save_recipe/restore_recipe_version
      apply_recipe_costing: { Args: { p_id: string; p_recipe: Json }; Returns: undefined };
      // migration 0018 — production planning (stage-9 requirements 1, 13, 14)
      owns_plan: { Args: { p_plan_id: string }; Returns: boolean };
      save_production_plan: {
        Args: {
          p_plan: Json;
          p_items: Json;
          p_stock: Json;
          p_plan_id: string | null;
          p_expected_updated_at: string | null;
        };
        Returns: string;
      };
      set_plan_locked: {
        Args: { p_plan_id: string; p_locked: boolean; p_snapshot: Json | null };
        Returns: undefined;
      };
      delete_production_plan: { Args: { p_plan_id: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
