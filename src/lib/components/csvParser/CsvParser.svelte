<script lang="ts">
	import { parseCSVFile } from '$lib/utils/csv/csv';
	import { csvData, clearCSV } from '$lib/stores/csvData';

	import delete_icon from '$lib/common/delete_icon.svg';
	// Local rune-based state
	let isParsing = $state(false);
	let parseError: string | null = $state(null);
	let showAdvanced = $state(false);
	let editMode = $state(false);
	let newColName = $state('');

	let pageSize = $state(25);
	let currentPage = $state(1);

	// Selection/editing state
	let selectedCell = $state<{ rowLocal: number; header: string } | null>(null);
	let editingCell = $state<{ rowLocal: number; header: string } | null>(null);

	// Context menu for headers
	let headerMenu = $state<{ header: string; x: number; y: number } | null>(null);

	// Row selection (track absolute row indices)
	let selectedRows = $state(new Set<number>());

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

	// Derived helpers
	const selectedCount = $derived(() => selectedRows.size);
	const pageIndices = () => {
		const start = startIndex();
		const len = paginatedRows().length;
		return Array.from({ length: len }, (_, i) => start + i);
	};
	const pageAllSelected = $derived(() => {
		const ids = pageIndices();
		if (ids.length === 0) return false;
		return ids.every((idx) => selectedRows.has(idx));
	});
	const pageAnySelected = $derived(() => pageIndices().some((idx) => selectedRows.has(idx)));

	// Effect: whenever csvData changes, reset current page to 1
	$effect(() => {
		if ($csvData) {
			currentPage = 1;
		}
	});

	// Keep numeric math robust if <select> binds as string
	const startIndex = $derived(() => (Number(currentPage) - 1) * Number(pageSize));

	// Helper to go to page (ensures in-range)
	function goToPage(p: number) {
		if (p < 1) p = 1;
		if (p > totalPages()) p = totalPages();
		currentPage = p;
	}

	// Use primitive number type and call startIndex()
	function updateCell(localRowIndex: number, header: string, value: string) {
		const globalIndex = startIndex() + localRowIndex;
		csvData.update((d) => {
			if (!d) return d;
			const rows = d.rows.slice();
			const next = { ...rows[globalIndex], [header]: value === '' ? null : value };
			rows[globalIndex] = next;
			return { ...d, rows };
		});
	}

	function addEmptyRow() {
		csvData.update((d) => {
			if (!d) return d;
			const empty = Object.fromEntries(d.headers.map((h) => [h, null] as const));
			return { ...d, rows: [...d.rows, empty] };
		});
	}

	function addColumn(name: string) {
		const n = name.trim();
		if (!n) return;
		csvData.update((d) => {
			if (!d || d.headers.includes(n)) return d;
			const headers = [...d.headers, n];
			const rows = d.rows.map((r) => ({ ...r, [n]: null }));
			return { ...d, headers, rows };
		});
		newColName = '';
	}

	function deleteColumn(name: string) {
		csvData.update((d) => {
			if (!d) return d;
			const headers = d.headers.filter((h) => h !== name);
			const rows = d.rows.map(({ [name]: _drop, ...rest }) => rest);
			return { ...d, headers, rows };
		});
	}

	function renameColumn(oldName: string) {
		const next = (prompt('New column name', oldName) || '').trim();
		if (!next || next === oldName) return;
		csvData.update((d) => {
			if (!d || d.headers.includes(next)) return d;
			const headers = d.headers.map((h) => (h === oldName ? next : h));
			const rows = d.rows.map((r) => {
				const { [oldName]: val, ...rest } = r;
				return { ...rest, [next]: val ?? null };
			});
			return { ...d, headers, rows };
		});
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

	function handleCellClick(rowLocal: number, header: string) {
		selectedCell = { rowLocal, header };
		headerMenu = null;
	}

	function inputId(rowLocal: number, header: string) {
		return `cell-input-${rowLocal}-${header}`;
	}

	// Focus the input when entering edit mode
	$effect(() => {
		if (editingCell) {
			const id = inputId(editingCell.rowLocal, editingCell.header);
			queueMicrotask(() => {
				const el = document.getElementById(id) as HTMLInputElement | null;
				el?.focus();
				el?.select();
			});
		}
	});

	// Global key handling: Enter starts editing; Escape clears selection/edit
	function onKey(e: KeyboardEvent) {
		if (!selectedCell) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			editingCell = selectedCell;
		} else if (e.key === 'Escape') {
			editingCell = null;
			selectedCell = null;
		}
	}

	function handleHeaderClick(h: string, evt: MouseEvent) {
		evt.stopPropagation();
		const gap = 8; // small offset from the cursor
		const menuW = 180; // approximate menu width (px)
		const menuH = 90; // approximate menu height (px)
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		let x = evt.clientX + gap;
		let y = evt.clientY + gap;

		// keep menu fully on-screen
		if (x + menuW > vw) x = vw - menuW - gap;
		if (y + menuH > vh) y = vh - menuH - gap;

		headerMenu = { header: h, x, y };
		selectedCell = null;
		editingCell = null;
	}

	// Toggle a single row checkbox (local index -> absolute index)
	function toggleRowChecked(localRowIndex: number, checked: boolean) {
		if (!editMode) return;
		const abs = startIndex() + localRowIndex;
		const next = new Set(selectedRows);
		if (checked) next.add(abs);
		else next.delete(abs);
		selectedRows = next;
	}

	// Select/Deselect all rows on current page
	function toggleSelectAllPage(checked: boolean) {
		if (!editMode) return;
		const ids = pageIndices();
		const next = new Set(selectedRows);
		if (checked) ids.forEach((i) => next.add(i));
		else ids.forEach((i) => next.delete(i));
		selectedRows = next;
	}

	function clearSelection() {
		selectedRows = new Set();
	}

	function deleteSelectedRows() {
		if (selectedRows.size === 0) return;
		csvData.update((d) => {
			if (!d) return d;
			const keep = d.rows.filter((_, idx) => !selectedRows.has(idx));
			return { ...d, rows: keep };
		});
		clearSelection();
	}

	// Manage "indeterminate" state for the header checkbox
	let selectAllRef = $state<HTMLInputElement | null>(null);
	$effect(() => {
		if (!selectAllRef) return;
		const all = pageAllSelected();
		const any = pageAnySelected();
		(selectAllRef as HTMLInputElement).indeterminate = any && !all;
		(selectAllRef as HTMLInputElement).checked = all;
	});

	const selectAllChecked = $derived(() => pageAllSelected());
	const selectAllIndeterminate = $derived(() => {
		const all = pageAllSelected();
		const any = pageAnySelected();
		return any && !all;
	});

	// action to control the indeterminate property
	function indeterminate(node: HTMLInputElement, value: boolean) {
		node.indeterminate = value;
		return {
			update(v: boolean) {
				node.indeterminate = v;
			}
		};
	}
</script>

<svelte:window on:keydown={onKey} on:click={() => (headerMenu = null)} />

<div class="uploader-container">
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
		<!-- Manipulation toolbar -->
		<div class="manip-toolbar">
			<label class="chk"><input type="checkbox" bind:checked={editMode} /> Edit mode</label>
			<button class="secondary" onclick={addEmptyRow}>Add row</button>
			<input placeholder="New column name" bind:value={newColName} />
			<button class="secondary" onclick={() => addColumn(newColName)} disabled={!newColName.trim()}
				>Add column</button
			>
		</div>

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
			<button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages()}
				>Next</button
			>
			<button onclick={() => goToPage(totalPages())} disabled={currentPage === totalPages()}
				>Last</button
			>

			<button onclick={clearCSV} style="margin-left:auto;">Clear Loaded CSV</button>
		</div>

		<!-- Bulk toolbar (only in edit mode) -->
		{#if editMode && selectedCount() > 0}
			<div class="bulk-toolbar">
				<span
					><strong>{selectedCount()}</strong>
					{selectedCount() === 1 ? 'row' : 'rows'} selected</span
				>
				<button class="danger" onclick={deleteSelectedRows} title="Delete selected rows">
					<img src={delete_icon} alt="delete" style="width:16px;height:16px;margin-right:.35rem;" />
					Delete
				</button>
				<button class="link" onclick={clearSelection}>Clear selection</button>
			</div>
		{/if}

		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						{#if editMode}
							<th class="select-col">
								<input
									type="checkbox"
									bind:this={selectAllRef}
									checked={selectAllChecked()}
									use:indeterminate={selectAllIndeterminate()}
									onchange={(e) => toggleSelectAllPage((e.target as HTMLInputElement).checked)}
									aria-label="Select all rows on this page"
								/>
							</th>
						{/if}

						{#each $csvData.headers as h}
							<th class="header-cell" onclick={(e) => handleHeaderClick(h, e)}>{h}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each paginatedRows() as row, i}
						<tr>
							{#if editMode}
								<td class="select-col">
									<input
										type="checkbox"
										checked={selectedRows.has(startIndex() + i)}
										onchange={(e) => toggleRowChecked(i, (e.target as HTMLInputElement).checked)}
										aria-label={`Select row ${startIndex() + i + 1}`}
									/>
								</td>
							{/if}

							{#each $csvData.headers as h}
								<td
									class:selected={selectedCell &&
										selectedCell.rowLocal === i &&
										selectedCell.header === h}
									onclick={() => handleCellClick(i, h)}
								>
									{#if editingCell && editingCell.rowLocal === i && editingCell.header === h}
										<input
											id={inputId(i, h)}
											value={row[h] ?? ''}
											onkeydown={(e) => {
												const val = (e.target as HTMLInputElement).value;
												if (e.key === 'Enter') {
													updateCell(i, h, val);
													editingCell = null;
													selectedCell = null;
												} else if (e.key === 'Escape') {
													editingCell = null;
												}
											}}
											onblur={(e) => {
												updateCell(i, h, (e.target as HTMLInputElement).value);
												editingCell = null;
												selectedCell = null;
											}}
										/>
									{:else}
										{row[h] ?? ''}
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Header popover menu -->
		{#if headerMenu}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="header-menu"
				style={`left:${headerMenu.x}px; top:${headerMenu.y}px;`}
				onclick={(e) => e.stopPropagation()}
			>
				<button
					type="button"
					onclick={() => {
						if (headerMenu) {
							renameColumn(headerMenu.header);
						}
						headerMenu = null;
					}}
				>
					Edit text
				</button>
				<button
					type="button"
					class="danger"
					onclick={() => {
						if (headerMenu) {
							deleteColumn(headerMenu.header);
						}
						headerMenu = null;
					}}
				>
					Delete
				</button>
			</div>
		{/if}
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
		height: fit-content;
	}
	.table-wrapper {
		overflow: auto;
		max-height: 100vh;
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
		padding: 4px 4px;
		text-align: left;
		width: fit-content;
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
		width: fit-content;
	}
	.manip-toolbar {
		margin: 0.5rem 0;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.manip-toolbar .chk {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
	}

	td.selected {
		outline: 2px solid #4a90e2;
		outline-offset: -2px;
	}

	td input {
		box-sizing: border-box;
		padding: 3px 4px;
		border: 1px solid #4a90e2;
		border-radius: 3px;
	}

	.header-cell {
		cursor: pointer;
		user-select: none;
	}

	.header-menu {
		position: fixed; /* use viewport coordinates from clientX/Y */
		min-width: 180px;
		background: #fff;
		border: 1px solid #ddd;
		border-radius: 6px;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
		padding: 6px;
		display: grid;
		gap: 4px;
		z-index: 9999;
	}
	.header-menu button {
		padding: 4px 8px;
		text-align: left;
	}
	.header-menu .danger {
		color: #a11;
	}

	.select-col {
		width: 36px;
		text-align: center;
	}

	.bulk-toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.6rem;
		margin: 0.5rem 0;
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		background: #fbfbfb;
	}

	.bulk-toolbar .danger {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: #a11;
	}

	.bulk-toolbar .link {
		background: transparent;
		border: none;
		color: #555;
		text-decoration: underline;
		padding: 0;
	}
</style>
