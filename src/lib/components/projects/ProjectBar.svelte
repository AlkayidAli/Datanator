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

	$: $currentProject; // subscribe to store
	onMount(fetchProjects);
</script>

<div class="project-bar">
	<div class="col">
		<label class="label" for="project-select">Project</label>
		<div class="selector-group">
			<select
				id="project-select"
				class="project-select"
				disabled={loading || projects.length === 0}
				on:change={(e) => selectProject((e.target as HTMLSelectElement).value)}
				aria-label="Select project"
			>
				{#if !projects.length}<option>(no projects)</option>{/if}
				{#each projects as p}
					<option value={p.project_id} selected={$currentProject?.project_id === p.project_id}>
						{p.name}
					</option>
				{/each}
			</select>
			<button class="btn primary grouped" on:click={createProject} title="Create a new project">
				<span class="material-symbols-outlined">add</span>
				<span>New</span>
			</button>
		</div>
		{#if $currentProject}
			<small class="muted">Selected: {$currentProject.name}</small>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '../../../styles/global.scss' as global;

	.project-bar {
		display: flex;
		gap: 12px;
		align-items: center;
		margin-bottom: 12px;
	}

	.col {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label {
		font-weight: 600;
	}

	/* Match CsvHome.svelte */
	.selector-group {
		display: inline-flex;
		align-items: stretch;
		border: 1px solid global.$text-grey-10;
		border-radius: 10px;
		overflow: hidden;
		background: #fff;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
	}
	.project-select {
		padding: 0 12px;
		min-width: 280px;
		height: 40px;
		border: none;
		background: #fff;
		color: #222;
	}
	.project-select:focus-visible {
		outline: 3px solid global.$background-primary-color;
		outline-offset: 2px;
	}

	.btn {
		min-height: 40px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		border-radius: 10px;
		padding: 8px 12px;
		border: 1px solid global.$text-grey-10;
		background: #fff;
		color: #222;
		cursor: pointer;
	}
	.btn.primary {
		background: global.$background-primary-color;
		color: global.$text-white;
		border-color: global.$text-grey-10;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
	}
	.btn.primary:hover {
		background: global.$background-secondary-color;
		border-color: global.$background-primary-color;
		color: global.$text-grey-90;
		box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
	}

	.btn.primary.grouped {
		border-radius: 0 10px 10px 0;
		border: none;
		padding: 0 12px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-left: 1px solid global.$text-grey-10;
	}

	.muted {
		color: #666;
	}

	.material-symbols-outlined {
		font-variation-settings:
			'FILL' 0,
			'wght' 500,
			'GRAD' 0,
			'opsz' 24;
		font-size: 20px;
		line-height: 1;
	}
</style>
