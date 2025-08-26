<script lang="ts">
	import { parseCSVFile } from '$lib/utils/csv/csv';
	import { csvData, clearCSV } from '$lib/stores/csvData';
	import { downloadCSVFromParsed, downloadOriginalCSV } from '$lib/utils/csv/export';

	let isParsing = $state(false);
	let parseError: string | null = $state(null);
	let showAdvanced = $state(false);

	let pageSize = $state(25);
	let currentPage = $state(1);

	// Export options (used by the toolbar)
	let dlDelimiter = $state(',');
	let dlLineEndings = $state<'auto' | '\n' | '\r\n'>('\r\n');
	let dlIncludeBOM = $state(true);

	const totalPages = $derived(() => {
		if (!$csvData) return 0;
		return Math.max(1, Math.ceil($csvData.rows.length / pageSize));
	});

	const paginatedRows = $derived(() => {
		if (!$csvData) return [];
		const start = (currentPage - 1) * pageSize;
		return $csvData.rows.slice(start, start + pageSize);
	});

	$effect(() => {
		if ($csvData) currentPage = 1;
	});

	function goToPage(p: number) {
		if (p < 1) p = 1;
		if (p > totalPages()) p = totalPages();
		currentPage = p;
	}

	// Simple US-date parser; adjust to your locale if needed
	function parseMaybeUsDate(s: string): Date | string {
		// new Date('8/24/2020') generally works in browsers; guard invalids
		const d = new Date(s);
		return Number.isNaN(d.getTime()) ? s : d;
	}

	async function handleFileSelection(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;
		const file = input.files[0];

		parseError = null;
		isParsing = true;

		try {
			const parsed = await parseCSVFile(file, {
				useHeader: true,
				typing: 'custom',
				columnParsers: {
					Index: (s) => (s.trim() === '' ? null : Number(s)),
					'Subscription Date': (s) => (s.trim() === '' ? null : parseMaybeUsDate(s))
				}
			});
			csvData.set(parsed);
		} catch (err: any) {
			parseError = err?.message || 'Unknown parse error';
		} finally {
			isParsing = false;
			input.value = '';
		}
	}

	function downloadCurrentCSV() {
		if (!$csvData) return;
		downloadCSVFromParsed($csvData, {
			delimiter: dlDelimiter,
			lineEndings: dlLineEndings,
			includeBOM: dlIncludeBOM
		});
	}

	function downloadOriginal() {
		if (!$csvData) return;
		downloadOriginalCSV($csvData, { includeBOM: dlIncludeBOM });
	}
</script>

<div class="uploader-container">
	<h2>CSV Uploader</h2>

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

		<!-- Export toolbar -->
		<div class="export-toolbar">
			<div class="export-actions">
				<button
					class="primary"
					onclick={downloadCurrentCSV}
					aria-label="Download cleaned CSV"
					disabled={!$csvData}
				>
					Download CSV
				</button>
				<button
					class="secondary"
					onclick={downloadOriginal}
					aria-label="Download original CSV"
					disabled={!$csvData}
				>
					Download Original
				</button>
			</div>

			<!-- Toggle to reuse your existing advanced panel or keep options inline -->
			<div class="export-options">
				<label>
					Delimiter:
					<select bind:value={dlDelimiter}>
						<option value=",">, (comma)</option>
						<option value=";">; (semicolon)</option>
						<option value="\t">Tab</option>
						<option value="|">| (pipe)</option>
					</select>
				</label>

				<label>
					Line endings:
					<select bind:value={dlLineEndings}>
						<option value="auto">Auto</option>
						<option value="\n">LF (\n)</option>
						<option value="\r\n">CRLF (\r\n)</option>
					</select>
				</label>

				<label class="checkbox">
					<input type="checkbox" bind:checked={dlIncludeBOM} />
					Include BOM (UTF‑8)
				</label>
			</div>
		</div>

		<div class="pagination">
			<label>
				Rows per page:
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
			<button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages()}
				>Next</button
			>
			<button onclick={() => goToPage(totalPages())} disabled={currentPage === totalPages()}
				>Last</button
			>

			<button onclick={clearCSV} style="margin-left:auto;">Clear Loaded CSV</button>
		</div>

		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						{#each $csvData.headers as h}
							<th>
								{h}
								<br />
								<small class="meta">{$csvData.columnTypes?.[h] ?? 'string'}</small>
							</th>
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
	.export-toolbar {
		margin: 0.75rem 0;
		padding: 0.5rem;
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		background: #fbfbfb;
		display: grid;
		gap: 0.5rem;
	}
	.export-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.export-options {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
	}
	.export-options label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.export-options .checkbox {
		gap: 0.4rem;
	}
</style>
