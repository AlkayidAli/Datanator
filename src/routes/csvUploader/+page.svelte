<script lang="ts">
	import CsvUploader from '$lib/components/csvParser/CsvParser.svelte';
	import CsvHome from '$lib/components/CsvHome/CsvHome.svelte';
	import { csvData } from '$lib/stores/csvData';
</script>

{#if !$csvData}
	<CsvHome />
{/if}
<CsvUploader />
