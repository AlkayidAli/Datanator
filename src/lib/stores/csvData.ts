// Global store for parsed CSV data.
// We keep this as a traditional Svelte store so any component (Svelte 4 or 5 style) can subscribe.
// In Svelte 5 you can still use $csvData for auto-subscription inside components.

import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface ParsedCSV {
  filename: string;
  headers: string[];
  rows: Record<string, string | null>[];
  rawText?: string;
  loadedAt: string;
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