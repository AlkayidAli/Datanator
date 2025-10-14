export type ChartMark =
  | 'line'
  | 'bar'
  | 'scatter'
  | 'pie'
  | 'area'
  | 'histogram'
  | 'boxplot'
  | 'arc'
  | 'alluvial';

export interface ChartEncoding {
  x?: string | null;
  y?: string[];           // multi-series
  color?: string | null;
  groupBy?: string | null;
  size?: string | null;   // future
  shape?: string | null;  // future
  tooltip?: string[];     // list of columns to show in tooltip
  // Flow/graph encodings (for arc/alluvial)
  source?: string | null;
  target?: string | null;
  value?: string | null;  // weight
}

export interface ChartLayer {
  id: string;
  mark: ChartMark;
  encoding: ChartEncoding;
  options?: Record<string, unknown>;
  // Optional per-layer conditional styling (overrides global)
  conditionalStyles?: ConditionalStyleRule[];
  visible?: boolean;
}

export interface ConditionalStyleRule {
  id: string;
  expression: string;     // evaluated per row -> truthy => apply
  color?: string;
  stroke?: string;
  size?: number;
  label?: string;         // optional dynamic label (future)
}

export interface ChartTransforms {
  logX?: boolean;
  logY?: boolean;
  binX?: { bins: number };
  binY?: { bins: number };
  // smoothing / rolling etc. placeholders
  rollingMean?: { window: number; on: 'y' };
}

export interface CustomTooltipConfig {
  // Array of template lines, e.g. "Sales: {Sales}" supports {column}
  lines?: string[];
  // Raw HTML disabled by default for safety (future)
  allowHTML?: boolean;
}

export interface ChartSpec {
  mark: ChartMark;
  encoding: ChartEncoding;
  title?: string;
  legend?: boolean;
  layers?: ChartLayer[];                // advanced mode
  conditionalStyles?: ConditionalStyleRule[]; // global
  transforms?: ChartTransforms;
  tooltips?: CustomTooltipConfig;
  options?: Record<string, unknown>;    // existing options bag
  // UI helpers (not used by renderer directly)
  computedFields?: { name: string; expression: string }[];
}

export interface VisualizationRecord {
  viz_id: string;
  project_id: string;
  file_id: string | null;
  name: string;
  description?: string | null;
  spec: ChartSpec;
  thumbnail_mime?: string | null;
  is_template: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}