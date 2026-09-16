// Hand-written to match supabase/migrations/*.sql.
//
// Once a project exists this file is replaced by the generated one:
//   supabase gen types typescript --project-id <id> > src/lib/database.types.ts
// It is written by hand now so the client is typed before a project exists, and
// so a mismatch between the migrations and the app shows up as a type error.

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

interface Table<Row, Insert = Partial<Row>, Update = Partial<Row>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface ProfileRow {
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
}

export interface CalibrationRow {
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
}

export interface RecipeRow {
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
}

export interface IngredientRow {
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
}

export interface StepRow {
  id: string;
  recipe_id: string;
  ord: number;
  text: string;
  temp: number | null;
  temp_unit: 'C' | 'F';
  minutes: number | null;
}

export interface IssueRow {
  id: string;
  recipe_id: string;
  ord: number;
  problem: string;
  solution: string;
}

export interface TrialRow {
  id: string;
  recipe_id: string;
  date: string | null;
  note: string;
}

export interface BatchRow {
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
}

export interface RecipeVersionRow {
  id: string;
  recipe_id: string;
  tag: string;
  what: string;
  snapshot: Json;
  created_at: string;
  created_by: string | null;
}

export interface PrivateNoteRow {
  id: string;
  user_id: string;
  recipe_id: string | null;
  group_item_id: string | null;
  body: string;
  updated_at: string;
}

export interface IngredientCatalogRow {
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
}

export interface DensityTableRow {
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
}

export interface Database {
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
    Views: Record<string, never>;
    Functions: {
      owns_recipe: { Args: { p_recipe_id: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
