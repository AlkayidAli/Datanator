import { writable } from 'svelte/store';

export interface Project {
  project_id: string;
  name: string;
}
export interface ProjectFileMeta {
  file_id: string;
  name: string;
  original_filename?: string | null;
}

export const currentProject = writable<Project | null>(null);
export const projectFiles = writable<ProjectFileMeta[]>([]);
export const activeFileId = writable<string | null>(null);