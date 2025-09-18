<script lang="ts">
	import { parseCSVFile } from '$lib/utils/csv/csv';
	import { csvData, clearCSV } from '$lib/stores/csvData';
	import { downloadCSVFromParsed } from '$lib/utils/csv/export';

	import delete_icon from '$lib/common/delete_icon.svg';
	import CleanPanel from '$lib/components/CleanPanel/CleanPanel.svelte';
	import CleanMenu from '$lib/components/CleanPanel/CleanMenu.svelte';
	// Local rune-based state
	let isParsing = $state(false);
	let parseError: string | null = $state(null);

	let editMode = $state(false);
	let newColName = $state('');
	let search = $state(''); // search query for filtering
	let showClean = $state(false);
	let showCleanMenu = $state(false);
	let cleanMode = $state<'duplicates' | 'empty' | 'date' | null>(null);

	let pageSize = $state(25);
	let currentPage = $state(1);

	// Selection/editing state
	let selectedCell = $state<{ rowLocal: number; header: string } | null>(null);
	let editingCell = $state<{ rowLocal: number; header: string } | null>(null);

	// Context menu for headers
	let headerMenu = $state<{ header: string; x: number; y: number } | null>(null);
	let headerMenuEl = $state<HTMLDivElement | null>(null);

	// Row selection (track absolute row indices)
	let selectedRows = $state(new Set<number>());

	// Rows highlighted by cleaning tools
	let highlightedRows = $state(new Set<number>());
	// Individual cells highlighted by cleaning tools (rowIndex::header)
	let highlightedCells = $state(new Set<string>());
	function cellKey(absRow: number, header: string) {
		return `${absRow}::${header}`;
	}

	// Derived: indices of rows that match search (map to original row indices)
	const filteredIndex = $derived(() => {
		if (!$csvData) return [] as number[];
		const q = search.trim().toLowerCase();
		if (!q) return $csvData.rows.map((_, i) => i);
		const { headers, rows } = $csvData;
		const idx: number[] = [];
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			let hit = false;
			for (const h of headers) {
				const v = row[h];
				if (v != null && String(v).toLowerCase().includes(q)) {
					hit = true;
					break;
				}
			}
			if (hit) idx.push(i);
		}
		return idx;
	});

	// Derived: total pages depends on filtered results
	const totalPages = $derived(() => {
		if (!$csvData) return 0;
		const len = filteredIndex().length;
		return Math.max(1, Math.ceil(len / pageSize));
	});

	// Derived: paginated rows from filtered indices
	const paginatedRows = $derived(() => {
		if (!$csvData) return [];
		const start = (currentPage - 1) * pageSize;
		const end = start + pageSize;
		const slice = filteredIndex().slice(start, end);
		return slice.map((orig) => $csvData.rows[orig]);
	});

	// Derived helpers
	const selectedCount = $derived(() => selectedRows.size);
	// Absolute row indices (in original dataset) for current page, honoring filter
	const pageIndices = () => {
		const start = startIndex();
		const end = start + paginatedRows().length;
		return filteredIndex().slice(start, end);
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
	// Effect: reset to first page when search changes
	$effect(() => {
		search;
		currentPage = 1;
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
		// Close header menu with Escape
		if (e.key === 'Escape' && headerMenu) {
			headerMenu = null;
			return;
		}
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

	function exportCSV() {
		if ($csvData) downloadCSVFromParsed($csvData);
	}
	function clean() {
		// placeholder for future "clean" action
	}

	// Toggle a single row checkbox (local index -> absolute index)
	function toggleRowChecked(localRowIndex: number, checked: boolean) {
		if (!editMode) return;
		const abs = filteredIndex()[startIndex() + localRowIndex];
		const next = new Set(selectedRows);
		if (checked) next.add(abs);
		else next.delete(abs);
		selectedRows = next;
	}

	// Select/Deselect all rows on current page
	function toggleSelectAllPage(checked: boolean) {
		if (!editMode) return;
		const ids = pageIndices(); // already absolute indices
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

	// Focus first menu item when the header menu opens
	$effect(() => {
		if (headerMenu) {
			queueMicrotask(() => {
				const firstBtn = headerMenuEl?.querySelector('button') as HTMLButtonElement | null;
				firstBtn?.focus();
			});
		}
	});

	function swallowClick(e: MouseEvent) {
		e.stopPropagation();
	}

	// Inline header rename state
	let editingHeader = $state<string | null>(null);
	let headerEditValue = $state('');
	function headerInputId(name: string) {
		return `header-input-${encodeURIComponent(name)}`;
	}

	function beginHeaderEdit(h: string) {
		editingHeader = h;
		headerEditValue = h;
		headerMenu = null;
	}

	// Commit/cancel rename logic
	function commitHeaderRename(oldName: string, nextRaw: string) {
		const next = (nextRaw || '').trim();
		if (!next || next === oldName) {
			editingHeader = null;
			return;
		}
		// Prevent duplicates
		if ($csvData && $csvData.headers.includes(next)) {
			// keep editing so the user can correct
			return;
		}
		csvData.update((d) => {
			if (!d) return d;
			const headers = d.headers.map((h) => (h === oldName ? next : h));
			const rows = d.rows.map((r) => {
				const { [oldName]: val, ...rest } = r;
				return { ...rest, [next]: val ?? null };
			});
			return { ...d, headers, rows };
		});
		editingHeader = null;
	}

	// Focus the header input when entering edit mode
	$effect(() => {
		if (editingHeader) {
			const id = headerInputId(editingHeader);
			queueMicrotask(() => {
				const el = document.getElementById(id) as HTMLInputElement | null;
				el?.focus();
				el?.select();
			});
		}
	});

	function onHeaderCellClick(h: string, evt: MouseEvent) {
		// Don’t open menu while renaming, or when clicking on inputs/buttons inside the cell
		if (editingHeader === h) return;
		const target = evt.target as HTMLElement | null;
		if (target?.closest('input,button')) return;
		handleHeaderClick(h, evt); // uses evt.clientX/Y and stopPropagation internally
	}
</script>

<svelte:window onkeydown={onKey} onclick={() => (headerMenu = null)} />

<div class="uploader-container">
	<!-- Utility header -->
	<div class="util-bar">
		<input
			class="search"
			type="text"
			placeholder="Search rows…"
			bind:value={search}
			aria-label="Search rows"
		/>

		<div class="util-actions">
			<button
				class="secondary toggle-btn"
				onclick={() => (editMode = !editMode)}
				aria-pressed={editMode}
				title="Toggle edit mode"
			>
				<span class="material-symbols-outlined">{editMode ? 'edit_square' : 'edit'}</span>
				{editMode ? 'Editing' : 'Edit mode'}
			</button>

			<button class="secondary" onclick={exportCSV} title="Export CSV">
				<span class="material-symbols-outlined">file_download</span>
				Export
			</button>
			<button onclick={() => (showCleanMenu = true)} title="Data cleaning">
				<span class="material-symbols-outlined">cleaning_services</span>
				Clean
			</button>
		</div>
	</div>

	<!-- Message when search has no matches -->
	{#if $csvData && search.trim() && filteredIndex().length === 0}
		<div class="no-results">
			<span class="material-symbols-outlined">search_off</span>
			No results for “{search}”
		</div>
	{/if}

	{#if isParsing}
		<p>Parsing file... Please wait.</p>
	{/if}
	{#if parseError}
		<p class="error">Error: {parseError}</p>
	{/if}

	{#if $csvData}
		{#if editMode}
			<!-- Manipulation toolbar -->
			<div class="manip-toolbar">
				<button class="primary add-row-btn" onclick={addEmptyRow}>
					<span class="material-symbols-outlined">add</span>
					Add row
				</button>
				<div class="add-col-group">
					<input
						class="add-col-input"
						placeholder="New column name…"
						bind:value={newColName}
						autocomplete="off"
						aria-label="New column name"
					/>
					<button
						class="secondary add-col-btn"
						onclick={() => addColumn(newColName)}
						disabled={!newColName.trim()}
					>
						<span class="material-symbols-outlined">view_column</span>
						Add column
					</button>
				</div>
			</div>
		{/if}
		<div class="file-info">
			<strong>Loaded File:</strong>
			{$csvData.filename}<br />
			<small class="meta">
				Rows: {$csvData.rows.length} | Columns: {$csvData.headers.length}
			</small>
		</div>

		<div class="pagination">
			<div class="rows-group">
				<label class="rows-label" for="rows-per-page"> Rows per page: </label>
				<select
					id="rows-per-page"
					class="rows-select"
					bind:value={pageSize}
					onchange={() => (currentPage = 1)}
				>
					<option value={10}>10</option>
					<option value={25}>25</option>
					<option value={50}>50</option>
					<option value={100}>100</option>
				</select>
			</div>

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

						<!-- header row -->
						{#each $csvData.headers as h}
							<th
								class="header-cell"
								class:editing={editingHeader === h}
								onclick={(e) => onHeaderCellClick(h, e)}
							>
								{#if editingHeader === h}
									<input
										id={headerInputId(h)}
										class="header-input"
										bind:value={headerEditValue}
										onkeydown={(e) => {
											if (e.key === 'Enter') commitHeaderRename(h, headerEditValue);
											else if (e.key === 'Escape') editingHeader = null;
										}}
										onblur={() => commitHeaderRename(h, headerEditValue)}
										aria-label="Rename column"
									/>
								{:else}
									{h}
								{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each paginatedRows() as row, i}
						<tr class:highlight={highlightedRows.has(filteredIndex()[startIndex() + i])}>
							{#if editMode}
								<td class="select-col">
									<input
										type="checkbox"
										checked={selectedRows.has(filteredIndex()[startIndex() + i])}
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
									class:cell-highlight={highlightedCells.has(
										cellKey(filteredIndex()[startIndex() + i], h)
									)}
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
	{/if}

	{#if !$csvData}
		<p style="margin-top:1rem;">No CSV loaded yet. Choose a file above.</p>
	{/if}

	{#if headerMenu}
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="header-menu"
			bind:this={headerMenuEl}
			style={`left:${headerMenu.x}px; top:${headerMenu.y}px;`}
			onclick={swallowClick}
			role="menu"
			aria-label={`Column ${headerMenu.header} actions`}
		>
			<button
				type="button"
				class="menu-item"
				onclick={() => {
					beginHeaderEdit(headerMenu!.header);
				}}
				role="menuitem"
			>
				<span class="material-symbols-outlined">edit</span>
				Edit text
			</button>
			<button
				type="button"
				class="menu-item danger"
				onclick={() => {
					deleteColumn(headerMenu!.header);
					headerMenu = null;
				}}
				role="menuitem"
			>
				<span class="material-symbols-outlined">delete</span>
				Delete column
			</button>
		</div>
	{/if}

	{#if showCleanMenu}
		<CleanMenu
			onClose={() => (showCleanMenu = false)}
			onSelect={(m) => {
				cleanMode = m;
				showCleanMenu = false;
				showClean = true;
			}}
		/>
	{/if}

	{#if showClean && cleanMode}
		<CleanPanel
			mode={cleanMode}
			onHighlightRows={(ids: number[]) => {
				highlightedRows = new Set(ids);
				editMode = true;
			}}
			onHighlightEmptyCells={(cells) => {
				highlightedCells = new Set(cells.map((c) => cellKey(c.row, c.col)));
				editMode = true;
			}}
			onBack={() => {
				showClean = false;
				showCleanMenu = true;
			}}
			onClose={() => {
				showClean = false;
				cleanMode = null;
			}}
		/>
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
	.util-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.util-bar .search {
		flex: 1 1 280px;
		min-width: 220px;
		padding: 6px 10px;
		border: 1px solid #ddd;
		border-radius: 6px;
	}

	.toggle-btn[aria-pressed='true'] {
		/* subtle “active” look for edit mode */
		box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
	}
	.material-symbols-outlined {
		font-variation-settings:
			'FILL' 0,
			'wght' 500,
			'GRAD' 0,
			'opsz' 24;
		font-size: 20px;
		line-height: 1;
		margin-right: 0.35rem;
		vertical-align: -3px;
	}

	.no-results {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin: 0.25rem 0 0.5rem;
		padding: 0.35rem 0.5rem;
		border: 1px solid #e5e5e5;
		border-radius: 6px;
		background: #fffdf5;
		color: #555;
	}
	.no-results .material-symbols-outlined {
		margin-right: 0.25rem;
		color: #b26a00;
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
		gap: 0.75rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.rows-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.75rem;
		background: #f6f6f6;
		border-radius: 8px;
		border: 1px solid #e1e1e1;
	}

	.rows-label {
		font-weight: 500;
		color: #333;
		font-size: 1rem;
		margin-right: 0.1rem;
	}

	.rows-select {
		padding: 0.45rem 1.1rem 0.45rem 0.7rem;
		border: 1px solid #ddd;
		border-radius: 6px;
		background: #fff;
		font-size: 1rem;
		color: #222;
		transition: border-color 0.15s;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
		cursor: pointer;
	}
	.rows-select:focus {
		border-color: #4a90e2;
		outline: none;
	}
	.rows-select option {
		background: #fff;
		color: #222;
		font-size: 1rem;
		padding: 0.4rem 1rem;
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
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		align-items: center;
		margin: 0.5rem 0 1rem 0;
	}
	.add-row-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 1rem;
		padding: 0.5rem 1.1rem;
		border-radius: 8px;
	}
	.add-col-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.add-col-input {
		padding: 0.5rem 0.9rem;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-size: 1rem;
		min-width: 180px;
		transition: border-color 0.15s;
	}
	.add-col-input:focus {
		border-color: #4a90e2;
		outline: none;
	}
	.add-col-btn {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 1rem;
		padding: 0.5rem 1.1rem;
		border-radius: 8px;
	}
	.add-col-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.header-cell {
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
	}
	.header-cell.editing {
		cursor: text;
	}
	.header-input {
		width: 100%;
		box-sizing: border-box;
		padding: 4px 6px;
		border: 1px solid #4a90e2;
		border-radius: 4px;
		font: inherit;
		color: inherit;
		background: #fff;
	}

	.header-menu {
		position: fixed; /* anchored to viewport coordinates from clientX/Y */
		min-width: 200px;
		max-width: 260px;
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.15);
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		z-index: 9999;
	}
	.header-menu .menu-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border: none;
		background: transparent;
		text-align: left;
		width: 100%;
		border-radius: 6px;
		font-size: 0.95rem;
		color: #222;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}
	.header-menu .menu-item:hover,
	.header-menu .menu-item:focus {
		background: #f6f6f6;
		outline: none;
	}
	.header-menu .menu-item.danger {
		color: #a11;
	}
	.header-menu .menu-item.danger:hover,
	.header-menu .menu-item.danger:focus {
		background: #fff3f3;
	}
	.header-menu .material-symbols-outlined {
		font-variation-settings:
			'FILL' 0,
			'wght' 500,
			'GRAD' 0,
			'opsz' 24;
		font-size: 20px;
		line-height: 1;
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

	.file-info {
		padding-top: 0.5rem;
	}

	tr.highlight td {
		background: #fff7cc; /* soft yellow */
	}
	td.cell-highlight {
		background: #ffeaea; /* soft red tint for empty cells */
	}
</style>
