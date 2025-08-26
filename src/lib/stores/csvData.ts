import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type CellValue = string | number | boolean | Date | null;
export type ColumnType = 'string' | 'number' | 'boolean' | 'date' | 'null' | 'mixed';

export interface ParsedCSV {
  filename: string;
  headers: string[];
  rows: Record<string, CellValue>[];
  rawText?: string;
  loadedAt: string;
  // Inferred (or configured) type per column
  columnTypes?: Record<string, ColumnType>;
}

const LOCAL_KEY = 'csvDataStore_v1';

function loadInitial(): ParsedCSV | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ParsedCSV;
  } catch {
    return null;
  }
}

export const csvData = writable<ParsedCSV | null>(loadInitial());

if (browser) {
  csvData.subscribe((value) => {
    if (value) localStorage.setItem(LOCAL_KEY, JSON.stringify(value));
    else localStorage.removeItem(LOCAL_KEY);
  });
}

export function clearCSV() {
  csvData.set(null);
}