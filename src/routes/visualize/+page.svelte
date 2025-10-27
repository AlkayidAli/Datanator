<script lang="ts">
	import FileTabs from '$lib/components/projects/FileTabs.svelte';
	import CsvHome from '$lib/components/CsvHome/CsvHome.svelte';
	import Visualize from '$lib/components/visualize/Visualize.svelte';
	import { currentProject, projectFiles, activeFileId } from '$lib/stores/project';
</script>

<div class="page">
	{#if $currentProject && $projectFiles.length > 0}
		<FileTabs />
	{/if}

	{#if $activeFileId}
		<Visualize />
	{:else}
		<CsvHome />
	{/if}
</div>

<style>
	.page {
		padding: 12px;
	}
</style>
