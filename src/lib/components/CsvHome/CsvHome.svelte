<script lang="ts">
	import { goto } from '$app/navigation';
	import { parseCSVFile } from '$lib/utils/csv/csv';
	import { csvData } from '$lib/stores/csvData';
	import UploadIcon from '$lib/common/upload_icon.svg';

	// project-aware imports
	import ProjectBar from '$lib/components/projects/ProjectBar.svelte';
	import { currentProject, activeFileId } from '$lib/stores/project';
	import { setFileState } from '$lib/stores/csvMulti';

	// Allow the page to hide the internal ProjectBar
	const props = $props<{ showProjectBar?: boolean }>();

	let isParsing = $state(false);
	let parseError: string | null = $state(null);

	// Drag & drop overlay state
	let showDrop = $state(false);
	let isDragging = $state(false);

	// Hidden input ref (programmatic open)
	let fileInputRef = $state<HTMLInputElement | null>(null);

	// Upload handler: if a project is selected, create a project file with initial snapshot.
	// Otherwise, keep previous local-only behavior.
	async function processFile(file: File) {
		isParsing = true;
		parseError = null;
		try {
			const parsed = await parseCSVFile(file, { useHeader: true });

			if ($currentProject) {
				// Save to server as a new file in the selected project
				const res = await fetch(`/api/projects/${$currentProject.project_id}/files`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						name: file.name,
						originalFilename: file.name,
						snapshot: parsed
					})
				});
				if (!res.ok) {
					// Fallback to local if server rejects
					console.warn('Failed to create project file, falling back to local edit');
					csvData.set(parsed);
					await goto('/csvUploader');
					return;
				}
				const created = await res.json(); // { file_id, name, ... }

				// Seed the app state for the editor, then go to the editor page
				setFileState(created.file_id, { ...parsed, loadedAt: new Date().toISOString() });
				activeFileId.set(created.file_id);
				await goto('/csvUploader');
			} else {
				// Local-only flow (unchanged)
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
		// only when leaving the dropzone, not its children
		if (e.currentTarget === e.target) isDragging = false;
	}
	async function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) await processFile(file);
		showDrop = false;
	}
</script>

<div class="csv-home">
	<!-- Project selector (can be hidden by parent) -->
	{#if props.showProjectBar !== false}
		<ProjectBar />
	{/if}

	<h1>CSV Upload</h1>
	<p>
		{#if $currentProject}
			Uploads will be saved to your project
			<strong>{$currentProject.name}</strong> and available from any device.
		{:else}
			To get started, upload a CSV file. Your data will not be saved in our database; it stays in
			your browser.
		{/if}
	</p>

	<!-- Trigger button -->
	<!-- svelte-ignore event_directive_deprecated -->
	<button class="upload-button" on:click={openOverlay}>
		<span class="icon" style={`--icon-url: url("${UploadIcon}")`}></span>
		<span class="label">
			Upload CSV<br />File
		</span>
	</button>

	<!-- Hidden input used by both the button and the dropzone -->
	<!-- svelte-ignore event_directive_deprecated -->
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

<!-- Overlay with dropzone -->
{#if showDrop}
	<!-- svelte-ignore a11y_interactive_supports_focus -->
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
				<button class="browse-btn secondary" on:click|stopPropagation={openFilePicker}>
					Browse files
				</button>
				<small>Only .csv files are supported</small>
			</div>
		</div>
	</div>
{/if}

<style>
	.upload-button {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.85rem 1.1rem;
		border-radius: 12px;
		border: 1px solid #ddd;
		background: #0b5fff;
		color: white;
		cursor: pointer;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
		min-width: 12rem;
	}
	.upload-button:hover {
		background: #407dff;
	}
	.upload-button .icon {
		display: inline-block;
		width: 36px;
		height: 36px;
		background-color: currentColor;
		-webkit-mask: var(--icon-url) no-repeat center / contain;
		mask: var(--icon-url) no-repeat center / contain;
	}
	.upload-button .label {
		line-height: 1.1;
		font-weight: 550;
		font-size: 1.05rem;
		text-align: left;
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
	.error {
		color: #b00020;
		margin-top: 0.5rem;
		font-weight: bold;
	}
</style>
