<script lang="ts">
	import { currentProject, activeFileId } from '$lib/stores/project';
	import { filesState } from '$lib/stores/csvMulti';
	import type { ParsedCSV } from '$lib/stores/csvData';
	import { toasts } from '$lib/stores/toastStore';
	import { goto } from '$app/navigation';
	import type { ChartSpec } from '$lib/types/visualization';
	import { createVisualization } from '$lib/api/visualizations';

	import VisualizeEasy from './VisualizeEasy.svelte';
	import VisualizeAdvanced from './VisualizeAdvanced.svelte';
	import { exportSvgElement } from '$lib/utils/exportImage';

	// Dataset
	const data = $derived<ParsedCSV | null>(
		$activeFileId ? ($filesState[$activeFileId] ?? null) : null
	);
	const headers = $derived<string[]>(data ? data.headers : []);

	// Mode toggle
	let mode = $state<'easy' | 'advanced'>('easy');

	// Current spec from the active tool
	let currentSpec = $state<ChartSpec | null>(null);

	function backToProjects() {
		activeFileId.set(null);
	}

	async function saveChartConfig() {
		if (!$currentProject || !$activeFileId || !data || !currentSpec) return;
		try {
			const name = currentSpec.title?.trim() || 'Untitled visualization';
			await createVisualization({
				projectId: $currentProject.project_id,
				fileId: $activeFileId,
				name,
				spec: currentSpec
			});
			toasts.success('Visualization saved.');
		} catch (e: any) {
			toasts.error(e?.message ?? 'Failed to save visualization.');
		}
	}

	let exportBump = $state(0);
	let exportFormat = $state<'png' | 'svg'>('png');
	async function exportChartImage() {
		try {
			// Signal child to export via exportBump prop; child will locate its inner SVG
			exportBump++;
		} catch (e: any) {
			toasts.error(e?.message ?? 'Export failed.');
		}
	}
</script>

{#if !$currentProject}
	<p>Select a project to continue.</p>
{:else if !$activeFileId || !data}
	<p>Open a dataset first (select a file tab), then come back to Visualization.</p>
{:else}
	<div class="viz">
		<div class="topbar">
			<button class="secondary" onclick={backToProjects} title="Back to projects">
				<span class="material-symbols-outlined">arrow_back</span>
				Projects
			</button>
			<button class="secondary" onclick={() => goto('/dataLab')}>
				<span class="material-symbols-outlined">functions</span>
				Data Lab
			</button>

			<div class="spacer"></div>

			<div class="mode-toggle" role="tablist" aria-label="Visualization mode">
				<button
					class:active={mode === 'easy'}
					role="tab"
					aria-selected={mode === 'easy'}
					onclick={() => (mode = 'easy')}
				>
					Easy
				</button>
				<button
					class:active={mode === 'advanced'}
					role="tab"
					aria-selected={mode === 'advanced'}
					onclick={() => (mode = 'advanced')}
				>
					Advanced
				</button>
			</div>

			<div class="spacer"></div>

			<div class="actions">
				<button class="secondary" onclick={saveChartConfig} disabled={!currentSpec}>
					Save config
				</button>
				<button class="secondary" onclick={exportChartImage}> Export image </button>
			</div>
		</div>

		{#if mode === 'easy'}
			<VisualizeEasy
				{headers}
				rows={data.rows}
				exportToken={exportBump}
				exportName={currentSpec?.title || 'chart'}
				{exportFormat}
				on:specChange={(e) => (currentSpec = e.detail.spec)}
			/>
		{:else}
			<VisualizeAdvanced
				{headers}
				rows={data.rows}
				exportToken={exportBump}
				exportName={currentSpec?.title || 'chart'}
				{exportFormat}
				on:specChange={(e) => (currentSpec = e.detail.spec)}
			/>
		{/if}

		<small class="muted"
			>Rows: {data.rows.length} | Columns: {data.headers.length} • File: {data.filename}</small
		>
	</div>
{/if}

<style>
	.viz {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.topbar {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.spacer {
		flex: 1 1 auto;
	}
	.mode-toggle {
		display: inline-flex;
		border: 1px solid #e2e2e2;
		border-radius: 10px;
		overflow: hidden;
		background: #fff;
	}
	.mode-toggle > button {
		padding: 6px 12px;
		border: none;
		background: transparent;
		cursor: pointer;
	}
	.mode-toggle > button.active {
		background: #eef3ff;
		color: #123;
		font-weight: 600;
	}
	.actions {
		display: inline-flex;
		gap: 8px;
	}
	button.secondary {
		min-height: 36px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		border-radius: 10px;
		padding: 6px 10px;
		border: 1px solid #e1e1e1;
		background: #fff;
	}
	.muted {
		color: #666;
	}
</style>
