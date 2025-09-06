<script lang="ts">
	import { csvData } from '$lib/stores/csvData';

	type CleanMode = 'duplicates' | 'empty' | 'date';

	// Typed props (add onHighlightRows)
	const props = $props<{
		mode: CleanMode;
		onClose: () => void;
		onBack?: () => void;
		onHighlightRows?: (ids: number[]) => void;
		onHighlightEmptyCells?: (cells: { row: number; col: string }[]) => void;
	}>();

	function close() {
		props.onClose();
	}
	function back() {
		(props.onBack ?? props.onClose)();
	}

	const titles: Record<CleanMode, string> = {
		duplicates: 'Duplicate finder',
		empty: 'Empty cells',
		date: 'Date formatter'
	};

	// Narrow mode for indexing to avoid TS7053
	const panelTitle = $derived(() => titles[props.mode as CleanMode]);

	// State variables
	let useAllDup = $state(true);
	let dupCols = $state<string[]>([]);
	let dupCaseSensitive = $state(false);
	let dupCount = $state<number | null>(null);

	let useAllEmpty = $state(true);
	let emptyCols = $state<string[]>([]);
	let emptyCount = $state<number | null>(null);
	let fillValue = $state<string>('');
	// confirm dialog for deleting rows with empty cells
	let showEmptyDeleteConfirm = $state(false);

	let dateCol = $state<string>('');
	let outFormat = $state<'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'ISO_DATETIME'>('YYYY-MM-DD');
	let target = $state<'add' | 'replace'>('add');
	let newColName = $state<string>('');

	// Derived from store
	const headers = $derived(() => $csvData?.headers ?? []);
	const rowCount = $derived(() => $csvData?.rows.length ?? 0);

	// Helpers
	function asKey(val: unknown, caseSensitive: boolean) {
		const s = val == null ? '' : String(val);
		return caseSensitive ? s : s.toLowerCase();
	}
	function insertColumnAfter(name: string, newName: string) {
		csvData.update((d) => {
			if (!d) return d;
			if (d.headers.includes(newName)) return d;
			const idx = d.headers.indexOf(name);
			if (idx === -1) return d;
			const headers = d.headers.slice();
			headers.splice(idx + 1, 0, newName);
			const rows = d.rows.map((r) => ({ ...r, [newName]: null }));
			return { ...d, headers, rows };
		});
	}

	// Duplicates
	// Build duplicate clusters (OR semantics)
	function buildDuplicateClusters(): number[][] {
		if (!$csvData) return [];
		const cols = useAllDup ? $csvData.headers : dupCols;
		if (cols.length === 0) return [];

		const n = $csvData.rows.length;
		const parent = Array.from({ length: n }, (_, i) => i);
		function find(a: number): number {
			while (parent[a] !== a) {
				parent[a] = parent[parent[a]];
				a = parent[a];
			}
			return a;
		}
		function union(a: number, b: number) {
			const ra = find(a);
			const rb = find(b);
			if (ra !== rb) parent[rb] = ra;
		}

		// For each column, union rows that share the same value (case sensitivity respected)
		for (const c of cols) {
			const map = new Map<string, number[]>();
			for (let i = 0; i < n; i++) {
				const key = asKey($csvData.rows[i][c], dupCaseSensitive);
				const arr = map.get(key);
				if (arr) arr.push(i);
				else map.set(key, [i]);
			}
			for (const group of map.values()) {
				if (group.length > 1) {
					const first = group[0];
					for (let k = 1; k < group.length; k++) union(first, group[k]);
				}
			}
		}

		// Collect connected components with size > 1
		const comps = new Map<number, number[]>();
		for (let i = 0; i < n; i++) {
			const r = find(i);
			const arr = comps.get(r);
			if (arr) arr.push(i);
			else comps.set(r, [i]);
		}
		const clusters: number[][] = [];
		for (const arr of comps.values()) {
			if (arr.length > 1) {
				arr.sort((a, b) => a - b);
				clusters.push(arr);
			}
		}
		return clusters;
	}

	// Recompute count using clusters (rows that would be removed if keeping first in each cluster)
	function computeDuplicateCount(): number {
		if (!$csvData) return 0;
		const clusters = buildDuplicateClusters();
		return clusters.reduce((acc, g) => acc + (g.length - 1), 0);
	}

	// Expose a simple "Find" action used by the button
	function findDuplicates() {
		dupCount = computeDuplicateCount();
	}

	// UI state for duplicate choices
	let showDupChoices = $state(false);

	function onRemoveDuplicatesClick() {
		// Open choice UI only if there are duplicates
		dupCount = computeDuplicateCount();
		showDupChoices = dupCount != null && dupCount > 0;
	}

	// Helper: choose first non-empty value
	function firstNonEmpty(values: unknown[]) {
		for (const v of values) {
			if (v !== null && v !== '') return v;
		}
		return values.length ? values[0] : null;
	}

	// Merge rows within each duplicate cluster
	function mergeDuplicateClusters() {
		if (!$csvData) return;
		const clusters = buildDuplicateClusters();
		if (clusters.length === 0) return;

		csvData.update((d) => {
			if (!d) return d;
			const toRemove = new Set<number>();
			const rows = d.rows.slice();

			for (const cluster of clusters) {
				const keep = cluster[0]; // smallest index
				for (const h of d.headers) {
					const vals = cluster.map((idx) => rows[idx]?.[h]);
					const chosen = firstNonEmpty(vals);
					// Write chosen value to 'keep'
					const base = rows[keep] ?? {};
					base[h] = chosen as any;
					rows[keep] = base as any;
				}
				// Mark all others for removal
				for (let i = 1; i < cluster.length; i++) toRemove.add(cluster[i]);
			}

			const newRows = rows.filter((_, idx) => !toRemove.has(idx));
			return { ...d, rows: newRows };
		});
		dupCount = computeDuplicateCount();
		showDupChoices = false;
	}

	// Remove duplicates keeping first per cluster
	function reallyRemoveDuplicatesKeepFirst() {
		if (!$csvData) return;
		const clusters = buildDuplicateClusters();
		if (clusters.length === 0) return;

		csvData.update((d) => {
			if (!d) return d;
			const toRemove = new Set<number>();
			for (const cluster of clusters) {
				for (let i = 1; i < cluster.length; i++) toRemove.add(cluster[i]);
			}
			const rows = d.rows.filter((_, idx) => !toRemove.has(idx));
			return { ...d, rows };
		});
		dupCount = computeDuplicateCount();
		showDupChoices = false;
	}

	// Highlight duplicate rows and switch to edit mode in parent
	function highlightDuplicates() {
		const clusters = buildDuplicateClusters();
		const indices = clusters.flat();
		props.onHighlightRows?.(indices);
		showDupChoices = false;
		close();
	}

	// Empty cells
	function isEmpty(v: unknown) {
		return v == null || v === '';
	}
	// Build the list of empty cells for current selection
	function computeEmptyCells(): { row: number; col: string }[] {
		if (!$csvData) return [];
		const cols = useAllEmpty ? $csvData.headers : emptyCols;
		if (cols.length === 0) return [];
		const result: { row: number; col: string }[] = [];
		for (let i = 0; i < $csvData.rows.length; i++) {
			const r = $csvData.rows[i];
			for (const h of cols) {
				if (isEmpty(r[h])) result.push({ row: i, col: h });
			}
		}
		return result;
	}

	function computeEmptyCount(): number {
		if (!$csvData) return 0;
		const cols = useAllEmpty ? $csvData.headers : emptyCols;
		if (cols.length === 0) return 0;
		let count = 0;
		for (const row of $csvData.rows) for (const h of cols) if (isEmpty(row[h])) count++;
		return count;
	}
	function findEmpties() {
		emptyCount = computeEmptyCount();
	}

	// Highlight empty cells and put table in edit mode (handled by parent)
	function highlightEmptyCells() {
		const cells = computeEmptyCells();
		if (cells.length === 0) {
			emptyCount = 0;
			return;
		}
		props.onHighlightEmptyCells?.(cells);
		close();
	}

	// Delete rows that contain empties (confirm UI below)
	function removeRowsWithEmpties() {
		if (!$csvData) return;
		const cols = useAllEmpty ? $csvData.headers : emptyCols;
		if (cols.length === 0) return;
		csvData.update((d) => {
			if (!d) return d;
			const rows = d.rows.filter((r) => !cols.some((h) => isEmpty(r[h])));
			return { ...d, rows };
		});
		emptyCount = computeEmptyCount();
		showEmptyDeleteConfirm = false; // close confirmation after applying
	}
	// Mass fill empties
	let replaceMode = $state<'null' | 'value'>('value');
	function fillEmptyCells() {
		if (!$csvData) return;
		const cols = useAllEmpty ? $csvData.headers : emptyCols;
		if (cols.length === 0) return;
		// Use the literal string "null" when selected
		const replacement = replaceMode === 'null' ? 'null' : String(fillValue);
		if (replaceMode === 'value' && !String(fillValue).trim()) return;
		csvData.update((d) => {
			if (!d) return d;
			const rows = d.rows.map((r) => {
				const copy = { ...r };
				for (const h of cols) if (isEmpty(copy[h])) copy[h] = replacement as any;
				return copy;
			});
			return { ...d, rows };
		});
		emptyCount = computeEmptyCount();
	}

	// Date formatter
	function pad2(n: number) {
		return n < 10 ? `0${n}` : String(n);
	}
	function formatDate(val: unknown): string | null {
		if (val == null || val === '') return null;
		let d: Date;
		if (val instanceof Date) d = val;
		else {
			const t = new Date(String(val));
			if (isNaN(t.getTime())) return null;
			d = t;
		}
		const Y = d.getFullYear(),
			M = pad2(d.getMonth() + 1),
			D = pad2(d.getDate());
		const h = pad2(d.getHours()),
			m = pad2(d.getMinutes()),
			s = pad2(d.getSeconds());
		switch (outFormat) {
			case 'YYYY-MM-DD':
				return `${Y}-${M}-${D}`;
			case 'DD/MM/YYYY':
				return `${D}/${M}/${Y}`;
			case 'MM/DD/YYYY':
				return `${M}/${D}/${Y}`;
			case 'ISO_DATETIME':
				return `${Y}-${M}-${D}T${h}:${m}:${s}`;
		}
	}
	function applyDateFormat() {
		if (!$csvData || !dateCol) return;
		const col = dateCol;
		const defaultNew = `${col}_formatted`;
		const finalNew = newColName.trim() || defaultNew;
		if (target === 'add' && !$csvData.headers.includes(finalNew)) insertColumnAfter(col, finalNew);
		csvData.update((d) => {
			if (!d) return d;
			const rows = d.rows.map((r) => {
				const formatted = formatDate(r[col]);
				if (formatted == null) return r;
				return target === 'replace' ? { ...r, [col]: formatted } : { ...r, [finalNew]: formatted };
			});
			return { ...d, rows };
		});
	}

	// Checkbox toggles
	function toggleDupCol(h: string) {
		dupCols = dupCols.includes(h) ? dupCols.filter((x) => x !== h) : [...dupCols, h];
	}
	function toggleEmptyCol(h: string) {
		emptyCols = emptyCols.includes(h) ? emptyCols.filter((x) => x !== h) : [...emptyCols, h];
	}

	// a11y: keyboard close for overlay
	function overlayKey(e: KeyboardEvent) {
		if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') close();
	}
	// a11y: prevent overlay keydown from closing when inside dialog
	function panelKey(e: KeyboardEvent) {
		if (e.key === 'Escape') e.stopPropagation();
	}
</script>

<div
	class="clean-overlay"
	role="button"
	tabindex="0"
	aria-label="Close cleaning panel"
	onclick={close}
	onkeydown={overlayKey}
>
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<div
		class="clean-panel"
		role="dialog"
		aria-modal="true"
		aria-label={panelTitle()}
		onclick={(e) => e.stopPropagation()}
		onkeydown={panelKey}
	>
		<header class="panel-head">
			<button class="back-btn" onclick={back} title="Back">←</button>
			<h3>{panelTitle()}</h3>
			<button class="close-btn" onclick={close} title="Close">✕</button>
		</header>

		{#if props.mode === 'duplicates'}
			<section>
				<h4>Duplicates</h4>
				<div class="row">
					<label
						><input type="checkbox" checked={useAllDup} onclick={() => (useAllDup = !useAllDup)} /> Use
						all columns</label
					>
				</div>
				<div class="col-list" aria-label="Columns to check for duplicates">
					{#each headers() as h}
						<label class="col-item">
							<input
								type="checkbox"
								checked={dupCols.includes(h)}
								disabled={useAllDup}
								onclick={() => toggleDupCol(h)}
							/>
							<span class="col-name">{h}</span>
						</label>
					{/each}
				</div>
				<div class="row">
					<label
						><input
							type="checkbox"
							checked={dupCaseSensitive}
							onclick={() => (dupCaseSensitive = !dupCaseSensitive)}
						/> Case sensitive</label
					>
				</div>
				<div class="actions">
					<button class="secondary" onclick={findDuplicates}>Find</button>
					<button onclick={onRemoveDuplicatesClick} title="Choose how to handle duplicates">
						Handle duplicates
					</button>
					{#if dupCount !== null}
						<span class="meta">{dupCount} duplicate{dupCount === 1 ? '' : 's'} found</span>
					{/if}
				</div>

				{#if showDupChoices}
					<div class="dup-choices" role="group" aria-label="Duplicate handling options">
						<button
							onclick={mergeDuplicateClusters}
							title="Keep one row and merge values from duplicates"
						>
							Merge rows (keep first)
						</button>
						<button
							class="danger"
							onclick={reallyRemoveDuplicatesKeepFirst}
							title="Drop duplicates and keep the first"
						>
							Remove duplicates
						</button>
						<button
							onclick={highlightDuplicates}
							title="Highlight duplicates in the table for manual review"
						>
							Highlight and edit
						</button>
					</div>
				{/if}
			</section>
		{/if}

		{#if props.mode === 'empty'}
			<section>
				<h4>Empty cells</h4>
				<div class="row">
					<label
						><input
							type="checkbox"
							checked={useAllEmpty}
							onclick={() => (useAllEmpty = !useAllEmpty)}
						/> Use all columns</label
					>
				</div>

				<div class="col-list" aria-label="Columns to check for empty cells">
					{#each headers() as h}
						<label class="col-item">
							<input
								type="checkbox"
								checked={emptyCols.includes(h)}
								disabled={useAllEmpty}
								onclick={() => toggleEmptyCol(h)}
							/>
							<span class="col-name">{h}</span>
						</label>
					{/each}
				</div>

				<div class="actions">
					<button class="secondary" onclick={findEmpties}>Find</button>
					<button
						onclick={highlightEmptyCells}
						title="Highlight empty cells in the table and enable edit mode"
					>
						Highlight and edit
					</button>
				</div>

				<!-- Mass replace -->
				<div class="replace-box" role="group" aria-label="Fill empty cells">
					<strong>Fill empties</strong>
					<label>
						<input
							type="radio"
							name="replaceMode"
							value="null"
							checked={replaceMode === 'null'}
							onclick={() => (replaceMode = 'null')}
						/>
						Use "null" (text)
					</label>
					<label class="fill">
						<input
							type="radio"
							name="replaceMode"
							value="value"
							checked={replaceMode === 'value'}
							onclick={() => (replaceMode = 'value')}
						/>
						<span>Custom value</span>
						<input
							class="fill-input"
							placeholder="e.g. N/A"
							bind:value={fillValue}
							disabled={replaceMode === 'null'}
						/>
					</label>
					<button onclick={fillEmptyCells} disabled={replaceMode === 'value' && !fillValue.trim()}
						>Apply fill</button
					>
				</div>

				<!-- Dangerous: delete rows containing empties -->
				<div class="danger-box">
					<button
						class="danger"
						onclick={() => (showEmptyDeleteConfirm = true)}
						title="Delete rows that contain empty cells"
					>
						Delete rows with empty cells
					</button>
					{#if showEmptyDeleteConfirm}
						<div class="confirm">
							<p>
								Are you sure? This will permanently remove all rows that contain empty cells in the
								selected columns.
							</p>
							<div class="actions">
								<button class="secondary" onclick={() => (showEmptyDeleteConfirm = false)}
									>Cancel</button
								>
								<button class="danger" onclick={removeRowsWithEmpties}>Confirm delete</button>
							</div>
						</div>
					{/if}
				</div>

				{#if emptyCount !== null}
					<span class="meta">{emptyCount} empty cell{emptyCount === 1 ? '' : 's'} found</span>
				{/if}
			</section>
		{/if}

		{#if props.mode === 'date'}
			<section>
				<h4>Date formatter</h4>
				<div class="row">
					<label for="date-col">Column</label>
					<select id="date-col" bind:value={dateCol}>
						<option value="" disabled selected>Select a column</option>
						{#each headers() as h}<option value={h}>{h}</option>{/each}
					</select>
				</div>
				<div class="row">
					<label for="fmt">Format</label>
					<select id="fmt" bind:value={outFormat}>
						<option value="YYYY-MM-DD">YYYY-MM-DD</option>
						<option value="DD/MM/YYYY">DD/MM/YYYY</option>
						<option value="MM/DD/YYYY">MM/DD/YYYY</option>
						<option value="ISO_DATETIME">ISO date-time</option>
					</select>
				</div>
				<div class="row">
					<label
						><input
							type="radio"
							name="target"
							value="add"
							checked={target === 'add'}
							onclick={() => (target = 'add')}
						/> Add as new column</label
					>
					<label
						><input
							type="radio"
							name="target"
							value="replace"
							checked={target === 'replace'}
							onclick={() => (target = 'replace')}
						/> Replace original</label
					>
				</div>
				{#if target === 'add'}
					<div class="row">
						<label for="new-name">New column name</label>
						<input
							id="new-name"
							placeholder="Defaults to <col>_formatted"
							bind:value={newColName}
						/>
					</div>
				{/if}
				<div class="actions">
					<button onclick={applyDateFormat} disabled={!dateCol}>Apply</button>
				</div>
				<p class="hint">
					Note: parsing uses the browser Date parser; only valid dates will be formatted.
				</p>
			</section>
		{/if}

		<footer class="panel-foot">
			<span class="meta">{rowCount()} rows</span>
			<div class="grow"></div>
			<button class="secondary" onclick={close}>Close</button>
		</footer>
	</div>
</div>

<style>
	.clean-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: flex;
		align-items: stretch;
		justify-content: flex-end;
		z-index: 10000;
	}
	.clean-panel {
		width: min(460px, 100vw);
		height: 100%;
		background: #fff;
		border-left: 1px solid #e5e5e5;
		box-shadow: -12px 0 24px rgba(0, 0, 0, 0.15);
		padding: 14px 14px 10px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow-y: auto; /* allow scrolling inside the panel */
		-webkit-overflow-scrolling: touch;
	}
	.panel-head,
	.panel-foot {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.panel-head h3 {
		margin: 0;
		font-size: 1.1rem;
	}
	.close-btn,
	.back-btn {
		border: 1px solid #ddd;
		background: #f8f8f8;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
	}
	.back-btn {
		margin-right: 8px;
	}
	section {
		border: 1px solid #eee;
		border-radius: 10px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	section h4 {
		margin: 0 0 2px 0;
		font-size: 1rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.fill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-left: auto;
	}
	.fill-input {
		padding: 0.4rem 0.6rem;
		border: 1px solid #ddd;
		border-radius: 6px;
	}
	.meta {
		color: #666;
		font-size: 0.9rem;
	}
	.hint {
		color: #777;
		font-size: 0.85rem;
		margin: 0;
	}
	.grow {
		flex: 1 1 auto;
	}
	button {
		cursor: pointer;
	}
	button.danger {
		color: #a11;
	}

	/* Column checkbox list */
	.col-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		border: 1px solid #e1e1e1;
		border-radius: 10px;
		background: #fff;
		max-height: 220px;
		overflow: auto;
	}
	.col-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px;
		border-radius: 8px;
		transition: background-color 0.15s ease;
	}
	.col-item:hover {
		background: #f6f6f6;
	}
	.col-item input[type='checkbox'] {
		width: 16px;
		height: 16px;
	}
	.col-name {
		font-size: 0.95rem;
		color: #222;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.dup-choices {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 8px;
		border: 1px dashed #e0e0e0;
		border-radius: 10px;
		background: #fffef8;
	}

	/* Replace box for empty cells */
	.replace-box {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 8px;
		border: 1px solid #e6e6e6;
		border-radius: 10px;
		background: #fff;
	}
	.replace-box strong {
		font-size: 1rem;
		color: #333;
	}
	.replace-box label {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.replace-box input[type='radio'] {
		width: 16px;
		height: 16px;
	}
	.replace-box .fill-input {
		flex: 1;
	}

	/* Danger box for delete confirmation */
	.danger-box {
		margin-top: 4px;
		padding: 8px;
		border: 1px solid #f0d3d3;
		border-radius: 10px;
		background: #fff7f7;
	}
	.danger-box .confirm {
		margin-top: 6px;
		padding: 8px;
		border: 1px dashed #e0bcbc;
		border-radius: 8px;
		background: #fff;
	}
</style>
