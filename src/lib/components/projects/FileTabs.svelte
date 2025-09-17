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
		const res = await fetch(`/api/projects/${$currentProject.project_id}/files`);
		if (!res.ok) return;
		const data = await res.json();
		projectFiles.set(data.files ?? []);
	}

	async function loadTab(fileId: string) {
		activeFileId.set(fileId);
		// if not loaded, pull snapshot
		if (!$filesState[fileId]) {
			const res = await fetch(`/api/files/${fileId}/state`);
			if (res.ok) {
				const data = await res.json();
				if (data.snapshot) {
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
			// Use fixed seq=1 and overwrite (ON CONFLICT) to keep it simple
			const res = await fetch(`/api/files/${id}/snapshot`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
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
		<button class="tab add" on:click={openUpload} title="Add CSV">＋</button>
		<input
			type="file"
			accept=".csv,text/csv"
			bind:this={fileInput}
			on:change={onUpload}
			style="display:none"
		/>
	</div>
	<div class="spacer"></div>
	<button on:click={saveActiveSnapshot} disabled={!$activeFileId || saving}>
		{saving ? 'Saving…' : 'Save'}
	</button>
</div>

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
	}
	.tab.active {
		background: #eaf2ff;
		border-color: #bcd3ff;
	}
	.tab.add {
		background: #fff;
	}
	.spacer {
		flex: 1 1 auto;
	}
</style>
