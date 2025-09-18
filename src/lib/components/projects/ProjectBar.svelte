<script lang="ts">
	import { onMount } from 'svelte';
	import { currentProject, projectFiles, activeFileId, type Project } from '$lib/stores/project';
	import { filesState, setFileState } from '$lib/stores/csvMulti';

	let projects: Project[] = [];
	let loading = false;

	async function fetchProjects() {
		loading = true;
		try {
			const res = await fetch('/api/projects');
			if (!res.ok) throw new Error('Failed to load projects');
			const data = await res.json();
			projects = data.projects ?? [];
			// pick first if none selected
			if (projects.length && !$currentProject) {
				selectProject(projects[0].project_id);
			}
		} finally {
			loading = false;
		}
	}

	async function selectProject(projectId: string) {
		const proj = projects.find((p) => p.project_id === projectId) || null;
		currentProject.set(proj);
		activeFileId.set(null);
		projectFiles.set([]);
		filesState.set({});

		if (!proj) return;
		const res = await fetch(`/api/projects/${proj.project_id}/files`);
		if (!res.ok) return;
		const data = await res.json();
		projectFiles.set(data.files ?? []);
		// auto-load first file if present
		if (data.files?.length) {
			await loadFileState(data.files[0].file_id);
		}
	}

	async function loadFileState(fileId: string) {
		// GET last snapshot (ignore ops for now)
		const res = await fetch(`/api/files/${fileId}/state`);
		if (!res.ok) return;
		const data = await res.json();
		if (data.snapshot) {
			setFileState(fileId, { ...data.snapshot, loadedAt: new Date().toISOString() });
			activeFileId.set(fileId);
		}
	}

	async function createProject() {
		const name = prompt('New project name?')?.trim();
		if (!name) return;
		const res = await fetch('/api/projects', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name })
		});
		if (!res.ok) {
			alert('Failed to create project');
			return;
		}
		const created = await res.json(); // { project_id, name, ... }
		// add to local list and select it
		projects = [created, ...projects];
		await selectProject(created.project_id);
	}

	$: $currentProject; // subscribe
	onMount(fetchProjects);
</script>

<div class="project-bar">
	<label for="project-select">Project:</label>
	<select
		id="project-select"
		disabled={loading || projects.length === 0}
		on:change={(e) => selectProject((e.target as HTMLSelectElement).value)}
	>
		{#if !projects.length}<option>(no projects)</option>{/if}
		{#each projects as p}
			<option value={p.project_id} selected={$currentProject?.project_id === p.project_id}>
				{p.name}
			</option>
		{/each}
	</select>
	<button on:click={createProject}>New project</button>
</div>

<style>
	.project-bar {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 8px;
	}
	select {
		padding: 6px 8px;
	}
</style>
