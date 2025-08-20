<script lang="ts">
	/*
  SVELTE 5 REFACTOR NOTES:
  - We use $state(...) for mutable local state (replaces writable() for component-local).
  - We use $derived(...) for computed values (like paginated rows & total pages).
  - We use $effect(...) for side-effects reacting to reactive values.
  - We can still auto-subscribe to the global store with $csvData because that feature remains.

  Flow:
    1. User selects file
    2. parseCSVFile -> set into global csvData store
    3. Local pagination state updates; derived values recompute
*/

	import { parseCSVFile } from '$lib/utils/csv/csv';
	import { csvData, clearCSV } from '$lib/stores/csvData';

	// Local rune-based state
	let isParsing = $state(false);
	let parseError: string | null = $state(null);
	let showAdvanced = $state(false);

	let pageSize = $state(25);
	let currentPage = $state(1);

	// Derived: total pages depends on $csvData and pageSize
	const totalPages = $derived(() => {
		if (!$csvData) return 0;
		return Math.max(1, Math.ceil($csvData.rows.length / pageSize));
	});

	// Derived: paginated rows slice
	const paginatedRows = $derived(() => {
		if (!$csvData) return [];
		const start = (currentPage - 1) * pageSize;
		return $csvData.rows.slice(start, start + pageSize);
	});

	// Effect: whenever csvData changes, reset current page to 1
	$effect(() => {
		// Accessing $csvData here makes it a dependency.
		if ($csvData) {
			currentPage = 1;
		}
	});

	// Helper to go to page (ensures in-range)
	function goToPage(p: number) {
		if (p < 1) p = 1;
		if (p > totalPages()) p = totalPages();
		currentPage = p;
	}

	// Handle file selection
	async function handleFileSelection(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const file = input.files[0];

		parseError = null;
		isParsing = true;

		try {
			const useHeader = true; // Later you can add a toggle
			const parsed = await parseCSVFile(file, useHeader);
			csvData.set(parsed);
		} catch (err: any) {
			parseError = err?.message || 'Unknown parse error';
		} finally {
			isParsing = false;
			input.value = '';
		}
	}
</script>

<div class="uploader-container">
	<h2>CSV Uploader (Svelte 5)</h2>

	<input
		type="file"
		accept=".csv,text/csv"
		onchange={handleFileSelection}
		aria-label="Upload CSV file"
	/>

	<button type="button" onclick={() => (showAdvanced = !showAdvanced)}>
		{#if showAdvanced}Hide Advanced Options{/if}
		{#if !showAdvanced}Show Advanced Options{/if}
	</button>

	{#if showAdvanced}
		<div style="margin-top:0.5rem;">
			<em>Advanced options placeholder (e.g. choose delimiter, header usage toggle, encoding).</em>
		</div>
	{/if}

	{#if isParsing}
		<p>Parsing file... Please wait.</p>
	{/if}
	{#if parseError}
		<p class="error">Error: {parseError}</p>
	{/if}

	{#if $csvData}
		<hr />
		<div>
			<strong>Loaded File:</strong>
			{$csvData.filename}<br />
			<small class="meta">
				Rows: {$csvData.rows.length} | Columns: {$csvData.headers.length} | Loaded at: {$csvData.loadedAt}
			</small>
		</div>

		<div class="pagination">
			<label>
				Rows per page:
				<!-- bind:value replaced by just value + on:change in Svelte 5? 
             Svelte 5 still supports bind but we can keep it. -->
				<select bind:value={pageSize} onchange={() => (currentPage = 1)}>
					<option value={10}>10</option>
					<option value={25}>25</option>
					<option value={50}>50</option>
					<option value={100}>100</option>
				</select>
			</label>

			<button onclick={() => goToPage(1)} disabled={currentPage === 1}>First</button>
			<button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>Prev</button>
			<span>Page {currentPage} of {totalPages()}</span>
			<button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages()}>
				Next
			</button>
			<button onclick={() => goToPage(totalPages())} disabled={currentPage === totalPages()}>
				Last
			</button>

			<button onclick={clearCSV} style="margin-left:auto;">Clear Loaded CSV</button>
		</div>

		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						{#each $csvData.headers as h}
							<th>{h}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each paginatedRows() as row}
						<tr>
							{#each $csvData.headers as h}
								<td>{row[h] ?? ''}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<small>
			Showing {(currentPage - 1) * pageSize + 1}
			-
			{Math.min(currentPage * pageSize, $csvData.rows.length)}
			of {$csvData.rows.length} rows.
		</small>
	{/if}

	{#if !$csvData}
		<p style="margin-top:1rem;">No CSV loaded yet. Choose a file above.</p>
	{/if}
</div>

<style>
	.uploader-container {
		border: 1px solid #ccc;
		padding: 1rem;
		border-radius: 8px;
		background: #fafafa;
		margin-bottom: 1rem;
	}
	.table-wrapper {
		overflow: auto;
		max-height: 50vh;
		border: 1px solid #ddd;
		margin-top: 0.5rem;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.85rem;
	}
	th,
	td {
		border: 1px solid #e1e1e1;
		padding: 4px 6px;
		text-align: left;
	}
	th {
		background: #f3f3f3;
		position: sticky;
		top: 0;
		z-index: 1;
	}
	.pagination {
		margin: 0.75rem 0;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}
	small.meta {
		color: #666;
	}
	.error {
		color: #b00020;
		margin-top: 0.5rem;
		font-weight: bold;
	}
	button {
		cursor: pointer;
	}
</style>
