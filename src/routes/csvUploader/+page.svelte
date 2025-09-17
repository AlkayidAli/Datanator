<script lang="ts">
	import ProjectBar from '$lib/components/projects/ProjectBar.svelte';
	import FileTabs from '$lib/components/projects/FileTabs.svelte';
	import CsvUploader from '$lib/components/csvParser/CsvParser.svelte';
	import CsvHome from '$lib/components/CsvHome/CsvHome.svelte';

	import { csvData } from '$lib/stores/csvData';
	import { activeFileId, projectFiles, currentProject } from '$lib/stores/project';
	import { filesState } from '$lib/stores/csvMulti';
	import { onDestroy } from 'svelte';
	import { get } from 'svelte/store';

	// Keep csvData in sync when the underlying file state changes
	const unsub = filesState.subscribe((map) => {
		const id = get(activeFileId);
		if (!id) return;
		const next = map[id];
		if (!next) return;
		const cur = get(csvData);
		if (cur !== next) csvData.set(next);
	});
	const unsub2 = csvData.subscribe((val) => {
		const id = get(activeFileId);
		if (!id || !val) return;
		filesState.update((m) => {
			const cur = m[id];
			if (cur === val) return m;
			return { ...m, [id]: val };
		});
	});

	// Also switch the editor immediately when the active tab changes
	$: if ($activeFileId) {
		const next = $filesState[$activeFileId];
		if (next && get(csvData) !== next) {
			csvData.set(next);
		}
	}

	onDestroy(() => {
		unsub();
		unsub2();
	});
</script>

<div class="page">
	<ProjectBar />
	{#if $currentProject}
		<FileTabs />
	{/if}

	{#if $activeFileId}
		<CsvUploader />
	{:else}
		<!-- Reuse your existing upload UI; hide its internal ProjectBar to avoid duplication -->
		<CsvHome showProjectBar={false} />
	{/if}
</div>

<style>
	.page {
		padding: 8px;
	}
</style>
