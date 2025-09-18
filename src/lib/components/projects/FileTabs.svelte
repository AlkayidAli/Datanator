<script lang="ts">
	import { onMount } from 'svelte';
	import { currentProject, projectFiles, activeFileId } from '$lib/stores/project';
	import { filesState, setFileState } from '$lib/stores/csvMulti';
	import { parseCSVFile } from '$lib/utils/csv/csv';

	let fileInput: HTMLInputElement | null = null;
	let saving = false;

	async function openUpload() {
		fileInput?.click();
	}

	async function onUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0 || !$currentProject) return;
		const file = input.files[0];

		try {
			const parsed = await parseCSVFile(file, { useHeader: true });
			// Create a file on the server with initial snapshot at seq=0
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
			if (!res.ok) throw new Error('Failed to create file');
			const created = await res.json(); // { file_id, name, ... }
			// refresh files list
			await refreshFiles();
			// set state locally and activate tab
			setFileState(created.file_id, { ...parsed, loadedAt: new Date().toISOString() });
			activeFileId.set(created.file_id);
		} catch (err: any) {
			alert(err?.message ?? 'Upload failed');
		} finally {
			if (input) input.value = '';
		}
	}

	async function refreshFiles() {
		if (!$currentProject) return;
		const res = await fetch(`/api/projects/${$currentProject.project_id}/files`, {
			credentials: 'same-origin'
		});
		if (!res.ok) return;
		const data = await res.json();
		projectFiles.set(data.files ?? []);
	}

	async function loadTab(fileId: string) {
		activeFileId.set(fileId);
		// If state not loaded yet, fetch snapshot
		if (!$filesState[fileId]) {
			const res = await fetch(`/api/files/${fileId}/state`, {
				credentials: 'same-origin'
			});
			if (res.ok) {
				const data = await res.json();
				if (data?.snapshot) {
					setFileState(fileId, { ...data.snapshot, loadedAt: new Date().toISOString() });
				}
			}
		}
	}

	async function saveActiveSnapshot() {
		const id = $activeFileId;
		if (!id) return;
		const snapshot = $filesState[id];
		if (!snapshot) return;
		saving = true;
		try {
			const res = await fetch(`/api/files/${id}/snapshot`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ seq: 1, snapshot })
			});
			if (!res.ok) throw new Error('Failed to save snapshot');
		} catch (e: any) {
			alert(e?.message ?? 'Save failed');
		} finally {
			saving = false;
		}
	}

	$: ($currentProject, $projectFiles, $activeFileId, $filesState); // subscribe
	onMount(refreshFiles);
</script>

{#if $currentProject && $projectFiles.length > 0}
	<div class="tabs-bar" aria-label="Files">
		<div class="tabs">
			{#each $projectFiles as f}
				<button
					class="tab"
					class:active={$activeFileId === f.file_id}
					on:click={() => loadTab(f.file_id)}
					title={f.original_filename ?? f.name}
				>
					{f.name}
				</button>
			{/each}

			<button
				class="add-btn"
				on:click={openUpload}
				title="Add file to project"
				aria-label="Add file"
			>
				<span class="material-symbols-outlined">add</span>
			</button>
		</div>

		<!-- Add file button -->

		<!-- Hidden input for CSV upload -->
		<input
			bind:this={fileInput}
			type="file"
			accept=".csv,text/csv"
			class="visually-hidden"
			on:change={onUpload}
		/>
	</div>
{/if}

<style>
	.tabs-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 8px 0;
	}
	.tabs {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.tab {
		padding: 6px 10px;
		border: 1px solid #ddd;
		background: #f7f7f7;
		border-radius: 8px;
		cursor: pointer;
	}
	.tab.active {
		background: #eaf2ff;
		border-color: #bcd3ff;
	}

	/* + button styled to match your UI (outline + Material icon) */
	.add-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		border: 1px solid #cdd9ff;
		background: #fff;
		color: #0b5fff;
		cursor: pointer;
		box-shadow: 0 2px 6px rgba(11, 95, 255, 0.1);
	}
	.add-btn:hover {
		background: #f8f9ff;
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
</style>
