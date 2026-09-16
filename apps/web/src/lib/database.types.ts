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

export type IngredientCatalogRow = {
  id: string;
  owner_id: string | null;
  group_id: string | null;
  key: string;
  name: string;
  price: number | null;
  price_unit: PriceUnit | null;
  g_per_100: number | null;
  water_pct: number | null;
  allergens: string[];
  created_at: string;
  updated_at: string;
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
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
