import { writable, get } from 'svelte/store';
import type { ParsedCSV } from '$lib/stores/csvData';
import { activeFileId } from './project';

export const filesState = writable<Record<string, ParsedCSV>>({});
export const undoStacks = writable<Record<string, { do: any; undo: any }[]>>({});
export const redoStacks = writable<Record<string, { do: any; undo: any }[]>>({});

export function setFileState(fileId: string, state: ParsedCSV) {
  filesState.update((m) => ({ ...m, [fileId]: state }));
  if (!get(activeFileId)) activeFileId.set(fileId);
}