<script lang="ts">
	// This page just uses the CsvUploader component.
	import CsvUploader from '$lib/components/csvUploader/CsvUploader.svelte';
</script>

<h1>CSV Upload & Preview</h1>
<p>
	Upload a CSV file to parse, preview, and persist locally. (This is an initial version; later you
	can add cleaning, filtering, exporting, etc.)
</p>

<CsvUploader />
