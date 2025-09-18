<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { parseCSVFile } from '$lib/utils/csv/csv';
	import { csvData } from '$lib/stores/csvData';
	import UploadIcon from '$lib/common/upload_icon.svg';

	import { currentProject, projectFiles, activeFileId, type Project } from '$lib/stores/project';
	import { filesState, setFileState } from '$lib/stores/csvMulti';

	// track the selected project id for the <select>
	let selectedProjectId = $state<string | null>(null);

	// Drag & drop overlay state
	let showDrop = $state(false);
	let isDragging = $state(false);

	// Hidden input ref (programmatic open)
	let fileInputRef = $state<HTMLInputElement | null>(null);

	// Project selector state
	let projects = $state<Project[]>([]);
	let loadingProjects = $state(false);
	let creating = $state(false);
	let newProjectName = $state('');

	let errorMsg: string | null = $state(null);

	async function fetchProjects() {
		loadingProjects = true;
		errorMsg = null;
		try {
			const res = await fetch('/api/projects', {
				method: 'GET',
				headers: { accept: 'application/json' },
				credentials: 'same-origin'
			});
			if (!res.ok) {
				errorMsg = 'Failed to load projects';
				projects = [];
				selectedProjectId = null;
				return;
			}
			const data = await res.json();
			projects = Array.isArray(data?.projects) ? data.projects : [];

			// Auto-select first project if none selected
			if (!$currentProject && projects.length) {
				await selectProject(projects[0].project_id);
			} else {
				selectedProjectId = $currentProject
					? $currentProject.project_id
					: (projects[0]?.project_id ?? null);
			}
		} catch (e) {
			errorMsg = 'Failed to load projects';
			projects = [];
			selectedProjectId = null;
		} finally {
			loadingProjects = false;
		}
	}

	async function selectProject(projectId: string) {
		selectedProjectId = projectId || null;
		const proj = projects.find((p) => p.project_id === projectId) || null;
		currentProject.set(proj);
		activeFileId.set(null);
		projectFiles.set([]);
		filesState.set({});
		if (!proj) return;

		// Load project files
		const res = await fetch(`/api/projects/${proj.project_id}/files`, {
			credentials: 'same-origin'
		});
		if (!res.ok) return;
		const data = await res.json();
		projectFiles.set(data.files ?? []);
	}

	function openCreateForm() {
		creating = true;
		newProjectName = '';
		setTimeout(() => {
			const el = document.getElementById('new-project-input') as HTMLInputElement | null;
			el?.focus();
		});
	}
	function cancelCreate() {
		creating = false;
		newProjectName = '';
	}

	async function submitCreate() {
		const name = newProjectName.trim();
		if (!name) return;
		creating = true;
		try {
			const res = await fetch('/api/projects', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ name })
			});
			if (!res.ok) {
				errorMsg = 'Failed to create project';
				return;
			}
			const created = await res.json(); // { project_id, name, ... }
			projects = [created, ...projects];
			selectedProjectId = created.project_id;
			await selectProject(created.project_id);
			creating = false;
			newProjectName = '';
		} finally {
			creating = false;
		}
	}

	let isParsing = $state(false);
	let parseError: string | null = $state(null);

	async function processFile(file: File) {
		isParsing = true;
		parseError = null;
		try {
			const parsed = await parseCSVFile(file, { useHeader: true });

			if ($currentProject) {
				const res = await fetch(`/api/projects/${$currentProject.project_id}/files`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					credentials: 'same-origin',
					body: JSON.stringify({
						name: file.name,
						originalFilename: file.name,
						snapshot: parsed
					})
				});
				if (!res.ok) {
					console.warn('Failed to create project file, falling back to local edit');
					csvData.set(parsed);
					await goto('/csvUploader');
					return;
				}
				const created = await res.json(); // { file_id, name, original_filename, ... }

				// Update the files list so tabs can appear
				projectFiles.update((list) => {
					const meta = {
						file_id: created.file_id,
						name: created.name,
						original_filename: created.original_filename ?? null
					};
					if (list.some((f) => f.file_id === meta.file_id)) return list;
					return [...list, meta];
				});

				// Open in editor
				setFileState(created.file_id, { ...parsed, loadedAt: new Date().toISOString() });
				activeFileId.set(created.file_id);
				await goto('/csvUploader');
			} else {
				// Local-only flow still supported
				csvData.set(parsed);
				await goto('/csvUploader');
			}
		} catch (err: any) {
			parseError = err?.message ?? 'Failed to load CSV';
		} finally {
			isParsing = false;
		}
	}

	async function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		await processFile(file);
		input.value = ''; // allow re-selecting same file
		showDrop = false;
	}

	function openOverlay() {
		showDrop = true;
		isDragging = false;
	}
	function closeOverlay() {
		showDrop = false;
		isDragging = false;
	}
	function openFilePicker() {
		fileInputRef?.click();
	}

	// Drag & drop handlers
	function onDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}
	function onDragLeave(e: DragEvent) {
		if (e.currentTarget === e.target) isDragging = false;
	}
	async function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) await processFile(file);
		showDrop = false;
	}

	onMount(fetchProjects);
</script>

<div class="csv-home">
	<!-- Project section -->
	<div class="card">
		<div class="row">
			<div class="col">
				<label class="label">Project</label>
				{#if loadingProjects}
					<div class="skeleton"></div>
				{:else if projects.length === 0}
					<div class="empty">
						<p>No projects yet.</p>
						<button class="btn primary" on:click={openCreateForm}>Create project</button>
					</div>
				{:else}
					<div class="select-row">
						<select
							id="project"
							disabled={loadingProjects || projects.length === 0}
							bind:value={selectedProjectId}
							on:change={(e) => selectProject((e.target as HTMLSelectElement).value)}
							aria-label="Select project"
						>
							{#each projects as p}
								<option value={p.project_id}>{p.name}</option>
							{/each}
						</select>
						<button class="btn outline" on:click={openCreateForm} title="Create a new project">
							＋ New
						</button>
					</div>
					{#if $currentProject}
						<small class="muted">Selected: {$currentProject.name}</small>
					{/if}
				{/if}
			</div>
		</div>

		{#if creating}
			<div class="create-row">
				<input
					id="new-project-input"
					class="input"
					type="text"
					placeholder="Project name"
					bind:value={newProjectName}
					maxlength={120}
					on:keydown={(e) => e.key === 'Enter' && submitCreate()}
				/>
				<button class="btn primary" on:click={submitCreate} disabled={!newProjectName.trim()}>
					Create
				</button>
				<button class="btn ghost" on:click={cancelCreate}>Cancel</button>
			</div>
		{/if}

		{#if errorMsg}<p class="error">{errorMsg}</p>{/if}
	</div>

	<!-- Upload section -->
	<div class="card">
		<div class="row space-between">
			<div>
				<h2>Upload CSV</h2>
				<p class="hint">
					{#if $currentProject}
						Files will be saved in <strong>{$currentProject.name}</strong>.
					{:else}
						You can upload and work locally, or create/select a project to save it.
					{/if}
				</p>
			</div>
			<button class="btn primary lg" on:click={openOverlay} title="Upload a CSV file">
				<span class="icon" style={`--icon-url: url("${UploadIcon}")`}></span>
				<span>Upload CSV</span>
			</button>
		</div>

		<input
			bind:this={fileInputRef}
			type="file"
			accept=".csv,text/csv"
			aria-label="Upload CSV file"
			class="visually-hidden"
			on:change={onFileChange}
		/>

		{#if isParsing}<p>Loading file…</p>{/if}
		{#if parseError}<p class="error">{parseError}</p>{/if}
	</div>
</div>

<!-- Overlay with dropzone -->
{#if showDrop}
	<div class="overlay" on:click={closeOverlay}>
		<div
			class="dropzone"
			class:dragging={isDragging}
			on:click|stopPropagation={openFilePicker}
			on:dragover={onDragOver}
			on:dragleave={onDragLeave}
			on:drop={onDrop}
			role="dialog"
			aria-modal="true"
			aria-label="Upload CSV by dragging a file here or click to browse"
		>
			<div class="dz-content">
				<strong>Drag & drop</strong> your CSV here
				<span>or</span>
				<button class="btn outline" on:click|stopPropagation={openFilePicker}>Browse files</button>
				<small>Only .csv files are supported</small>
			</div>
		</div>
	</div>
{/if}

<style>
	.csv-home {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.card {
		border: 1px solid #e6e6e6;
		border-radius: 12px;
		padding: 12px;
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	}

	.row {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.space-between {
		justify-content: space-between;
		align-items: center;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label {
		font-weight: 600;
	}

	.select-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	select {
		padding: 6px 8px;
		border: 1px solid #ddd;
		border-radius: 8px;
		min-width: 260px;
		background: #fff;
	}

	.create-row {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}
	.input {
		flex: 1 1 auto;
		padding: 8px 10px;
		border: 1px solid #ddd;
		border-radius: 8px;
	}

	h2 {
		margin: 0;
		font-size: 1.1rem;
	}
	.hint {
		margin: 4px 0 0 0;
		color: #555;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		border-radius: 10px;
		padding: 8px 12px;
		border: 1px solid #ddd;
		background: #fff;
		color: #222;
		cursor: pointer;
	}
	.btn:hover {
		background: #f8f9ff;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn.primary {
		background: #0b5fff;
		color: #fff;
		border-color: #0b5fff;
		box-shadow: 0 6px 16px rgba(11, 95, 255, 0.2);
	}
	.btn.primary:hover {
		background: #2b72ff;
	}
	.btn.outline {
		background: #fff;
		color: #0b5fff;
		border-color: #cdd9ff;
	}
	.btn.ghost {
		background: transparent;
		border-color: transparent;
		color: #555;
	}
	.btn.lg {
		padding: 10px 14px;
	}
	.btn .icon {
		width: 20px;
		height: 20px;
		background-color: currentColor;
		-webkit-mask: var(--icon-url) no-repeat center / contain;
		mask: var(--icon-url) no-repeat center / contain;
	}

	.muted {
		color: #666;
	}

	.empty {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.visually-hidden {
		position: absolute !important;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	.error {
		color: #b00020;
		margin-top: 0.5rem;
		font-weight: bold;
	}

	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(8px) saturate(120%);
		-webkit-backdrop-filter: blur(8px) saturate(120%);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}
	.dropzone {
		background: rgba(255, 255, 255, 0.1);
		background-image: linear-gradient(120deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
		min-width: 520px;
		max-width: 90vw;
		min-height: 240px;
		border: 1px solid rgba(255, 255, 255, 0.35);
		border-radius: 16px;
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(18px) saturate(130%);
		-webkit-backdrop-filter: blur(18px) saturate(130%);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		cursor: pointer;
		color: white;
	}
	.dropzone.dragging {
		background: rgba(255, 255, 255, 0.18);
		border-color: rgba(255, 255, 255, 0.55);
	}
	.dz-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		text-align: center;
	}
</style>
