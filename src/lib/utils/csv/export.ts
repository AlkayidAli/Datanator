import Papa from 'papaparse';
import type { ParsedCSV } from '$lib/stores/csvData';

export interface DownloadOptions {
  filename?: string;
  delimiter?: string; // default ','
  lineEndings?: 'auto' | '\n' | '\r\n'; // default '\r\n' (friendlier for Excel on Windows)
  includeBOM?: boolean; // default true (helps Excel with UTF-8)
}

/**
 * Build a filename like <base>-export.csv from the original file name.
 */
function makeFilename(original: string, suffix = '-export', ext = '.csv') {
  const dot = original.lastIndexOf('.');
  const base = dot > 0 ? original.slice(0, dot) : original;
  return `${base}${suffix}${ext}`;
}

/**
 * Export the current (possibly cleaned) data back to CSV and download it.
 * Uses the in-memory headers/rows, so it reflects any manipulations you did.
 */
export function downloadCSVFromParsed(parsed: ParsedCSV, opts: DownloadOptions = {}) {
  const filename = opts.filename ?? makeFilename(parsed.filename);
  const delimiter = opts.delimiter ?? ',';
  const newline = opts.lineEndings ?? '\r\n';
  const includeBOM = opts.includeBOM ?? true;

  // Convert rows to array-of-arrays in header order, mapping null -> '' for empty cells
  const data = parsed.rows.map((row) =>
    parsed.headers.map((h) => {
      const v = row[h];
      return v == null ? '' : String(v);
    })
  );

  const csv = Papa.unparse(
    { fields: parsed.headers, data },
    { delimiter, newline }
  );

  const content = includeBOM ? '\uFEFF' + csv : csv;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/**
 * Download the original uploaded text (exact bytes as parsed.rawText) if available.
 * If rawText is missing, falls back to regenerating from the current data.
 */
export function downloadOriginalCSV(parsed: ParsedCSV, opts: { filename?: string; includeBOM?: boolean } = {}) {
  const includeBOM = opts.includeBOM ?? true;
  const filename = opts.filename ?? parsed.filename;

  if (!parsed.rawText) {
    // Fall back to regenerated CSV
    return downloadCSVFromParsed(parsed, { filename, includeBOM });
  }

  const content = includeBOM ? '\uFEFF' + parsed.rawText : parsed.rawText;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}