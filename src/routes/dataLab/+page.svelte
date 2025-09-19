<script lang="ts">
	import FileTabs from '$lib/components/projects/FileTabs.svelte';
	import DataLab from '$lib/components/dataLab/DataLab.svelte';
	import { activeFileId, projectFiles, currentProject } from '$lib/stores/project';
</script>

<div class="page">
	{#if $currentProject && $projectFiles.length > 0}
		<FileTabs />
	{/if}

	{#if $activeFileId}
		<DataLab />
	{:else}
		<p style="padding:12px">Upload or open a file first.</p>
	{/if}
</div>

<style>
	.page {
		padding: 12px;
	}
</style>
