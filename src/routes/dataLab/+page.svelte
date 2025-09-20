<script lang="ts">
	import FileTabs from '$lib/components/projects/FileTabs.svelte';
	import DataLab from '$lib/components/dataLab/DataLab.svelte';
	import ProjectBar from '$lib/components/projects/ProjectBar.svelte';
	import CsvHome from '$lib/components/CsvHome/CsvHome.svelte';
	import { activeFileId, projectFiles, currentProject } from '$lib/stores/project';
</script>

<div class="page">
	<!-- Project picker (select/create project) -->
	<ProjectBar />

	{#if $currentProject && $projectFiles.length > 0}
		<FileTabs />
	{/if}

	{#if $activeFileId}
		<DataLab />
	{:else}
		<!-- Let users upload/open files in this route too -->
		<CsvHome />
	{/if}
</div>

<style>
	.page {
		padding: 12px;
	}
</style>
