<script lang="ts">
	import { onMount } from 'svelte';
	import { currentProject, projectFiles, activeFileId } from '$lib/stores/project';
	import { filesState, setFileState } from '$lib/stores/csvMulti';
	import { parseCSVFile } from '$lib/utils/csv/csv';

	let fileInput = $state<HTMLInputElement | null>(null);
	let saving = $state(false);

	// Deletion state
	let deletingFileId = $state<string | null>(null);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);
	let deleteDialogPos = $state<{ x: number; y: number } | null>(null);
	let deleteDismissTimer: ReturnType<typeof setTimeout> | null = null;

	// NEW: dialog element ref for focus
	let deleteDialogEl = $state<HTMLDivElement | null>(null);

	const deletingMeta = $derived(() => {
		if (!deletingFileId) return null;
		return $projectFiles.find((f) => f.file_id === deletingFileId) ?? null;
	});

	function startDelete(id: string, evt: MouseEvent) {
		deleteError = null;
		deletingFileId = id;

		// Cursor position (adjust to stay in viewport)
		const margin = 12;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		let x = evt.clientX;
		let y = evt.clientY;

		const approxWidth = 300;
		const approxHeight = 150;
		if (x + approxWidth + margin > vw) x = vw - approxWidth - margin;
		if (y + approxHeight + margin > vh) y = vh - approxHeight - margin;
		if (x < margin) x = margin;
		if (y < margin) y = margin;

		deleteDialogPos = { x, y };

		// Auto-dismiss after 5s
		if (deleteDismissTimer) clearTimeout(deleteDismissTimer);
		deleteDismissTimer = setTimeout(() => {
			cancelDelete();
		}, 5000);
	}

	function clearDeleteTimer() {
		if (deleteDismissTimer) {
			clearTimeout(deleteDismissTimer);
			deleteDismissTimer = null;
		}
	}

	function cancelDelete() {
		clearDeleteTimer();
		deletingFileId = null;
		deleteError = null;
		deleteDialogPos = null;
	}

	async function confirmDeleteFile() {
		if (!deletingFileId) return;
		clearDeleteTimer();
		deleting = true;
		deleteError = null;
		try {
			const res = await fetch(`/api/files/${deletingFileId}`, {
				method: 'DELETE',
				credentials: 'same-origin'
			});
			if (!res.ok) {
				deleteError = 'Failed to delete file';
				return;
			}
			if ($activeFileId === deletingFileId) {
				activeFileId.set(null);
			}
			await refreshFiles();
			if ($projectFiles.length > 0) {
				activeFileId.set($projectFiles[0].file_id);
			}
		} catch (e: any) {
			deleteError = e?.message ?? 'Error deleting file';
		} finally {
			deleting = false;
			deletingFileId = null;
			deleteDialogPos = null;
		}
	}

	async function openUpload() {
		fileInput?.click();
	}

	async function onUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0 || !$currentProject) return;
		const file = input.files[0];
		try {
			const parsed = await parseCSVFile(file, { useHeader: true });
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
			const created = await res.json();
			await refreshFiles();
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

	function onWindowClick(e: MouseEvent) {
		if (!deletingFileId) return;
		const target = e.target as HTMLElement;
		if (target.closest('.delete-dialog') || target.closest('.tab-del')) return;
		cancelDelete();
	}

	// Replace legacy $: subscription with an empty effect (keeps stores live if needed)
	$effect(() => {
		$currentProject;
		$projectFiles;
		$activeFileId;
		$filesState;
	});

	onMount(refreshFiles);

	// NEW: ensure dialog key handler exists
	function onDialogKey(e: KeyboardEvent) {
		if (!deleteDialogEl) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			cancelDelete();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			confirmDeleteFile();
			return;
		}
		if (e.key === 'Tab') {
			const focusables = Array.from(deleteDialogEl.querySelectorAll<HTMLElement>('button'));
			if (focusables.length === 0) return;
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			const active = document.activeElement as HTMLElement | null;
			if (e.shiftKey && active === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	// Focus dialog when it mounts
	$effect(() => {
		if (deleteDialogEl) queueMicrotask(() => deleteDialogEl?.focus());
	});
</script>

<svelte:window on:click={onWindowClick} />

{#if $currentProject && $projectFiles.length > 0}
	<div class="tabs-bar" aria-label="Files">
		<div class="tabs">
			{#each $projectFiles as f}
				<div class="tab-wrap">
					<button
						class="tab"
						class:active={$activeFileId === f.file_id}
						onclick={() => loadTab(f.file_id)}
						title={f.original_filename ?? f.name}
						aria-label={`Open file ${f.name}`}
					>
						<span class="tab-label">{f.name}</span>
					</button>
					<button
						class="tab-del"
						title={`Delete ${f.name}`}
						aria-label={`Delete ${f.name}`}
						onclick={(e) => startDelete(f.file_id, e)}
					>
						<span class="material-symbols-outlined">delete</span>
					</button>
				</div>
			{/each}
			<button
				class="add-btn"
				onclick={openUpload}
				title="Add file to project"
				aria-label="Add file"
			>
				<span class="material-symbols-outlined">add</span>
			</button>
		</div>
		<input
			bind:this={fileInput}
			type="file"
			accept=".csv,text/csv"
			class="visually-hidden"
			onchange={onUpload}
		/>
	</div>

	{#if deletingFileId && deletingMeta && deleteDialogPos}
		<div
			class="delete-dialog floating"
			role="dialog"
			aria-modal="true"
			aria-label="Confirm delete file"
			style="left:{deleteDialogPos.x}px; top:{deleteDialogPos.y}px"
			tabindex="-1"
			bind:this={deleteDialogEl}
			onclick={(e) => e.stopPropagation()}
			onkeydown={onDialogKey}
		>
			<p class="dlg-text">
				Delete <strong>{deletingMeta.name}</strong>? This cannot be undone.
			</p>
			{#if deleteError}<p class="error">{deleteError}</p>{/if}
			<div class="dialog-actions">
				<button class="btn subtle" onclick={cancelDelete} disabled={deleting}>Cancel</button>
				<button class="btn danger-outline" onclick={confirmDeleteFile} disabled={deleting}>
					{deleting ? 'Deleting…' : 'Delete'}
				</button>
			</div>
			<small class="autodismiss-note">(Esc to cancel)</small>
		</div>
	{/if}
{/if}

<style>
	.tabs-bar {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 8px 0;
		flex-wrap: wrap;
	}
	.tabs {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		align-items: flex-start;
	}

	.tab-wrap {
		display: inline-flex;
		align-items: stretch;
		position: relative;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
	}
	.tab {
		padding: 6px 10px;
		border: 1px solid #ddd;
		background: #f7f7f7;
		border-radius: 8px 0 0 8px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 4px;
		border-right: none;
	}
	.tab.active {
		background: #eaf2ff;
		border-color: #bcd3ff;
	}
	.tab-del {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		border: 1px solid #ddd;
		border-left: none;
		background: #fff;
		cursor: pointer;
		border-radius: 0 8px 8px 0;
		color: #666;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.tab-del:hover {
		background: #f2f2f2;
		color: #b22;
	}
	.tab-wrap:hover .tab-del {
		opacity: 1;
	}
	.tab-label {
		max-width: 140px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

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

	.delete-dialog {
		border: 1px solid #d4d4d4;
		background: #fff;
		padding: 10px 12px 12px;
		border-radius: 8px;
		max-width: 300px;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		gap: 10px;
		font-size: 0.85rem;
	}
	.delete-dialog.floating {
		position: fixed;
		z-index: 50;
	}
	.autodismiss-note {
		font-size: 0.65rem;
		color: #777;
		align-self: flex-end;
		margin-top: -4px;
	}
	.dlg-text {
		margin: 0;
		line-height: 1.3;
	}
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}
	.btn.subtle {
		min-height: 30px;
		padding: 4px 12px;
		border-radius: 6px;
		border: 1px solid #c8c8c8;
		background: #fafafa;
		cursor: pointer;
		font-size: 0.75rem;
	}
	.btn.subtle:hover:not(:disabled) {
		background: #f0f0f0;
	}
	.btn.danger-outline {
		min-height: 30px;
		padding: 4px 14px;
		border-radius: 6px;
		border: 1px solid #c88;
		background: #fff;
		color: #a02222;
		font-weight: 500;
		cursor: pointer;
		font-size: 0.75rem;
	}
	.btn.danger-outline:hover:not(:disabled) {
		background: #fff6f6;
	}
	.btn.danger-outline:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.error {
		color: #b00020;
		font-size: 0.7rem;
		margin: 0;
	}
</style>
