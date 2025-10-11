<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import D3Chart from './D3Chart.svelte';
	import { parseExpression, tryEval, evalParsed } from '$lib/visualize/expr/eval';
	import type { ChartSpec } from '$lib/types/visualization';

	const dispatch = createEventDispatcher<{ specChange: { spec: ChartSpec | null } }>();

	let { headers, rows } = $props<{
		headers: string[];
		rows: Record<string, unknown>[];
	}>();

	// Seed a minimal spec for convenience
	const defaultSpec = $derived<ChartSpec>({
		mark: 'line',
		title: 'Untitled',
		legend: true,
		encoding: {
			x: headers[0] ?? null,
			y: headers[1] ? [headers[1]] : [],
			color: null,
			groupBy: null
		},
		options: {}
	});

	// Remove defaultSpec.size usage; add advanced UI state
	let showRaw = $state(false);

	// Channel assignments (drag & drop)
	let chanX = $state<string | null>(headers[0] ?? null);
	let chanY = $state<string[]>(headers[1] ? [headers[1]] : []);
	let chanColor = $state<string | null>(null);
	let chanSize = $state<string | null>(null);
	let chanTooltip = $state<string[]>([]); // multi

	function toggleY(h: string) {
		chanY = chanY.includes(h) ? chanY.filter((c) => c !== h) : [...chanY, h];
	}

	// Drag helpers
	function onDragStart(e: DragEvent, col: string) {
		e.dataTransfer?.setData('text/plain', col);
	}
	function allowDrop(e: DragEvent) {
		e.preventDefault();
	}
	function dropX(e: DragEvent) {
		e.preventDefault();
		const col = e.dataTransfer?.getData('text/plain');
		if (col && headers.includes(col)) chanX = col;
	}
	function dropColor(e: DragEvent) {
		e.preventDefault();
		const col = e.dataTransfer?.getData('text/plain');
		if (col && headers.includes(col)) chanColor = col;
	}
	function dropSize(e: DragEvent) {
		e.preventDefault();
		const col = e.dataTransfer?.getData('text/plain');
		if (col && headers.includes(col)) chanSize = col;
	}
	function dropTooltip(e: DragEvent) {
		e.preventDefault();
		const col = e.dataTransfer?.getData('text/plain');
		if (col && headers.includes(col)) {
			if (!chanTooltip.includes(col)) chanTooltip = [...chanTooltip, col];
		}
	}
	function removeTooltip(col: string) {
		chanTooltip = chanTooltip.filter((c) => c !== col);
	}
	function dropY(e: DragEvent) {
		e.preventDefault();
		const col = e.dataTransfer?.getData('text/plain');
		if (col && headers.includes(col)) toggleY(col);
	}

	// Formula fields
	interface FormulaField {
		id: string;
		name: string;
		expression: string;
		error?: string;
		preview?: number | null;
	}
	let formulas = $state<FormulaField[]>([]);
	function addFormula() {
		formulas = [...formulas, { id: crypto.randomUUID(), name: 'new_field', expression: '' }];
	}
	function removeFormula(id: string) {
		formulas = formulas.filter((f) => f.id !== id);
	}
	function updateFormula(f: FormulaField) {
		// validate name
		if (!f.name.match(/^[A-Za-z_][A-Za-z0-9_]*$/)) {
			f.error = 'Invalid name';
			f.preview = null;
		} else if (!f.expression.trim()) {
			f.error = 'Empty expression';
			f.preview = null;
		} else if (rows.length) {
			const ctx = rows[0];
			const res = tryEval(f.expression, ctx);
			f.preview = res.value;
			f.error = res.error;
		}
		formulas = [...formulas];
	}

	// Conditional styling rules
	interface StyleRule {
		id: string;
		expression: string;
		color: string;
		error?: string;
		active?: boolean;
	}
	let styleRules = $state<StyleRule[]>([]);
	function addRule() {
		styleRules = [...styleRules, { id: crypto.randomUUID(), expression: '', color: '#d62728' }];
	}
	function removeRule(id: string) {
		styleRules = styleRules.filter((r) => r.id !== id);
	}

	// Transforms
	let logX = $state(false);
	let logY = $state(false);

	// Layer placeholder (single primary layer now)
	let primaryMark = $state<'line' | 'scatter' | 'bar'>('line');

	// ========================= Performance config =========================
	const STYLE_EVAL_ROW_LIMIT = 4000; // hard cap for conditional rule evaluation
	const STYLE_EVAL_TRUNCATE_NOTE_THRESHOLD = 1500; // show hint if truncated
	// =====================================================================

	// Parsed caches
	interface ParsedFormula {
		id: string;
		name: string;
		expression: string;
		parsed?: ReturnType<typeof parseExpression>;
		error?: string;
	}
	interface ParsedRule {
		id: string;
		expression: string;
		color: string;
		parsed?: ReturnType<typeof parseExpression>;
		error?: string;
	}

	let parsedFormulas: ParsedFormula[] = [];
	let parsedRules: ParsedRule[] = [];

	// Replace previous $derived augmentedRows with cached state version
	let augmentedRows = $state<Record<string, unknown>[]>(rows);

	// Keep stable reference to raw dataset length to detect change cheaply
	let prevRowsRef: Record<string, unknown>[] = rows;

	// Recompute parsed formulas whenever formulas array changes
	$effect(() => {
		parsedFormulas = formulas.map((f) => {
			const pf: ParsedFormula = { id: f.id, name: f.name, expression: f.expression };
			if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.name)) {
				pf.error = 'Invalid name';
			} else if (!f.expression.trim()) {
				pf.error = 'Empty expression';
			} else {
				try {
					pf.parsed = parseExpression(f.expression);
				} catch (e: any) {
					pf.error = e?.message || 'Parse error';
				}
			}
			return pf;
		});
		// Trigger augmentation if formulas themselves changed
		recomputeAugmentedRows();
	});

	// Recompute parsed rules whenever styleRules change
	$effect(() => {
		parsedRules = styleRules.map((r) => {
			const pr: ParsedRule = { id: r.id, expression: r.expression, color: r.color };
			if (!r.expression.trim()) {
				pr.error = 'Empty';
			} else {
				try {
					pr.parsed = parseExpression(r.expression);
				} catch (e: any) {
					pr.error = e?.message || 'Parse error';
				}
			}
			return pr;
		});
		// NOTE: no mutation of styleRules here (prevents feedback loop)
		schedulePointOverrideRecalc();
	});

	// Derived map of rule id -> error (used in template; avoids mutating styleRules)
	const ruleErrors = $derived.by<Record<string, string | undefined>>(() => {
		const m: Record<string, string | undefined> = {};
		for (const pr of parsedRules) m[pr.id] = pr.error;
		return m;
	});

	function recomputeAugmentedRows() {
		// Only rebuild if formulas changed or base rows reference changed
		const needRebuild = parsedFormulas.some((f) => !f.error && f.parsed) || prevRowsRef !== rows;
		if (!needRebuild) return;
		prevRowsRef = rows;

		// Heavy operation: do once, not every small UI update
		const next: Record<string, unknown>[] = new Array(rows.length);
		for (let i = 0; i < rows.length; i++) {
			const base = rows[i];
			// If no valid formulas, reuse row (keep identity for D3 performance)
			if (!parsedFormulas.length || !parsedFormulas.some((f) => f.parsed && !f.error)) {
				next[i] = base;
				continue;
			}
			const clone: Record<string, unknown> = { ...base };
			for (const pf of parsedFormulas) {
				if (!pf.parsed || pf.error) continue;
				try {
					const val = evalParsed(pf.parsed, base);
					clone[pf.name] = isFinite(val) ? val : null;
				} catch {
					clone[pf.name] = null;
				}
			}
			next[i] = clone;
		}
		augmentedRows = next;
		// After augmentation we need to refresh styling
		schedulePointOverrideRecalc();
	}

	// Recompute augmented rows when underlying dataset changes
	$effect(() => {
		if (rows !== prevRowsRef) {
			recomputeAugmentedRows();
		}
	});

	// Performance: store pointOverrides in state & recompute debounced
	let pointOverrides = $state<Record<string, string>>({});
	let pointOverrideComputing = $state(false);
	let pointOverrideTruncated = $state(false);
	let pointOverrideFrame: number | null = null;

	function schedulePointOverrideRecalc() {
		if (pointOverrideFrame != null) return;
		pointOverrideFrame = requestAnimationFrame(() => {
			pointOverrideFrame = null;
			recomputePointOverrides();
		});
	}

	function recomputePointOverrides() {
		pointOverrideComputing = true;
		const map: Record<string, string> = {};
		pointOverrideTruncated = false;

		// Quick exits
		if (
			!parsedRules.length ||
			!chanX ||
			(!chanY.length &&
				primaryMark !== 'scatter' &&
				primaryMark !== 'line' &&
				primaryMark !== 'bar')
		) {
			pointOverrides = {};
			pointOverrideComputing = false;
			return;
		}

		const rowCap =
			augmentedRows.length > STYLE_EVAL_ROW_LIMIT ? STYLE_EVAL_ROW_LIMIT : augmentedRows.length;
		pointOverrideTruncated =
			augmentedRows.length > STYLE_EVAL_TRUNCATE_NOTE_THRESHOLD && rowCap < augmentedRows.length;

		const validRules = parsedRules.filter((r) => r.parsed && !r.error);
		if (!validRules.length) {
			pointOverrides = {};
			pointOverrideComputing = false;
			return;
		}

		for (let i = 0; i < rowCap; i++) {
			const r = augmentedRows[i];
			const xVal = r[chanX];
			for (const rule of validRules) {
				let passes = false;
				try {
					const v = evalParsed(rule.parsed!, r);
					passes = !!(v && v !== 0);
				} catch {
					/* ignore evaluation errors per row */
				}
				if (!passes) continue;
				(chanY.length ? chanY : ['value']).forEach((seriesKey) => {
					const id = `s:${seriesKey}|x:${String(xVal)}`;
					// Do not overwrite earlier rule hit (first rule wins)
					if (!map[id]) map[id] = rule.color;
				});
			}
		}
		pointOverrides = map;
		pointOverrideComputing = false;
	}

	// Call schedule when core dependencies change (NOT on every drag)
	$effect(() => {
		// Only schedule when these change meaningfully
		chanX;
		chanY;
		primaryMark;
		schedulePointOverrideRecalc();
	});

	// Derived spec now uses efficient pointOverrides state
	const spec = $derived<ChartSpec>({
		// ...existing spec field calculations (unchanged)...
		mark: primaryMark,
		title: 'Advanced chart',
		legend: true,
		encoding: {
			x: chanX,
			y: chanY,
			color: chanColor,
			size: chanSize || undefined,
			tooltip: chanTooltip.length ? chanTooltip : undefined
		},
		transforms: {
			logX: logX || undefined,
			logY: logY || undefined
		},
		conditionalStyles: styleRules
			.filter((r) => r.expression.trim())
			.map((r) => ({ id: r.id, expression: r.expression, color: r.color })),
		computedFields: formulas.map((f) => ({ name: f.name, expression: f.expression })),
		options: {
			colors: {
				pointOverrides,
				mode: 'point'
			}
		}
	});

	// Remove old immediate chartRows binding (was causing redeclare)
	// const chartRows = augmentedRows;   // <-- removed

	// (Re‑add parseRaw used by Raw JSON textarea)
	function parseRaw() {
		try {
			const parsed = JSON.parse(jsonText) as ChartSpec;
			if (parsed.encoding?.x !== undefined) chanX = parsed.encoding.x;
			if (parsed.encoding?.y) chanY = parsed.encoding.y;
			if (parsed.encoding?.color !== undefined) chanColor = parsed.encoding.color;
			if (parsed.transforms) {
				logX = !!parsed.transforms.logX;
				logY = !!parsed.transforms.logY;
			}
			if (parsed.computedFields) {
				formulas = parsed.computedFields.map((cf) => ({
					id: crypto.randomUUID(),
					name: cf.name,
					expression: cf.expression
				}));
			}
			if (parsed.conditionalStyles) {
				styleRules = parsed.conditionalStyles.map((cs) => ({
					id: cs.id || crypto.randomUUID(),
					expression: cs.expression,
					color: cs.color || '#d62728'
				}));
			}
		} catch {
			/* silent */
		}
	}

	// Preview row limiting (large datasets cause slow initial render)
	const PREVIEW_ROW_LIMIT = 5000;
	let useFullData = $state(false);
	const isTruncated = $derived(augmentedRows.length > PREVIEW_ROW_LIMIT && !useFullData);

	// Single authoritative chartRows (use $derived.by to return array)
	const chartRows = $derived.by<Record<string, unknown>[]>(() =>
		isTruncated ? augmentedRows.slice(0, PREVIEW_ROW_LIMIT) : augmentedRows
	);

	// Add back channelErrors (was removed -> caused 'Cannot find name channelErrors')
	const channelErrors = $derived.by<string[]>(() => {
		const errs: string[] = [];
		if (!chanX) errs.push('X not set');
		if (!chanY.length) errs.push('Select at least one Y');
		for (const y of chanY) if (!headers.includes(y)) errs.push(`Column '${y}' not found`);
		if (chanX && !headers.includes(chanX)) errs.push(`Column '${chanX}' not found`);
		return errs;
	});

	// Throttled spec serialization / dispatch (avoid JSON.stringify on every pointOverrides change)
	let jsonText = $state('');
	let lastStructuralSpecKey = '';
	let pendingSpecFrame: number | null = null;

	// Undo/Redo stacks (store serialized spec snapshots)
	let undoStack = $state<string[]>([]);
	let redoStack = $state<string[]>([]);

	function pushHistory(snapshot: string) {
		// Avoid duplicates
		if (!undoStack.length || undoStack[undoStack.length - 1] !== snapshot) {
			undoStack = [...undoStack, snapshot];
			// cap history
			if (undoStack.length > 50) undoStack = undoStack.slice(undoStack.length - 50);
		}
		// changing spec invalidates redo stack
		redoStack = [];
	}

	function undo() {
		if (undoStack.length < 2) return; // need at least previous state
		const current = undoStack[undoStack.length - 1];
		const prev = undoStack[undoStack.length - 2];
		redoStack = [...redoStack, current];
		undoStack = undoStack.slice(0, undoStack.length - 1);
		loadFromJSON(prev, false);
	}

	function redo() {
		if (!redoStack.length) return;
		const nxt = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, redoStack.length - 1);
		undoStack = [...undoStack, nxt];
		loadFromJSON(nxt, false);
	}

	function exportConfig() {
		const blob = new Blob([jsonText], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'chart-spec.json';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	function handleImport(ev: Event) {
		const input = ev.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		file.text().then((txt) => {
			loadFromJSON(txt, true);
			input.value = '';
		});
	}

	function loadFromJSON(txt: string, pushHist: boolean) {
		try {
			const parsed = JSON.parse(txt) as ChartSpec;
			// Validate minimal structure
			if (!parsed || typeof parsed !== 'object' || !parsed.encoding) return;
			if (parsed.encoding.x !== undefined) chanX = parsed.encoding.x as any;
			if (Array.isArray(parsed.encoding.y)) chanY = [...parsed.encoding.y];
			chanColor = (parsed.encoding as any).color ?? null;
			chanSize = (parsed.encoding as any).size ?? null;
			chanTooltip = Array.isArray((parsed.encoding as any).tooltip)
				? [...((parsed.encoding as any).tooltip as string[])]
				: [];
			if (parsed.transforms) {
				logX = !!parsed.transforms.logX;
				logY = !!parsed.transforms.logY;
			}
			if (parsed.computedFields) {
				formulas = parsed.computedFields.map((cf) => ({
					id: crypto.randomUUID(),
					name: cf.name,
					expression: cf.expression
				}));
			}
			if (parsed.conditionalStyles) {
				styleRules = parsed.conditionalStyles.map((cs) => ({
					id: cs.id || crypto.randomUUID(),
					expression: cs.expression,
					color: cs.color || '#d62728'
				}));
			}
			jsonText = JSON.stringify(parsed, null, 2);
			if (pushHist) pushHistory(jsonText);
		} catch {
			/* ignore */
		}
	}

	function computeStructuralKey(s: ChartSpec) {
		return JSON.stringify({
			mark: s.mark,
			enc: s.encoding,
			logX: s.transforms?.logX,
			logY: s.transforms?.logY,
			formulas: s.computedFields?.length || 0,
			conds: s.conditionalStyles?.length || 0
		});
	}

	function queueSpecSync() {
		if (pendingSpecFrame != null) return;
		pendingSpecFrame = requestAnimationFrame(() => {
			pendingSpecFrame = null;
			const key = computeStructuralKey(spec);
			// Only re‑stringify full spec if structural key changed (pointOverrides alone can be huge)
			if (key !== lastStructuralSpecKey) {
				lastStructuralSpecKey = key;
				jsonText = JSON.stringify(spec, null, 2);
				pushHistory(jsonText);
			}
			dispatch('specChange', { spec });
		});
	}

	$effect(() => {
		// Depend on structural aspects + pointOverrides presence (length) only
		spec.mark;
		spec.encoding;
		spec.transforms;
		spec.computedFields;
		spec.conditionalStyles;
		Object.keys(pointOverrides).length;
		queueSpecSync();
	});

	// Column stats helper
	function statColumns() {
		const cols: string[] = [];
		if (chanX) cols.push(chanX);
		for (const y of chanY) if (!cols.includes(y)) cols.push(y);
		if (chanSize && !cols.includes(chanSize)) cols.push(chanSize);
		const out: { name: string; min?: number; max?: number; mean?: number; err?: string }[] = [];
		for (const c of cols) {
			const nums: number[] = [];
			for (const r of augmentedRows) {
				const v = r[c];
				const n =
					typeof v === 'number'
						? v
						: typeof v === 'string' && v.trim() !== '' && !isNaN(+v)
							? +v
							: null;
				if (n != null) nums.push(n);
			}
			if (!nums.length) {
				out.push({ name: c, err: 'non‑numeric' });
				continue;
			}
			const min = Math.min(...nums);
			const max = Math.max(...nums);
			const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
			out.push({ name: c, min: +min.toFixed(3), max: +max.toFixed(3), mean: +mean.toFixed(3) });
		}
		return out;
	}

	import { onDestroy } from 'svelte';
	onDestroy(() => {
		if (pendingSpecFrame != null) cancelAnimationFrame(pendingSpecFrame);
		if (pointOverrideFrame != null) cancelAnimationFrame(pointOverrideFrame);
	});
</script>

<div class="adv-layout">
	<aside class="panel card">
		<header class="hdr">
			<h3>Advanced builder</h3>
			<button class="secondary small" onclick={() => (showRaw = !showRaw)}
				>{showRaw ? 'GUI' : 'Raw JSON'}</button
			>
			<div class="hdr-actions">
				<button class="secondary small" type="button" onclick={undo} disabled={undoStack.length < 2}
					>Undo</button
				>
				<button class="secondary small" type="button" onclick={redo} disabled={!redoStack.length}
					>Redo</button
				>
				<button class="secondary small" type="button" onclick={exportConfig}>Export</button>
				<label class="import-btn secondary small">
					Import
					<input type="file" accept="application/json" onchange={handleImport} />
				</label>
			</div>
		</header>

		{#if !showRaw}
			<section>
				<h4>Data columns</h4>
				<div class="cols-list" role="list">
					{#each headers as h}
						<!-- div -> button for a11y, add role & key support automatically by button -->
						<button
							type="button"
							class="col-chip"
							draggable="true"
							ondragstart={(e) => onDragStart(e, h)}
							aria-label={`Column ${h} draggable`}>{h}</button
						>
					{/each}
				</div>
			</section>

			<section>
				<h4>Channels</h4>
				<div class="channels">
					<div class="channel">
						<span class="ch-label">X</span>
						<div
							class="dropzone"
							role="listbox"
							aria-label="X axis dropzone"
							ondragover={allowDrop}
							ondrop={dropX}
							tabindex="0"
						>
							{#if chanX}<span class="tag">{chanX}</span>{:else}<span class="placeholder"
									>Drop column</span
								>{/if}
						</div>
					</div>
					<div class="channel">
						<span class="ch-label">Y</span>
						<div
							class="dropzone multi"
							role="listbox"
							aria-label="Y axis dropzone"
							ondragover={allowDrop}
							ondrop={dropY}
							tabindex="0"
						>
							{#if chanY.length}
								{#each chanY as y}
									<!-- span -> button for a11y -->
									<button
										type="button"
										class="tag removable"
										title="Remove Y series"
										onclick={() => toggleY(y)}
										aria-label={`Remove ${y} from Y series`}>{y}</button
									>
								{/each}
							{:else}
								<span class="placeholder">Drop one or more</span>
							{/if}
						</div>
					</div>
					<div class="channel">
						<span class="ch-label">Color</span>
						<div
							class="dropzone"
							role="listbox"
							aria-label="Color channel dropzone"
							ondragover={allowDrop}
							ondrop={dropColor}
							tabindex="0"
						>
							{#if chanColor}<span class="tag">{chanColor}</span>{:else}<span class="placeholder"
									>Optional</span
								>{/if}
						</div>
					</div>
					<div class="channel">
						<span class="ch-label">Size</span>
						<div
							class="dropzone"
							role="listbox"
							aria-label="Size channel dropzone"
							ondragover={allowDrop}
							ondrop={dropSize}
							tabindex="0"
						>
							{#if chanSize}<span class="tag">{chanSize}</span>{:else}<span class="placeholder"
									>Optional</span
								>{/if}
						</div>
					</div>
					<div class="channel">
						<span class="ch-label">Tooltip</span>
						<div
							class="dropzone multi"
							role="listbox"
							aria-label="Tooltip channel dropzone"
							ondragover={allowDrop}
							ondrop={dropTooltip}
							tabindex="0"
						>
							{#if chanTooltip.length}
								{#each chanTooltip as t}
									<button
										type="button"
										class="tag removable"
										title="Remove tooltip column"
										onclick={() => removeTooltip(t)}>{t}</button
									>
								{/each}
							{:else}
								<span class="placeholder">Drop any</span>
							{/if}
						</div>
					</div>
				</div>
				<div class="chan-errors">
					{#each channelErrors as err}<span class="err">{err}</span>{/each}
				</div>
				{#if chanX || chanY.length || chanSize}
					<div class="stats-box">
						<h5>Column stats</h5>
						{#each statColumns() as s (s.name)}
							<div class="stat-row">
								<span class="sname">{s.name}</span>
								{#if s.err}
									<span class="err">{s.err}</span>
								{:else}
									<span class="sval">min {s.min}</span>
									<span class="sval">max {s.max}</span>
									<span class="sval">mean {s.mean}</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<section>
				<h4>Mark & transforms</h4>
				<div class="row">
					<label for="markSelect">Mark</label>
					<select id="markSelect" bind:value={primaryMark}>
						<option value="line">Line</option>
						<option value="scatter">Scatter</option>
						<option value="bar">Bar</option>
					</select>
				</div>
				<div class="row">
					<span class="ch-label" aria-hidden="true">Scale</span>
					<div class="toggles">
						<label><input type="checkbox" bind:checked={logX} /> log X</label>
						<label><input type="checkbox" bind:checked={logY} /> log Y</label>
					</div>
				</div>
			</section>

			<section>
				<h4>Computed fields</h4>
				<button class="secondary small" type="button" onclick={addFormula}>+ Add formula</button>
				{#if !formulas.length}<p class="hint">No formulas yet.</p>{/if}
				{#each formulas as f (f.id)}
					<div class="formula">
						<input
							class="fname"
							placeholder="name"
							bind:value={f.name}
							oninput={() => updateFormula(f)}
						/>
						<input
							class="fexpr"
							placeholder="expression e.g. log(Sales)/Population"
							bind:value={f.expression}
							oninput={() => updateFormula(f)}
						/>
						<button class="secondary small" type="button" onclick={() => removeFormula(f.id)}
							>✕</button
						>
						<div class="fmeta">
							{#if f.error}<span class="err">{f.error}</span>{:else if f.preview != null}<span
									class="ok">preview: {f.preview}</span
								>{/if}
						</div>
					</div>
				{/each}
			</section>

			<section>
				<h4>Conditional styling</h4>
				<button class="secondary small" type="button" onclick={addRule}>+ Add rule</button>
				{#if pointOverrideComputing}
					<p class="hint">Evaluating rules…</p>
				{:else if pointOverrideTruncated}
					<p class="hint">
						Styling evaluated on first {STYLE_EVAL_ROW_LIMIT} rows (dataset large). Results truncated
						for performance.
					</p>
				{/if}
				{#if !styleRules.length}<p class="hint">
						Add an expression returning non‑zero to color.
					</p>{/if}
				{#each styleRules as r (r.id)}
					<div class="rule">
						<input
							class="rexpr"
							placeholder="expression e.g. Sales > 1000"
							bind:value={r.expression}
							oninput={() => {
								/* trigger parse via state change */ styleRules = [...styleRules];
							}}
						/>
						<input type="color" class="rcolor" bind:value={r.color} />
						<button class="secondary small" type="button" onclick={() => removeRule(r.id)}>✕</button
						>
						{#if ruleErrors[r.id]}<span class="err">{ruleErrors[r.id]}</span>{/if}
					</div>
				{/each}
			</section>
		{:else}
			<section>
				<h4>Raw JSON spec</h4>
				<textarea class="raw" bind:value={jsonText} onchange={parseRaw} spellcheck="false"
				></textarea>
				<p class="hint">Editing JSON overwrites channel & formula state on save/blur.</p>
			</section>
		{/if}
	</aside>

	<section class="stage card">
		<h3>Preview</h3>
		{#if isTruncated}
			<p class="hint" style="margin-top:0;">
				Showed first {PREVIEW_ROW_LIMIT.toLocaleString()} of {augmentedRows.length.toLocaleString()}
				rows.
				<button type="button" class="secondary small" onclick={() => (useFullData = true)}
					>Load all</button
				>
			</p>
		{:else if augmentedRows.length > PREVIEW_ROW_LIMIT}
			<p class="hint" style="margin-top:0;">
				All {augmentedRows.length.toLocaleString()} rows loaded.
				{#if useFullData}
					<button type="button" class="secondary small" onclick={() => (useFullData = false)}
						>Preview only</button
					>
				{/if}
			</p>
		{/if}
		<div class="chart-area">
			<D3Chart {spec} rows={chartRows} width={800} height={500} interactionMode="zoom" />
		</div>
	</section>
</div>

<style>
	.adv-layout {
		display: flex;
		gap: 16px;
	}
	.panel {
		width: 420px;
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.hdr {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.hdr-actions {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.import-btn {
		position: relative;
		overflow: hidden;
		cursor: pointer;
	}
	.import-btn input[type='file'] {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.cols-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		max-height: 140px;
		overflow: auto;
	}
	.col-chip {
		/* changed from div to button: neutral button reset */
		border: 1px solid #d4dbe6;
		background: #f2f5fa;
		cursor: grab;
		font-size: 0.8rem;
		padding: 4px 8px;
		border-radius: 8px;
		user-select: none;
	}
	.col-chip:focus-visible {
		outline: 2px solid #4a90e2;
		outline-offset: 2px;
	}
	.channels {
		display: grid;
		gap: 10px;
	}
	.channel {
		position: relative;
	}
	.ch-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: #444;
		display: block;
		margin-bottom: 4px;
	}
	.dropzone {
		min-height: 38px;
		border: 2px dashed #c7cfdb;
		border-radius: 10px;
		padding: 6px;
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		background: #fff;
	}
	.dropzone.multi {
		min-height: 52px;
	}
	.placeholder {
		color: #888;
		font-size: 0.75rem;
	}
	.tag {
		background: #eef3ff;
		border: 1px solid #c3d5f5;
		padding: 4px 8px;
		border-radius: 8px;
		font-size: 0.75rem;
	}
	.tag.removable {
		background: #eef3ff;
		border: 1px solid #c3d5f5;
		padding: 4px 8px;
		font-size: 0.75rem;
		border-radius: 8px;
		cursor: pointer;
	}
	.tag.removable:hover,
	.tag.removable:focus-visible {
		background: #dce9ff;
	}
	.tag.removable {
		border: none;
	}
	.formula,
	.rule {
		display: grid;
		grid-template-columns: 110px 1fr auto;
		gap: 6px;
		align-items: center;
		background: #fafbfc;
		padding: 6px;
		border: 1px solid #e2e6ec;
		border-radius: 10px;
	}
	.rule {
		grid-template-columns: 1fr 60px auto;
	}
	.fexpr,
	.fname,
	.rexpr {
		border: 1px solid #d5dbe4;
		border-radius: 8px;
		padding: 4px 8px;
		font-size: 0.75rem;
	}
	.fexpr:focus,
	.fname:focus,
	.rexpr:focus {
		outline: none;
		border-color: #4a90e2;
	}
	.fmeta {
		grid-column: 1 / -1;
		font-size: 0.65rem;
		display: flex;
		gap: 6px;
	}
	.err {
		color: #b50303;
		font-weight: 500;
	}
	.ok {
		color: #1a6628;
	}
	.rcolor {
		width: 60px;
		height: 30px;
		padding: 0;
		border: 1px solid #d5dbe4;
		border-radius: 6px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.toggles {
		display: flex;
		gap: 14px;
		font-size: 0.8rem;
	}
	.hint {
		font-size: 0.7rem;
		color: #666;
		margin: 4px 0 0;
	}
	.raw {
		width: 100%;
		min-height: 320px;
		font-family: ui-monospace, monospace;
		border: 1px solid #ddd;
		border-radius: 10px;
		padding: 8px;
		font-size: 0.75rem;
		resize: vertical;
	}
	.chan-errors {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chart-area {
		border: 1px dashed #cfd6e4;
		border-radius: 12px;
		min-height: 420px;
		background: #f9fbff;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 8px;
	}
	button.small {
		font-size: 0.7rem;
		padding: 4px 8px;
	}
	/* Dropzone focus */
	.dropzone:focus-visible {
		outline: 2px solid #4a90e2;
		outline-offset: 2px;
	}
	.hint button.small,
	button.small.secondary {
		margin-left: 6px;
	}
	.stats-box {
		margin-top: 8px;
		background: #f6f8fb;
		border: 1px solid #e0e6ef;
		border-radius: 8px;
		padding: 6px 8px;
		font-size: 0.65rem;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.stats-box h5 {
		margin: 0 0 2px;
		font-size: 0.65rem;
		font-weight: 600;
		color: #445;
	}
	.stat-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: baseline;
	}
	.sname {
		font-weight: 600;
	}
	.sval {
		color: #333;
	}
</style>
