<script lang="ts">
	import { csvData } from '$lib/stores/csvData';

	let { onClose } = $props<{ onClose: () => void }>();

	// Derived
	const headers = $derived(() => $csvData?.headers ?? []);
	const rowCount = $derived(() => $csvData?.rows.length ?? 0);

	// Shared helpers
	function asKey(val: unknown, caseSensitive: boolean) {
		const s = val == null ? '' : String(val);
		return caseSensitive ? s : s.toLowerCase();
	}

	function insertColumnAfter(name: string, newName: string) {
		csvData.update((d) => {
			if (!d) return d;
			if (d.headers.includes(newName)) return d; // avoid dup header
			const idx = d.headers.indexOf(name);
			if (idx === -1) return d;
			const headers = d.headers.slice();
			headers.splice(idx + 1, 0, newName);
			const rows = d.rows.map((r) => ({ ...r, [newName]: null }));
			return { ...d, headers, rows };
		});
	}

	// 1) Duplicates
	let useAllDup = $state(true);
	let dupCols = $state<string[]>([]);
	let dupCaseSensitive = $state(false);
	let dupCount = $state<number | null>(null);

	function computeDuplicateCount(): number {
		if (!$csvData) return 0;
		const cols = useAllDup ? $csvData.headers : dupCols;
		if (cols.length === 0) return 0;
		const seen = new Set<string>();
		let dups = 0;
		for (const row of $csvData.rows) {
			const key = cols.map((h) => asKey(row[h], dupCaseSensitive)).join('␟'); // unit sep
			if (seen.has(key)) dups++;
			else seen.add(key);
		}
		return dups;
	}

	function findDuplicates() {
		dupCount = computeDuplicateCount();
	}

	function removeDuplicatesKeepFirst() {
		if (!$csvData) return;
		const cols = useAllDup ? $csvData.headers : dupCols;
		if (cols.length === 0) return;
		csvData.update((d) => {
			if (!d) return d;
			const seen = new Set<string>();
			const rows = d.rows.filter((row) => {
				const key = cols.map((h) => asKey(row[h], dupCaseSensitive)).join('␟');
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
			return { ...d, rows };
		});
		dupCount = computeDuplicateCount();
	}

	// 2) Empty cells
	let useAllEmpty = $state(true);
	let emptyCols = $state<string[]>([]);
	let emptyCount = $state<number | null>(null);
	let fillValue = $state<string>('');

	function isEmpty(v: unknown) {
		return v == null || v === '';
	}

	function computeEmptyCount(): number {
		if (!$csvData) return 0;
		const cols = useAllEmpty ? $csvData.headers : emptyCols;
		if (cols.length === 0) return 0;
		let count = 0;
		for (const row of $csvData.rows) {
			for (const h of cols) {
				if (isEmpty(row[h])) {
					count++;
				}
			}
		}
		return count;
	}

	function findEmpties() {
		emptyCount = computeEmptyCount();
	}

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
	}

	function fillEmptyCells() {
		if (!$csvData) return;
		const cols = useAllEmpty ? $csvData.headers : emptyCols;
		if (cols.length === 0) return;
		csvData.update((d) => {
			if (!d) return d;
			const rows = d.rows.map((r) => {
				const copy = { ...r };
				for (const h of cols) {
					if (isEmpty(copy[h])) copy[h] = fillValue;
				}
				return copy;
			});
			return { ...d, rows };
		});
		emptyCount = computeEmptyCount();
	}

	// 3) Date formatter
	let dateCol = $state<string>('');
	let outFormat = $state<'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'ISO_DATETIME'>('YYYY-MM-DD');
	let target = $state<'add' | 'replace'>('add');
	let newColName = $state<string>('');

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
		const Y = d.getFullYear();
		const M = pad2(d.getMonth() + 1);
		const D = pad2(d.getDate());
		const h = pad2(d.getHours());
		const m = pad2(d.getMinutes());
		const s = pad2(d.getSeconds());
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

		// Ensure target column exists if adding
		if (target === 'add' && !$csvData.headers.includes(finalNew)) {
			insertColumnAfter(col, finalNew);
		}

		csvData.update((d) => {
			if (!d) return d;
			const rows = d.rows.map((r) => {
				const formatted = formatDate(r[col]);
				if (formatted == null) return r;
				if (target === 'replace') {
					return { ...r, [col]: formatted };
				} else {
					return { ...r, [finalNew]: formatted };
				}
			});
			// If we added a new column that already existed, keep headers unchanged
			return { ...d, rows };
		});
	}
</script>

<div class="clean-overlay" onclick={onClose}>
	<div class="clean-panel" onclick={(e) => e.stopPropagation()}>
		<header class="panel-head">
			<h3>Data cleaning</h3>
			<button class="close-btn" onclick={onClose} title="Close">✕</button>
		</header>

		<section>
			<h4>Duplicates</h4>
			<div class="row">
				<label
					><input type="checkbox" checked={useAllDup} onclick={() => (useAllDup = !useAllDup)} /> Use
					all columns</label
				>
			</div>
			<select
				class="multi"
				multiple
				size={Math.min(8, headers().length)}
				disabled={useAllDup}
				bind:value={dupCols}
			>
				{#each headers() as h}<option value={h}>{h}</option>{/each}
			</select>
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
				<button
					onclick={removeDuplicatesKeepFirst}
					title="Remove duplicates keeping the first occurrence">Remove duplicates</button
				>
				{#if dupCount !== null}
					<span class="meta">{dupCount} duplicate{dupCount === 1 ? '' : 's'} found</span>
				{/if}
			</div>
		</section>

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
			<select
				class="multi"
				multiple
				size={Math.min(8, headers().length)}
				disabled={useAllEmpty}
				bind:value={emptyCols}
			>
				{#each headers() as h}<option value={h}>{h}</option>{/each}
			</select>
			<div class="actions">
				<button class="secondary" onclick={findEmpties}>Find</button>
				<button
					class="danger"
					onclick={removeRowsWithEmpties}
					title="Remove rows that contain empty cells">Remove rows</button
				>
				<label class="fill">
					Fill with:
					<input class="fill-input" placeholder="e.g. N/A" bind:value={fillValue} />
				</label>
				<button onclick={fillEmptyCells} disabled={!fillValue.trim()}>Fill empties</button>
				{#if emptyCount !== null}
					<span class="meta">{emptyCount} empty cell{emptyCount === 1 ? '' : 's'} found</span>
				{/if}
			</div>
		</section>

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
					<input id="new-name" placeholder="Defaults to <col>_formatted" bind:value={newColName} />
				</div>
			{/if}
			<div class="actions">
				<button onclick={applyDateFormat} disabled={!dateCol}>Apply</button>
			</div>
			<p class="hint">
				Note: parsing uses the browser Date parser; only valid dates will be formatted.
			</p>
		</section>

		<footer class="panel-foot">
			<span class="meta">{rowCount()} rows</span>
			<div class="grow"></div>
			<button class="secondary" onclick={onClose}>Close</button>
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
	.close-btn {
		margin-left: auto;
		border: 1px solid #ddd;
		background: #f8f8f8;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
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
	.multi {
		width: 100%;
		min-height: 6.5rem;
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 6px;
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
</style>
