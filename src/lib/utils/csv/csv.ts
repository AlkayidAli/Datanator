import Papa from 'papaparse';
import type { ParsedCSV, CellValue, ColumnType } from '$lib/stores/csvData';

// Helpers to classify and infer types from runtime values
function classify(val: unknown): ColumnType {
  if (val === null || val === undefined) return 'null';
  if (val instanceof Date) return 'date';
  const t = typeof val;
  if (t === 'number' || t === 'boolean' || t === 'string') return t;
  return 'mixed'; // fallback for unrecognized types
}

function inferColumnTypes(
  headers: string[],
  rows: Record<string, any>[]
): Record<string, ColumnType> {
  const out: Record<string, ColumnType> = {};
  for (const h of headers) {
    const seen = new Set<ColumnType>();
    for (const r of rows) {
      const t = classify(r[h]);
      if (t !== 'null') seen.add(t);
      if (seen.size > 1) break; // mixed
    }
    out[h] = seen.size === 0 ? 'null' : (seen.size === 1 ? [...seen][0] : 'mixed');
  }
  return out;
}

// Allow both legacy boolean and a new options object
export interface ParseOptions {
  useHeader?: boolean;
  typing?: 'none' | 'papa' | 'custom';
  // Used when typing === 'custom'. Keyed by header name when useHeader=true.
  columnParsers?: Record<string, (raw: string) => CellValue>;
}

// Overloads
export function parseCSVFile(file: File, options?: boolean): Promise<ParsedCSV>;
export function parseCSVFile(file: File, options?: ParseOptions): Promise<ParsedCSV>;

// Implementation
export function parseCSVFile(
  file: File,
  options: boolean | ParseOptions = true
): Promise<ParsedCSV> {
  const normalized: ParseOptions =
    typeof options === 'boolean' ? { useHeader: options } : options || {};

  const useHeader = normalized.useHeader ?? true;
  const typing = normalized.typing ?? 'none';
  const columnParsers = normalized.columnParsers ?? {};

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = () => {
      const rawText = reader.result as string;

      Papa.parse(rawText, {
        header: useHeader,
        skipEmptyLines: 'greedy',
        // Papa's built-in typing (numbers/booleans) only if requested
        dynamicTyping: typing === 'papa',
        quoteChar: '"',
        delimiter: '', // auto-detect
        transformHeader: (h) => h.trim(),
        // For custom typing, cast per column right here
        transform:
          typing === 'custom'
            ? (value: string, field?: string | number) => {
                if (useHeader && typeof field === 'string') {
                  const parser = columnParsers[field];
                  if (parser) {
                    // Preserve empty semantics; we'll convert '' -> null later
                    if (value === '') return '';
                    try {
                      return parser(value);
                    } catch {
                      return value;
                    }
                  }
                }
                return value;
              }
            : undefined,
        complete: (results) => {
          if (results.errors && results.errors.length > 0) {
            console.warn('PapaParse errors:', results.errors);
          }

          let rows: Record<string, CellValue>[] = [];
          let headers: string[] = [];

          if (Array.isArray(results.meta?.fields) && results.meta.fields.length > 0) {
            headers = results.meta.fields;
            rows = (results.data as any[]).map((rowObj) => {
              const normalizedRow: Record<string, CellValue> = {};
              headers.forEach((h) => {
                const val = rowObj[h];
                // Normalize missing/empty -> null
                if (val === undefined || val === '') {
                  normalizedRow[h] = null;
                } else {
                  // IMPORTANT: keep the runtime type (number/boolean/Date/string)
                  normalizedRow[h] = val as CellValue;
                }
              });
              return normalizedRow;
            });
          } else {
            // header=false path
            const rawRows = results.data as any[][];
            const widest = rawRows.reduce((m, r) => Math.max(m, r.length), 0);
            headers = Array.from({ length: widest }, (_, i) => `col_${i}`);
            rows = rawRows.map((arr) => {
              const obj: Record<string, CellValue> = {};
              headers.forEach((h, i) => {
                const val = arr[i];
                obj[h] = val === undefined || val === '' ? null : (val as CellValue);
              });
              return obj;
            });
          }

          const columnTypes = inferColumnTypes(headers, rows as Record<string, any>[]);

          resolve({
            filename: file.name,
            headers,
            rows,
            rawText,
            loadedAt: new Date().toISOString(),
            columnTypes
          });
        },
        error: (err: any) => reject(err)
      });
    };
    reader.readAsText(file);
  });
}