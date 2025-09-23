<script lang="ts">
	// Stores
	import {
		currentProject,
		projectFiles,
		activeFileId,
		type ProjectFileMeta
	} from '$lib/stores/project';
	import { filesState, setFileState } from '$lib/stores/csvMulti';

	// Types
	import type { ParsedCSV, CellValue } from '$lib/stores/csvData';
	import {
		applyTransforms,
		summarizeTransforms,
		type Transform,
		type FilterOp
	} from '$lib/utils/datalab/transform';
	import type { RowAggOp } from '$lib/utils/datalab/transform';

	// Working pipeline
	let transforms = $state<Transform[]>([]);
	let preview: ParsedCSV | null = $state(null);

	// Builders
	let filterColumn = $state<string | null>(null);
	let filterOp = $state<FilterOp>('eq');
	let filterValue = $state(''); // supports comma list for 'in'
	let filterCase = $state(false);

	// Row aggregate (generic)
	let rowAggCols = $state<string[]>([]);
	let rowAggOut = $state('agg');
	let rowAggOp = $state<RowAggOp>('avg');

	let appendFileId = $state<string | null>(null);
	let loadingOther = $state(false);

	// Edit mode state
	let editMode = $state(false);
	let selectedCell = $state<{ rowLocal: number; header: string } | null>(null);
	let editingCell = $state<{ rowLocal: number; header: string } | null>(null);

	// Collapsible sections
	type SectionKey = 'filter' | 'colAgg' | 'rowAgg' | 'append';
	let collapsed = $state<Record<SectionKey, boolean>>({
		filter: false,
		colAgg: false,
		rowAgg: false,
		append: false
	});
	function toggle(section: SectionKey) {
		collapsed = { ...collapsed, [section]: !collapsed[section] };
	}

	// Header context menu and rename state
	let headerMenu = $state<{ header: string; x: number; y: number } | null>(null);
	let headerMenuEl = $state<HTMLDivElement | null>(null);
	let editingHeader = $state<string | null>(null);
	let headerEditValue = $state('');

	// Row selection for bulk deletion (absolute indices over current dataset; no pagination, so equals local)
	let selectedRows = $state(new Set<number>());

	// Derived helpers (plain expressions)
	const baseData = $derived<ParsedCSV | null>(
		$activeFileId ? ($filesState[$activeFileId] ?? null) : null
	);
	const headers = $derived<string[]>(baseData ? baseData.headers : []);
	const files = $derived<ProjectFileMeta[]>($projectFiles);
	const appendCandidates = $derived<ProjectFileMeta[]>(
		files.filter((f: ProjectFileMeta) => f.file_id !== $activeFileId)
	);

	// What to show in the table (base vs preview)
	const tableData = $derived<ParsedCSV | null>(editMode ? baseData : (preview ?? baseData));

	// Pagination
	let pageSize = $state(100); // user can change (50/100/200/300)
	let currentPage = $state(1);
	const totalPages = $derived<number>(
		tableData ? Math.max(1, Math.ceil(tableData.rows.length / Number(pageSize))) : 1
	);
	const startIndex = $derived<number>((Number(currentPage) - 1) * Number(pageSize));
	type Row = Record<string, CellValue>;
	const paginatedRows = $derived.by<Row[]>(() =>
		tableData
			? tableData.rows.slice(
					startIndex,
					Math.min(startIndex + Number(pageSize), tableData.rows.length)
				)
			: []
	);
	// Absolute indices for current page
	const pageIndices = () => {
		if (!tableData) return [] as number[];
		const start = startIndex;
		const end = Math.min(startIndex + Number(pageSize), tableData.rows.length);
		const len = Math.max(0, end - start);
		return Array.from({ length: len }, (_, i) => start + i);
	};
	const selectedCount = $derived<number>(selectedRows.size);
	function goToPage(p: number) {
		if (p < 1) p = 1;
		if (p > totalPages) p = totalPages;
		currentPage = p;
	}
	// Reset/clamp when data or settings change
	$effect(() => {
		tableData;
		currentPage = 1;
	});
	$effect(() => {
		pageSize;
		currentPage = 1;
	});
	$effect(() => {
		if (currentPage > totalPages) currentPage = totalPages;
	});

	function addFilter() {
		if (!filterColumn) return;
		const t: Transform = {
			kind: 'filterRows',
			column: filterColumn,
			op: filterOp,
			value:
				filterOp === 'in'
					? filterValue
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean)
					: filterValue,
			caseSensitive: filterCase
		};
		transforms = [...transforms, t];
		filterValue = '';
	}

	function addRowAgg() {
		const cols = rowAggCols.filter(Boolean);
		if (cols.length === 0 || !rowAggOut.trim()) return;
		transforms = [
			...transforms,
			{ kind: 'rowAggregate', columns: cols, outColumn: rowAggOut.trim(), op: rowAggOp }
		];
	}

	// Append requires the other file to be already loaded into filesState
	async function addAppend() {
		if (!appendFileId) return;
		if (!$currentProject) return;
		const other = $filesState[appendFileId] as ParsedCSV | undefined;
		if (!other) {
			alert('Open the file tab once to load it, then try again.');
			return;
		}
		transforms = [...transforms, { kind: 'appendFile', other }];
	}

	function removeTransform(idx: number) {
		const copy = transforms.slice();
		copy.splice(idx, 1);
		transforms = copy;
	}

	function buildPreview() {
		if (!baseData) {
			preview = null;
			return;
		}
		preview = applyTransforms(baseData, transforms);
	}

	async function saveAsNewTab() {
		if (!$currentProject || !baseData) return;
		const result = applyTransforms(baseData, transforms);
		const name = summarizeTransforms(transforms) || 'Derived';
		const res = await fetch(`/api/projects/${$currentProject.project_id}/files`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({
				name: `${getDisplayName()} | ${name}`.slice(0, 120),
				originalFilename: result.filename,
				snapshot: result
			})
		});
		if (!res.ok) return;
		const created = await res.json();
		setFileState(created.file_id, result);
		await refreshFilesList();
		activeFileId.set(created.file_id);
	}

	function getDisplayName() {
		const cur = files.find((f) => f.file_id === $activeFileId);
		return cur ? cur.name : 'Dataset';
	}

	async function refreshFilesList() {
		if (!$currentProject) return;
		const r = await fetch(`/api/projects/${$currentProject.project_id}/files`, {
			credentials: 'same-origin'
		});
		if (!r.ok) return;
		const data = await r.json();
		projectFiles.set(data.files ?? []);
	}

	function toggleRowAvgCol(h: string) {
		rowAggCols = rowAggCols.includes(h) ? rowAggCols.filter((x) => x !== h) : [...rowAggCols, h];
	}

	// --- Column aggregate (one-value result over current dataset) ---
	let colAggColumn = $state<string | null>(null);
	let colAggOp = $state<RowAggOp>('avg');
	const colAggValue = $derived.by<number | null>(() => {
		const data = tableData;
		if (!data || !colAggColumn) return null;
		const vals = data.rows.map((r) => r[colAggColumn!]);
		const nums: number[] = [];
		let nn = 0;
		for (const v of vals) {
			if (v != null && v !== '') nn++;
			const n = typeof v === 'number' ? v : Number(v as any);
			if (Number.isFinite(n)) nums.push(n);
		}
		switch (colAggOp) {
			case 'avg':
				return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
			case 'sum':
				return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
			case 'min':
				return nums.length ? Math.min(...nums) : null;
			case 'max':
				return nums.length ? Math.max(...nums) : null;
			case 'median': {
				if (!nums.length) return null;
				const s = [...nums].sort((a, b) => a - b);
				const mid = Math.floor(s.length / 2);
				return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
			}
			case 'countNonNull':
				return nn;
		}
	});

	// Save column aggregate as a new one-column tab
	async function saveColAggAsTab() {
		if (!$currentProject || !baseData || !colAggColumn || colAggValue === null) return;
		const label = `${colAggOp}(${colAggColumn})`;
		const snapshot = {
			filename: `${baseData.filename} | ${label}`,
			headers: [label],
			rows: [{ [label]: colAggValue }]
		} as ParsedCSV;
		const res = await fetch(`/api/projects/${$currentProject.project_id}/files`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({
				name: `${getDisplayName()} | ${label}`.slice(0, 120),
				originalFilename: baseData.filename,
				snapshot
			})
		});
		if (!res.ok) return;
		const created = await res.json();
		setFileState(created.file_id, snapshot);
		await refreshFilesList();
		activeFileId.set(created.file_id);
	}

	// Cell edit helpers
	function handleCellClick(rowLocal: number, header: string) {
		if (!editMode) return;
		selectedCell = { rowLocal, header };
		editingCell = { rowLocal, header };
		headerMenu = null;
	}

	function inputId(rowLocal: number, header: string) {
		return `datalab-cell-input-${rowLocal}-${header}`;
	}

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

	function updateCell(localRowIndex: number, header: string, value: string) {
		if (!$activeFileId) return;
		const abs = startIndex + localRowIndex;
		filesState.update((m) => {
			const id = $activeFileId as string;
			const d = m[id];
			if (!d) return m;
			const rows = d.rows.slice();
			const next = { ...rows[abs], [header]: value === '' ? null : value };
			rows[abs] = next;
			return { ...m, [id]: { ...d, rows } };
		});
	}

	// Row selection and bulk delete
	function toggleRowChecked(localRowIndex: number, checked: boolean) {
		if (!editMode) return;
		const abs = startIndex + localRowIndex;
		const next = new Set(selectedRows);
		if (checked) next.add(abs);
		else next.delete(abs);
		selectedRows = next;
	}
	function clearSelection() {
		selectedRows = new Set();
	}
	function deleteSelectedRows() {
		if (!$activeFileId || selectedRows.size === 0) return;
		filesState.update((m) => {
			const id = $activeFileId as string;
			const d = m[id];
			if (!d) return m;
			const keep = d.rows.filter((_, idx) => !selectedRows.has(idx));
			return { ...m, [id]: { ...d, rows: keep } };
		});
		clearSelection();
	}

	// Select-all checkbox helpers (for displayed rows)
	let selectAllRef = $state<HTMLInputElement | null>(null);
	const selectAllChecked = $derived<boolean>(
		pageIndices().length > 0 && pageIndices().every((i) => selectedRows.has(i))
	);
	const selectAllIndeterminate = $derived<boolean>(
		pageIndices().some((i) => selectedRows.has(i)) && !selectAllChecked
	);
	function indeterminate(node: HTMLInputElement, value: boolean) {
		node.indeterminate = value;
		return {
			update(v: boolean) {
				node.indeterminate = v;
			}
		};
	}
	$effect(() => {
		if (!selectAllRef) return;
		(selectAllRef as HTMLInputElement).indeterminate = selectAllIndeterminate;
		(selectAllRef as HTMLInputElement).checked = selectAllChecked;
	});
	function toggleSelectAllDisplayed(checked: boolean) {
		if (!editMode) return;
		const next = new Set(selectedRows);
		const ids = pageIndices();
		if (checked) ids.forEach((i) => next.add(i));
		else ids.forEach((i) => next.delete(i));
		selectedRows = next;
	}

	// Header context menu and rename/delete
	function handleHeaderClick(h: string, evt: MouseEvent) {
		if (!editMode) return;
		evt.stopPropagation();
		const gap = 8,
			menuW = 200,
			menuH = 90,
			vw = window.innerWidth,
			vh = window.innerHeight;
		let x = evt.clientX + gap,
			y = evt.clientY + gap;
		if (x + menuW > vw) x = vw - menuW - gap;
		if (y + menuH > vh) y = vh - menuH - gap;
		headerMenu = { header: h, x, y };
		selectedCell = null;
		editingCell = null;
	}
	function swallowClick(e: MouseEvent) {
		e.stopPropagation();
	}
	function headerInputId(name: string) {
		return `datalab-header-input-${encodeURIComponent(name)}`;
	}
	function beginHeaderEdit(h: string) {
		editingHeader = h;
		headerEditValue = h;
		headerMenu = null;
	}
	function commitHeaderRename(oldName: string, nextRaw: string) {
		const next = (nextRaw || '').trim();
		if (!next || next === oldName) {
			editingHeader = null;
			return;
		}
		if (!$activeFileId) {
			editingHeader = null;
			return;
		}
		filesState.update((m) => {
			const id = $activeFileId as string;
			const d = m[id];
			if (!d || d.headers.includes(next)) return m;
			const headers = d.headers.map((h) => (h === oldName ? next : h));
			const rows = d.rows.map((r) => {
				const { [oldName]: val, ...rest } = r;
				return { ...rest, [next]: val ?? null };
			});
			return { ...m, [id]: { ...d, headers, rows } };
		});
		editingHeader = null;
	}
	function deleteColumn(name: string) {
		if (!$activeFileId) return;
		filesState.update((m) => {
			const id = $activeFileId as string;
			const d = m[id];
			if (!d) return m;
			const headers = d.headers.filter((h) => h !== name);
			const rows = d.rows.map(({ [name]: _drop, ...rest }) => rest);
			return { ...m, [id]: { ...d, headers, rows } };
		});
		headerMenu = null;
	}

	// Focus the header input when entering rename
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

	// Add row/column helpers (manip toolbar)
	let newColName = $state('');
	function addEmptyRow() {
		if (!$activeFileId) return;
		filesState.update((m) => {
			const id = $activeFileId as string;
			const d = m[id];
			if (!d) return m;
			const empty = Object.fromEntries(d.headers.map((h) => [h, null] as const));
			return { ...m, [id]: { ...d, rows: [...d.rows, empty] } };
		});
	}
	function addColumn(name: string) {
		const n = name.trim();
		if (!n || !$activeFileId) return;
		filesState.update((m) => {
			const id = $activeFileId as string;
			const d = m[id];
			if (!d || d.headers.includes(n)) return m;
			const headers = [...d.headers, n];
			const rows = d.rows.map((r) => ({ ...r, [n]: null }));
			return { ...m, [id]: { ...d, headers, rows } };
		});
		newColName = '';
	}

	// Focus first menu item when the header menu opens (same as CsvParser)
	$effect(() => {
		if (headerMenu) {
			queueMicrotask(() => {
				const firstBtn = headerMenuEl?.querySelector('button') as HTMLButtonElement | null;
				firstBtn?.focus();
			});
		}
	});

	// Global key handling: Enter starts editing current cell; Escape closes menu/edit
	function onKey(e: KeyboardEvent) {
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

	// Don’t open menu while renaming, or when clicking on inputs/buttons inside the cell
	function onHeaderCellClick(h: string, evt: MouseEvent) {
		if (editingHeader === h) return;
		const target = evt.target as HTMLElement | null;
		if (target?.closest('input,button')) return;
		handleHeaderClick(h, evt); // positions the floating menu
	}

	// Back to projects (same behavior as Csvparser)
	function backToProjects() {
		activeFileId.set(null);
	}
</script>

<svelte:window onkeydown={onKey} onclick={() => (headerMenu = null)} />

<!-- Top util bar (only when a project is selected) -->
{#if $currentProject}
	<div class="util-bar">
		<button class="secondary" onclick={backToProjects} title="Back to projects">
			<span class="material-symbols-outlined">arrow_back</span>
			Projects
		</button>
	</div>
{/if}

{#if !$currentProject}
	<p>Select a project to continue.</p>
{:else if !$activeFileId || !baseData}
	<p>Open a dataset first (select a file tab), then come back to Data Lab.</p>
{:else}
	<div class="lab">
		<div class="left">
			<h2>Data Lab</h2>
			<p class="hint">Compose filters and functions. Preview, then save as a new tab.</p>

			<!-- Manipulation toolbar (edit mode only) -->
			{#if editMode}
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

			<!-- Pipeline on top (styled like a tool, not collapsible) -->
			<section class="tool pipeline">
				<div class="tool-head static">
					<h3 class="tool-title">Pipeline</h3>
				</div>
				<div class="tool-body">
					{#if transforms.length > 0}
						<ul>
							{#each transforms as t, i}
								<li>
									<span class="chip">{summarizeTransforms([t])}</span>
									<button class="link" onclick={() => removeTransform(i)}>remove</button>
								</li>
							{/each}
						</ul>
						<div class="actions">
							<button onclick={buildPreview} title="Apply transforms for preview">Preview</button>
							<button class="primary" onclick={saveAsNewTab}>Save as new tab</button>
						</div>
					{:else}
						<p class="hint">No transforms yet. Add filters/functions below.</p>
					{/if}
				</div>
			</section>

			<!-- Filter rows (collapsible) -->
			<section class="tool" class:collapsed={collapsed.filter}>
				<button
					type="button"
					class="tool-head"
					onclick={() => toggle('filter')}
					aria-expanded={!collapsed.filter}
					aria-controls="tool-filter"
				>
					<h3 class="tool-title">Filter rows</h3>
					<span class="material-symbols-outlined chevron"
						>{collapsed.filter ? 'chevron_right' : 'expand_more'}</span
					>
				</button>
				{#if !collapsed.filter}
					<div id="tool-filter" class="tool-body">
						<div class="row">
							<label for="filter-rows">Column</label>
							<select id="filter-rows" bind:value={filterColumn}>
								<option value={null as any} disabled selected>Select column</option>
								{#each headers as h}<option value={h}>{h}</option>{/each}
							</select>
						</div>
						<div class="row">
							<label for="filter-operator">Operator</label>
							<select id="filter-operator" bind:value={filterOp}>
								<option value="eq">equals</option>
								<option value="neq">not equals</option>
								<option value="contains">contains</option>
								<option value="in">in list</option>
							</select>
						</div>
						<div class="row">
							<label for="filter-value"
								>{filterOp === 'in' ? 'Values (comma separated)' : 'Value'}</label
							>
							<input
								id="filter-value"
								bind:value={filterValue}
								placeholder={filterOp === 'in' ? 'a, b, c' : 'value'}
							/>
						</div>
						<label class="inline">
							<input
								type="checkbox"
								checked={filterCase}
								onchange={(e) => (filterCase = (e.target as HTMLInputElement).checked)}
							/>
							Case sensitive
						</label>
						<div class="actions">
							<button class="secondary" onclick={addFilter} disabled={!filterColumn}
								>Add filter</button
							>
						</div>
					</div>
				{/if}
			</section>

			<!-- Column aggregate (collapsible) -->
			<section class="tool" class:collapsed={collapsed.colAgg}>
				<button
					type="button"
					class="tool-head"
					onclick={() => toggle('colAgg')}
					aria-expanded={!collapsed.colAgg}
					aria-controls="tool-col-agg"
				>
					<h3 class="tool-title">Column aggregate</h3>
					<span class="material-symbols-outlined chevron"
						>{collapsed.colAgg ? 'chevron_right' : 'expand_more'}</span
					>
				</button>
				{#if !collapsed.colAgg}
					<div id="tool-col-agg" class="tool-body">
						<div class="row">
							<label for="col-agg-column">Column</label>
							<select id="col-agg-column" bind:value={colAggColumn}>
								<option value={null as any} disabled selected>Select column</option>
								{#each headers as h}<option value={h}>{h}</option>{/each}
							</select>
						</div>
						<div class="row">
							<label for="col-agg-op">Operation</label>
							<select bind:value={colAggOp}>
								<option value="avg">Average</option>
								<option value="sum">Sum</option>
								<option value="min">Min</option>
								<option value="max">Max</option>
								<option value="median">Median</option>
								<option value="countNonNull">Count (non‑null)</option>
							</select>
						</div>
						<div class="row">
							<label for="col-agg-result">Result</label>
							<strong>{colAggValue ?? '-'}</strong>
						</div>
						<div class="actions">
							<button
								class="primary"
								onclick={saveColAggAsTab}
								disabled={!colAggColumn || colAggValue === null}
							>
								Save as new tab
							</button>
						</div>
						<p class="hint">
							Computes over the current dataset (Preview if active, otherwise base).
						</p>
					</div>
				{/if}
			</section>

			<!-- Row aggregate (collapsible) -->
			<section class="tool" class:collapsed={collapsed.rowAgg}>
				<button
					type="button"
					class="tool-head"
					onclick={() => toggle('rowAgg')}
					aria-expanded={!collapsed.rowAgg}
					aria-controls="tool-row-agg"
				>
					<h3 class="tool-title">Row aggregate</h3>
					<span class="material-symbols-outlined chevron"
						>{collapsed.rowAgg ? 'chevron_right' : 'expand_more'}</span
					>
				</button>
				{#if !collapsed.rowAgg}
					<div id="tool-row-agg" class="tool-body">
						<div class="row">
							<label for="row-agg-op">Operation</label>
							<select id="row-agg-op" bind:value={rowAggOp}>
								<option value="avg">Average</option>
								<option value="sum">Sum</option>
								<option value="min">Min</option>
								<option value="max">Max</option>
								<option value="median">Median</option>
								<option value="countNonNull">Count (non‑null)</option>
							</select>
						</div>
						<div class="cols">
							{#each headers as h}
								<label class="chk">
									<input
										type="checkbox"
										checked={rowAggCols.includes(h)}
										onchange={() => toggleRowAvgCol(h)}
									/>
									<span>{h}</span>
								</label>
							{/each}
						</div>
						<div class="row">
							<label for="row-agg-out">Output column</label>
							<input
								id="row-agg-out"
								class="row-agg-out-input"
								bind:value={rowAggOut}
								placeholder="agg"
							/>
						</div>
						<div class="actions">
							<button
								class="secondary"
								onclick={addRowAgg}
								disabled={rowAggCols.length === 0 || !rowAggOut.trim()}
							>
								Add row aggregate
							</button>
						</div>
					</div>
				{/if}
			</section>

			<!-- Append another file (collapsible) -->
			<section class="tool" class:collapsed={collapsed.append}>
				<button
					type="button"
					class="tool-head"
					onclick={() => toggle('append')}
					aria-expanded={!collapsed.append}
					aria-controls="tool-append"
				>
					<h3 class="tool-title">Append another file</h3>
					<span class="material-symbols-outlined chevron"
						>{collapsed.append ? 'chevron_right' : 'expand_more'}</span
					>
				</button>
				{#if !collapsed.append}
					<div id="tool-append" class="tool-body">
						<select bind:value={appendFileId} class="file-select">
							<option value={null as any} disabled selected>Select file to append</option>
							{#each appendCandidates as f}
								<option value={f.file_id}>{f.name}</option>
							{/each}
						</select>
						<div class="actions">
							<button
								class="secondary"
								onclick={addAppend}
								disabled={!appendFileId || loadingOther}
							>
								{loadingOther ? 'Loading…' : 'Add append'}
							</button>
						</div>
					</div>
				{/if}
			</section>
		</div>

		<div class="right">
			<div class="head">
				<strong>{preview && !editMode ? 'Preview' : 'Dataset'}</strong>
				<small class="muted">
					{transforms.length ? summarizeTransforms(transforms) : 'No transforms yet'}
				</small>
				<div style="margin-top:6px; display:flex; gap:8px; align-items:center;">
					<button
						class="secondary"
						onclick={() => (editMode = !editMode)}
						aria-pressed={editMode}
						disabled={!baseData || !!preview}
					>
						{editMode ? 'Editing (on)' : 'Edit mode'}
					</button>
					{#if preview && !editMode}
						<small class="muted">Editing disabled while preview is active</small>
					{/if}
				</div>
			</div>

			{#if tableData}
				<div class="pagination">
					<div class="rows-group">
						<label class="rows-label" for="rows-per-page">Rows per page:</label>
						<select
							id="rows-per-page"
							class="rows-select"
							bind:value={pageSize}
							onchange={() => (currentPage = 1)}
						>
							<option value={50}>50</option>
							<option value={100}>100</option>
							<option value={200}>200</option>
							<option value={300}>300</option>
						</select>
					</div>
					<button onclick={() => goToPage(1)} disabled={currentPage === 1}>First</button>
					<button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}
						>Prev</button
					>
					<span>Page {currentPage} of {totalPages}</span>
					<button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}
						>Next</button
					>
					<button onclick={() => goToPage(totalPages)} disabled={currentPage === totalPages}
						>Last</button
					>
				</div>
			{/if}

			<!-- Bulk toolbar -->
			{#if editMode && selectedCount > 0}
				<div class="bulk-toolbar">
					<span
						><strong>{selectedCount}</strong> {selectedCount === 1 ? 'row' : 'rows'} selected</span
					>
					<button class="danger" onclick={deleteSelectedRows} title="Delete selected rows">
						<span class="material-symbols-outlined">delete</span>
						Delete
					</button>
					<button class="link" onclick={clearSelection}>Clear selection</button>
				</div>
			{/if}

			{#if tableData}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								{#if editMode}
									<th class="select-col">
										<input
											type="checkbox"
											bind:this={selectAllRef}
											checked={selectAllChecked}
											use:indeterminate={selectAllIndeterminate}
											onchange={(e) =>
												toggleSelectAllDisplayed((e.target as HTMLInputElement).checked)}
											aria-label="Select all rows on this page"
										/>
									</th>
								{/if}
								{#each tableData.headers as h}
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
							{#each paginatedRows as r, i}
								<tr>
									{#if editMode}
										<td class="select-col">
											<input
												type="checkbox"
												checked={selectedRows.has(startIndex + i)}
												onchange={(e) =>
													toggleRowChecked(i, (e.target as HTMLInputElement).checked)}
												aria-label={`Select row ${startIndex + i + 1}`}
											/>
										</td>
									{/if}
									{#each tableData.headers as h}
										<td
											class:selected={selectedCell &&
												selectedCell.rowLocal === i &&
												selectedCell.header === h}
											onclick={() => handleCellClick(i, h)}
										>
											{#if editMode && editingCell && editingCell.rowLocal === i && editingCell.header === h}
												<input
													id={inputId(i, h)}
													value={r[h] ?? ''}
													onkeydown={(e) => {
														const val = (e.target as HTMLInputElement).value;
														if (e.key === 'Enter') {
															updateCell(i, h, val);
															editingCell = null;
															selectedCell = null;
														} else if (e.key === 'Escape') {
															editingCell = null;
															selectedCell = null;
														}
													}}
													onblur={(e) => {
														updateCell(i, h, (e.target as HTMLInputElement).value);
														editingCell = null;
														selectedCell = null;
													}}
												/>
											{:else}
												{r[h] ?? ''}
											{/if}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
					<small class="muted">
						Showing rows {tableData ? startIndex + 1 : 0}–
						{tableData ? Math.min(startIndex + Number(pageSize), tableData.rows.length) : 0}
						of {tableData ? tableData.rows.length : 0}
					</small>
				</div>
			{:else}
				<p class="muted">No data.</p>
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
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../../styles/global.scss' as global;

	/* Util bar to match Csvparser look */
	.util-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.lab {
		display: flex;
		gap: 16px;
	}
	.left {
		width: 360px;
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.right {
		flex: 1 1 auto;
		min-width: 0;
	}

	h2 {
		margin: 0 0 4px;
	}
	.hint,
	.muted {
		color: #666;
	}

	/* Card styling (match CsvHome .card) */
	.tool {
		border: 1px solid #e6e6e6;
		border-radius: 12px;
		padding: 12px;
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	}
	.tool h3 {
		font-size: 1.1rem;
	}

	/* Collapsible tool headers */
	.tool-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		background: transparent;
		border: 0;
		padding: 0;
		text-align: left;
		cursor: pointer;
	}
	.tool-head.static {
		cursor: default;
	}
	.tool-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
	}
	.chevron {
		transition: transform 0.16s ease;
	}
	.tool.collapsed .chevron {
		transform: rotate(-90deg);
	}
	.tool-body {
		display: block;
	}

	/* Inputs/selects (match CsvHome feel) */
	.tool select,
	.tool input[type='text'],
	.tool input:not([type]) {
		padding: 6px 10px;
		border: 1px solid #ddd;
		border-radius: 8px;
		background: #fff;
		color: #222;
		font-size: 0.95rem;
	}
	.tool select:focus,
	.tool input:focus {
		border-color: #4a90e2;
		outline: none;
	}

	.row {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 8px 0;
	}
	.row > label {
		min-width: 120px;
		color: #333;
		font-weight: 500;
	}

	.inline {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}

	.cols {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
		max-height: 180px;
		overflow: auto;
		border: 1px solid #eee;
		border-radius: 10px;
		padding: 8px;
		background: #fafafa;
	}
	.chk {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.pipeline ul {
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.chip {
		display: inline-block;
		padding: 4px 8px;
		border-radius: 999px;
		background: #f5f7ff;
		border: 1px solid #dbe2ff;
		color: #123;
		font-size: 0.85rem;
	}

	/* Buttons (match CsvHome button palette) */
	button {
		cursor: pointer;
		width: fit-content;
	}
	.actions {
		display: flex;
		gap: 8px;
		margin-top: 8px;
	}

	button.primary {
		min-height: 40px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		border-radius: 10px;
		padding: 8px 12px;
		border: 1px solid global.$text-grey-10;
		background: global.$background-primary-color;
		color: global.$text-white;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
	}
	button.primary:hover {
		background: global.$background-secondary-color;
		border-color: global.$background-primary-color;
		color: global.$text-grey-90;
		box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
	}
	button.secondary {
		min-height: 36px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		border-radius: 10px;
		padding: 6px 10px;
		border: 1px solid global.$text-grey-10;
		background: #fff;
		color: #222;
	}
	button.secondary:hover {
		background: global.$background-secondary-color;
	}
	button.link {
		background: transparent;
		border: none;
		color: #0b5fff;
		text-decoration: underline;
		padding: 0 4px;
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 8px;
	}

	.table-wrap {
		border: 1px solid #e6e6e6;
		border-radius: 12px;
		overflow: auto;
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.9rem;
		background: #fff;
	}
	th,
	td {
		border: 1px solid #eee;
		padding: 6px 8px;
		text-align: left;
	}
	th {
		background: #f7f7f7;
		position: sticky;
		top: 0;
		z-index: 1;
	}
	td.selected {
		outline: 2px solid #4a90e2;
		outline-offset: -2px;
	}

	/* Edit toolbar */
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
		border-radius: 10px;
	}
	.add-col-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.add-col-input {
		padding: 0.5rem 0.9rem;
		border: 1px solid #ddd;
		border-radius: 8px;
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
		border-radius: 10px;
	}

	/* Bulk selection toolbar */
	.bulk-toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.6rem;
		margin: 0.5rem 0;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
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

	.select-col {
		width: 36px;
		text-align: center;
	}

	/* Header rename */
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
		border-radius: 6px;
		font: inherit;
		color: inherit;
		background: #fff;
	}

	/* Header floating menu (same look as CsvParser) */
	.header-menu {
		position: fixed;
		min-width: 200px;
		max-width: 260px;
		background: #fff;
		border: 1px solid #e5e5e5;
		border-radius: 10px;
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
		border-radius: 8px;
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

	/* Pagination (match CsvHome) */
	.pagination {
		margin: 0.5rem 0;
		display: flex;
		gap: 0.6rem;
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
		border-radius: 8px;
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

	.file-select {
		max-width: 100%;
	}
	.row-agg-out-input {
		max-width: 100%;
	}

	/* Keep inputs/selects inside the tool padding */
	.tool * {
		box-sizing: border-box;
		box-shadow: none;
	}
	.tool .row > select,
	.tool .row > input[type='text'],
	.tool .row > input:not([type]) {
		flex: 1 1 auto; /* take remaining space next to the label */
		min-width: 0; /* allow shrinking to fit */
		max-width: 100%; /* never overflow parent */
	}
	/* Make standalone selects inside tools respect width */
	.tool select.file-select,
	.tool input.row-agg-out-input {
		width: 100%;
		max-width: 100%;
	}

	/* Optional: clip inner shadows/rounded corners exactly to card */
	.tool {
		overflow: hidden;
	}
</style>
