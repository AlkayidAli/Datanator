import Papa from 'papaparse';
import type { ParsedCSV } from '$lib/stores/csvData';

/**
 * Parse a CSV File using PapaParse.
 * @param file The File object from input
 * @param useHeader Whether to treat first row as headers
 */
export function parseCSVFile(file: File, useHeader = true): Promise<ParsedCSV> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = () => {
      const rawText = reader.result as string;

      Papa.parse(rawText, {
        header: useHeader,
        skipEmptyLines: 'greedy',
        dynamicTyping: false,
        quoteChar: '"',
        delimiter: '',
        transformHeader: (h) => h.trim(),
        complete: (results) => {
          if (results.errors && results.errors.length > 0) {
            console.warn('PapaParse errors:', results.errors);
          }

          let rows: Record<string, string | null>[] = [];
          let headers: string[] = [];

            // header=true path
          if (Array.isArray(results.meta?.fields) && results.meta.fields.length > 0) {
            headers = results.meta.fields;
            rows = (results.data as any[]).map((rowObj) => {
              const normalized: Record<string, string | null> = {};
              headers.forEach((h) => {
                const val = rowObj[h];
                normalized[h] = val === undefined || val === '' ? null : String(val);
              });
              return normalized;
            });
          } else {
            // header=false path (we didn't set useHeader=false here but left for completeness)
            const rawRows = results.data as any[][];
            const widest = rawRows.reduce((m, r) => Math.max(m, r.length), 0);
            headers = Array.from({ length: widest }, (_, i) => `col_${i}`);
            rows = rawRows.map((arr) => {
              const obj: Record<string, string | null> = {};
              headers.forEach((h, i) => {
                const val = arr[i];
                obj[h] = val === undefined || val === '' ? null : String(val);
              });
              return obj;
            });
          }

          resolve({
            filename: file.name,
            headers,
            rows,
            rawText,
            loadedAt: new Date().toISOString()
          });
        },
        error: (err: any) => reject(err)
      });
    };
    reader.readAsText(file);
  });
}