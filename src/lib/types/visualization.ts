export type ChartMark = 'line' | 'bar' | 'scatter' | 'pie' | 'area' | 'histogram';

export interface ChartEncoding {
  x?: string | null;
  y?: string[];           // allow multi-series
  color?: string | null;  // column for color scale
  groupBy?: string | null;
}

export interface ChartSize {
  width?: number;
  height?: number;
}

export interface ChartSpec {
  mark: ChartMark;
  encoding: ChartEncoding;
  title?: string;
  legend?: boolean;
  size?: ChartSize;
  // room for future D3 options (scales, axes, bins…)
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