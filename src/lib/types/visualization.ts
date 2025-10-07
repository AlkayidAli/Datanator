export type ChartMark = 'line' | 'bar' | 'scatter' | 'pie' | 'area' | 'histogram';

export interface ChartEncoding {
  x?: string | null;
  y?: string[];           // allow multi-series
  color?: string | null;  // column for color scale
  groupBy?: string | null;
}

export interface ChartSpec {
  mark: ChartMark;
  encoding: ChartEncoding;
  title?: string;
  legend?: boolean;
  // options still for future extensibility
  options?: Record<string, unknown>;
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