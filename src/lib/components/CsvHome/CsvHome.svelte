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

	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');

	async function deleteProject() {
		if (!$currentProject) return;
		const name = $currentProject.name;
		if (deleteConfirmText.trim() !== name) {
			errorMsg = 'Project name does not match';
			return;
		}
		const res = await fetch(`/api/projects/${$currentProject.project_id}`, {
			method: 'DELETE',
			credentials: 'same-origin'
		});
		if (!res.ok && res.status !== 204) {
			errorMsg = 'Failed to delete project';
			return;
		}
		// Remove locally and reset selection
		projects = projects.filter((p) => p.project_id !== $currentProject!.project_id);
		currentProject.set(null);
		projectFiles.set([]);
		activeFileId.set(null);
		filesState.set({});
		selectedProjectId = projects[0]?.project_id ?? null;
		showDeleteConfirm = false;
		deleteConfirmText = '';
		// Optionally auto-select next project
		if (selectedProjectId) await selectProject(selectedProjectId);
	}
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
						<button class="btn primary" onclick={openCreateForm}>Create project</button>
					</div>
				{:else}
					<div class="select-row">
						<div class="selector-group">
							<select
								id="project"
								class="project-select"
								disabled={loadingProjects || projects.length === 0}
								bind:value={selectedProjectId}
								onchange={(e) => selectProject((e.target as HTMLSelectElement).value)}
								aria-label="Select project"
							>
								{#each projects as p}
									<option value={p.project_id}>{p.name}</option>
								{/each}
							</select>
							<button
								class="btn primary grouped"
								onclick={openCreateForm}
								title="Create a new project"
							>
								<span class="material-symbols-outlined">add</span>
								<span>New</span>
							</button>
						</div>
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
					onkeydown={(e) => e.key === 'Enter' && submitCreate()}
				/>
				<button class="btn primary" onclick={submitCreate} disabled={!newProjectName.trim()}>
					Create
				</button>
				<button class="btn ghost" onclick={cancelCreate}>Cancel</button>
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
			<button class="btn primary lg" onclick={openOverlay} title="Upload a CSV file">
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
			onchange={onFileChange}
		/>

		{#if isParsing}<p>Loading file…</p>{/if}
		{#if parseError}<p class="error">{parseError}</p>{/if}
	</div>
</div>

<!-- Under the project select, show a danger action when a project is selected -->
{#if $currentProject}
	<div class="danger-area">
		<button
			class="btn danger"
			onclick={() => {
				showDeleteConfirm = true;
				deleteConfirmText = '';
			}}
		>
			<span class="material-symbols-outlined">delete</span>
			Delete project
		</button>
		<small class="muted">This will delete all files in this project.</small>
	</div>
{/if}

{#if showDeleteConfirm && $currentProject}
	<div class="danger-box" role="dialog" aria-modal="true" aria-label="Confirm delete project">
		<p>
			Type the project name to confirm deletion:
			<strong>{$currentProject.name}</strong>
		</p>
		<input
			class="input"
			placeholder="Project name"
			bind:value={deleteConfirmText}
			aria-label="Confirm project name"
		/>
		<div class="row" style="margin-top:8px;">
			<button class="btn secondary" onclick={() => (showDeleteConfirm = false)}>Cancel</button>
			<button
				class="btn danger"
				onclick={deleteProject}
				disabled={deleteConfirmText.trim() !== $currentProject.name}
			>
				Confirm delete
			</button>
		</div>
	</div>
{/if}

<!-- Overlay with dropzone -->
{#if showDrop}
	<div class="overlay" onclick={closeOverlay}>
		<div
			class="dropzone"
			class:dragging={isDragging}
			onclick={(e) => {
				e.stopPropagation();
				openFilePicker();
			}}
			ondragover={onDragOver}
			ondragleave={onDragLeave}
			ondrop={onDrop}
			role="dialog"
			aria-modal="true"
			aria-label="Upload CSV by dragging a file here or click to browse"
		>
			<div class="dz-content">
				<strong>Drag & drop</strong> your CSV here
				<span>or</span>
				<button
					class="btn outline"
					onclick={(e) => {
						e.stopPropagation();
						openFilePicker();
					}}
				>
					Browse files
				</button>
				<small>Only .csv files are supported</small>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../../styles/global.scss' as global;

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

	/* Selector group (select + New button) */
	.select-row {
		display: flex;
		align-items: center;
	}
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

	/* Use your dark primary palette for buttons (match login) */
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
	.btn:hover {
		background: global.$background-secondary-color;
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
	.btn.primary.grouped:hover {
		background: global.$background-secondary-color;
		color: global.$text-grey-90;
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

	.create-row {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}
	.input {
		flex: 1 1 auto;
		padding: 8px 10px;
		border: 1px solid global.$text-grey-10;
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

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn.outline {
		background: #fff;
		color: global.$text-grey-90;
		border-color: global.$text-grey-10;
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

	.danger-area {
		padding: 0 1em;
		margin-top: 8px;
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.btn.danger {
		border-color: #f3c7c7;
		color: #a11;
		background: #fff;
	}
	.btn.danger:hover {
		background: #fff7f7;
	}
	.danger-box {
		margin-top: 8px;
		padding: 10px;
		border: 1px solid #f0d3d3;
		border-radius: 10px;
		background: #fff7f7;
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

	@media (max-width: 560px) {
		.selector-group {
			flex-direction: column;
			align-items: stretch;
			border-radius: 10px;
		}
		.project-select {
			min-width: 0;
			width: 100%;
			border-bottom: 1px solid global.$text-grey-10;
			border-right: none;
			height: 42px;
		}
		.btn.primary.grouped {
			width: 100%;
			border-left: none;
			border-top: none;
			border-radius: 0 0 10px 10px;
		}
	}
</style>
