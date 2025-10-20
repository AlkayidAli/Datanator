<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import D3Chart from './D3Chart.svelte';
	import ChartTypePicker from './ChartTypePicker.svelte';
	import { parseExpression, tryEval, evalParsed } from '$lib/visualize/expr/eval';
	import type { ChartSpec, ChartMark } from '$lib/types/visualization';
	import { schemeTableau10 } from 'd3-scale-chromatic';
	import { exportSvgElement, type ExportFormat } from '$lib/utils/exportImage';
	import lineChartIcon from '$lib/components/common/line-chart-icon.webp';
	import scatterChartIcon from '$lib/components/common/scatter-plot-icon.webp';
	import barChartIcon from '$lib/components/common/column-chart-icon.webp';
	import pieChartIcon from '$lib/components/common/pie-diagram-icon.webp';
	import histogramChartIcon from '$lib/components/common/histogram-icon.webp';
	import areaChartIcon from '$lib/components/common/area-chart-icon.webp';
	import boxPlotIcon from '$lib/components/common/box-chart-icon.webp';
	import arcDiagramIcon from '$lib/components/common/arc-diagram-icon.webp';
	import scankeyChartIcon from '$lib/components/common/sankey-icon.webp';

	const dispatch = createEventDispatcher<{ specChange: { spec: ChartSpec | null } }>();

	let {
		headers,
		rows,
		exportToken = 0,
		exportName = 'chart',
		exportFormat = 'png' as ExportFormat
	} = $props<{
		headers: string[];
		rows: Record<string, unknown>[];
		exportToken?: number;
		exportName?: string;
		exportFormat?: ExportFormat;
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
	let jsonMenuOpen = $state(false);

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
		if (col && allColumns.includes(col)) chanX = col;
	}
	function dropColor(e: DragEvent) {
		e.preventDefault();
		const col = e.dataTransfer?.getData('text/plain');
		if (col && allColumns.includes(col)) chanColor = col;
	}
	function dropSize(e: DragEvent) {
		e.preventDefault();
		const col = e.dataTransfer?.getData('text/plain');
		if (col && allColumns.includes(col)) chanSize = col;
	}
	function dropTooltip(e: DragEvent) {
		e.preventDefault();
		const col = e.dataTransfer?.getData('text/plain');
		if (col && allColumns.includes(col)) {
			if (!chanTooltip.includes(col)) chanTooltip = [...chanTooltip, col];
		}
	}
	function removeTooltip(col: string) {
		chanTooltip = chanTooltip.filter((c) => c !== col);
	}
	function dropY(e: DragEvent) {
		e.preventDefault();
		const col = e.dataTransfer?.getData('text/plain');
		if (col && allColumns.includes(col)) toggleY(col);
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

	// Suggestions for expressions and rule editors
	const formulaNameId = (id: string) => `fname-${id}`;

	// Generate identifier-safe suggestions for formula names from available columns
	function toIdent(name: string) {
		let s = name.trim().replace(/[^A-Za-z0-9_]+/g, '_');
		if (!/^[A-Za-z_]/.test(s)) s = 'f_' + s;
		return s.replace(/_{2,}/g, '_');
	}
	const nameListId = `names-${crypto.randomUUID()}`;
	const nameSuggestions = $derived.by<string[]>(() => {
		const set = new Set<string>();
		for (const c of allColumns) set.add(toIdent(c));
		return Array.from(set);
	});

	// Derived list of valid computed column names (only those that parse)
	const computedColumnNames = $derived.by<string[]>(() =>
		parsedFormulas
			.filter(
				(pf) => !!pf.parsed && !pf.error && pf.name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(pf.name)
			)
			.map((pf) => pf.name)
	);
	// All columns available to the user: original headers + computed names
	const allColumns = $derived.by<string[]>(() => {
		const set = new Set<string>();
		for (const h of headers) set.add(h);
		for (const c of computedColumnNames) set.add(c);
		return Array.from(set);
	});

	// Suggestions popover state
	const funcSuggestions = ['log', 'ln', 'sqrt', 'abs', 'min', 'max', 'avg'] as const;
	const funcSet = new Set(funcSuggestions);
	let suggOpen = $state(false);
	let suggItems = $state<string[]>([]);
	let suggIndex = $state(0);
	let suggAnchor: HTMLInputElement | null = null;
	let suggPos = $state<{ left: number; top: number; width: number }>({
		left: 0,
		top: 0,
		width: 220
	});

	function getTokenRange(
		value: string,
		caret: number
	): { start: number; end: number; q: string } | null {
		const left = value.slice(0, caret);
		// Trigger on '{' or identifier tail
		const braceIdx = left.lastIndexOf('{');
		const identMatch = left.match(/[A-Za-z_][A-Za-z0-9_]*$/);
		if (braceIdx >= 0 && braceIdx === left.length - 1) {
			return { start: braceIdx, end: braceIdx + 1, q: '' };
		}
		if (identMatch) {
			const start = left.length - identMatch[0].length;
			return { start, end: left.length, q: identMatch[0] };
		}
		return null;
	}
	function openSuggest(input: HTMLInputElement) {
		suggAnchor = input;
		const rect = input.getBoundingClientRect();
		suggPos = { left: rect.left, top: rect.bottom + 4, width: rect.width };
		suggOpen = true;
		suggIndex = 0;
	}
	function closeSuggest() {
		suggOpen = false;
		suggItems = [];
		suggAnchor = null;
	}
	function updateSuggest(input: HTMLInputElement) {
		const caret = input.selectionStart ?? input.value.length;
		const tok = getTokenRange(input.value, caret);
		if (!tok) {
			closeSuggest();
			return;
		}
		const q = tok.q.toLowerCase();
		const colItems = allColumns.filter((c) => c.toLowerCase().includes(q));
		const fnItems = funcSuggestions.filter((f) => f.includes(q));
		const items = [...fnItems, ...colItems].slice(0, 50);
		if (!items.length) {
			closeSuggest();
			return;
		}
		suggItems = items;
		openSuggest(input);
	}
	function insertSuggestion(name: string) {
		if (!suggAnchor) return;
		const input = suggAnchor;
		const caret = input.selectionStart ?? input.value.length;
		const tok = getTokenRange(input.value, caret);
		if (!tok) return;
		const before = input.value.slice(0, tok.start);
		const after = input.value.slice(tok.end);
		const needsCloseBrace = input.value.slice(tok.start, tok.end) === '{';
		let insert = name;
		let caretDelta = 0;
		if (funcSet.has(name as any)) {
			insert = `${name}()`;
			caretDelta = -1; // place caret inside parentheses
		} else if (needsCloseBrace) {
			insert = `{${name}}`;
		}
		const next = before + insert + after;
		input.value = next;
		const newCaret = before.length + insert.length + caretDelta;
		input.setSelectionRange(newCaret, newCaret);
		// Fire input event to update bindings
		input.dispatchEvent(new Event('input', { bubbles: true }));
		closeSuggest();
	}
	function onExprInput(e: Event) {
		const el = e.target as HTMLInputElement;
		updateSuggest(el);
	}
	function onExprKeydown(e: KeyboardEvent) {
		if (!suggOpen) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			suggIndex = (suggIndex + 1) % Math.max(1, suggItems.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			suggIndex = (suggIndex - 1 + Math.max(1, suggItems.length)) % Math.max(1, suggItems.length);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (suggItems.length) insertSuggestion(suggItems[suggIndex]);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			closeSuggest();
		}
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
	let primaryMark = $state<ChartMark>('line');

	// Chart type picker modal
	let showTypePicker = $state(false);
	let pendingType = $state<ChartMark>('line');
	const chartTypes: Array<{
		id: ChartMark;
		name: string;
		short: string; // grid short desc
		long: string; // details longer desc
		img: string; // small thumb
		preview: string; // bigger preview image
		link: string;
	}> = [
		{
			id: 'line',
			name: 'Line chart',
			short: 'Trends over an ordered X axis.',
			long: 'Line charts show how a value changes across an ordered X axis, often time. Multiple series can be compared.',
			img: lineChartIcon,
			preview: lineChartIcon,
			link: 'https://www.data-to-viz.com/graph/line.html'
		},
		{
			id: 'scatter',
			name: 'Scatter plot',
			short: 'Relationship between two variables.',
			long: 'Scatter plots reveal relationships and patterns between two numeric variables. Size and color can encode more dimensions.',
			img: scatterChartIcon,
			preview: scatterChartIcon,
			link: 'https://www.data-to-viz.com/graph/scatter.html'
		},
		{
			id: 'bar',
			name: 'Bar chart',
			short: 'Compare values across categories.',
			long: 'Bar charts compare quantities across discrete categories. They can be grouped to compare multiple series per category.',
			img: barChartIcon,
			preview: barChartIcon,
			link: 'https://www.data-to-viz.com/graph/barplot.html'
		},
		{
			id: 'pie',
			name: 'Pie / Donut',
			short: 'Part-to-whole breakdown.',
			long: 'Pie and donut charts show how a total divides into parts by category. Use sparingly with clear labeling.',
			img: pieChartIcon,
			preview: pieChartIcon,
			link: 'https://www.data-to-viz.com/graph/pie.html'
		},
		{
			id: 'histogram',
			name: 'Histogram',
			short: 'Distribution of a numeric field.',
			long: 'Histograms show the distribution of a single numeric variable by binning values along the X axis.',
			img: histogramChartIcon,
			preview: histogramChartIcon,
			link: 'https://www.data-to-viz.com/graph/histogram.html'
		},
		{
			id: 'area',
			name: 'Area chart',
			short: 'Filled trends; stack to compare.',
			long: 'Area charts fill the space under a line. Stacked area charts compare part-to-whole over time or ordered X.',
			img: areaChartIcon,
			preview: areaChartIcon,
			link: 'https://www.data-to-viz.com/graph/area.html'
		},
		{
			id: 'boxplot',
			name: 'Box plot',
			short: 'Quartiles and outliers by category.',
			long: 'Box plots summarize distributions via median, quartiles, whiskers, and outliers across categories.',
			img: boxPlotIcon,
			preview: boxPlotIcon,
			link: 'https://www.data-to-viz.com/graph/boxplot.html'
		},
		{
			id: 'arc',
			name: 'Arc diagram',
			short: 'Connections as arcs along a line.',
			long: 'Arc diagrams place nodes on a line and draw arcs to show connections between them. Arc height can imply distance.',
			img: arcDiagramIcon,
			preview: arcDiagramIcon,
			link: 'https://www.data-to-viz.com/graph/arc.html'
		},
		{
			id: 'alluvial',
			name: 'Alluvial (Sankey)',
			short: 'Flows between categories.',
			long: 'Alluvial/Sankey diagrams visualize flow magnitudes between categories using link widths.',
			img: scankeyChartIcon,
			preview: scankeyChartIcon,
			link: 'https://www.data-to-viz.com/graph/sankey.html'
		}
	];
	function openTypePicker() {
		pendingType = primaryMark;
		showTypePicker = true;
	}
	function applyTypePicker() {
		primaryMark = pendingType;
		// Reset irrelevant channels when switching types to avoid confusing state
		if (primaryMark === 'histogram') {
			chanY = [];
			chanSize = null;
			chanColor = null;
		} else if (primaryMark === 'pie') {
			// keep X as category, expect single Y value
			if (chanY.length > 1) chanY = chanY.slice(0, 1);
		} else if (primaryMark === 'arc' || primaryMark === 'alluvial') {
			encSource = null;
			encTarget = null;
			encValue = null;
		}
		showTypePicker = false;
	}

	// Interaction mode: zoom / pan / none (parity with Easy tool)
	let interactionMode = $state<'zoom' | 'pan' | 'none'>('zoom');

	// Encoding customization: color mapping and size range
	let colorMap = $state<Record<string, string>>({});
	// Will compute categories from current rows for the selected color column
	const colorCategories = $derived.by<string[]>(() => {
		if (!chanColor) return [];
		const set = new Set<string>();
		for (const r of augmentedRows) {
			const v = r[chanColor];
			if (v == null) continue;
			const s = String(v);
			if (s) set.add(s);
		}
		return Array.from(set);
	});
	$effect(() => {
		if (!chanColor) {
			colorMap = {};
			return;
		}
		const next: Record<string, string> = {};
		const pal = schemeTableau10 as string[];
		colorCategories.forEach((cat, i) => {
			next[cat] = colorMap[cat] || pal[i % pal.length];
		});
		const a = Object.keys(colorMap);
		const b = Object.keys(next);
		if (a.length !== b.length || b.some((k) => colorMap[k] !== next[k])) {
			colorMap = next;
		}
	});
	function resetColorMap() {
		const pal = schemeTableau10 as string[];
		const next: Record<string, string> = {};
		colorCategories.forEach((cat, i) => (next[cat] = pal[i % pal.length]));
		colorMap = next;
	}

	// Size range controls for scatter when size channel is set
	let sizeMin = $state<number>(2);
	let sizeMax = $state<number>(12);
	$effect(() => {
		if (!chanSize) {
			sizeMin = 2;
			sizeMax = 12;
		} else {
			if (sizeMin < 1) sizeMin = 1;
			if (sizeMax <= sizeMin) sizeMax = sizeMin + 0.5;
		}
	});

	// Additional encodings for flow diagrams
	let encSource = $state<string | null>(null);
	let encTarget = $state<string | null>(null);
	let encValue = $state<string | null>(null);

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
					// Evaluate against the growing clone so formulas can reference prior computed fields
					const val = evalParsed(pf.parsed, clone);
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
			tooltip: chanTooltip.length ? chanTooltip : undefined,
			source: encSource || undefined,
			target: encTarget || undefined,
			value: encValue || undefined
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
				mode: 'point',
				categorical: chanColor
					? {
							field: chanColor,
							map: colorMap
						}
					: undefined
			},
			scatter: chanSize ? { sizeRange: [sizeMin, sizeMax] } : undefined
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
		switch (primaryMark) {
			case 'histogram':
				if (!chanX) errs.push('Field not set');
				if (chanX && !allColumns.includes(chanX)) errs.push(`Column '${chanX}' not found`);
				break;
			case 'pie':
				if (!chanX) errs.push('Category not set');
				if (!chanY.length) errs.push('Value not set');
				if (chanX && !allColumns.includes(chanX)) errs.push(`Column '${chanX}' not found`);
				if (chanY.length && !allColumns.includes(chanY[0]))
					errs.push(`Column '${chanY[0]}' not found`);
				break;
			case 'arc':
			case 'alluvial':
				if (!encSource) errs.push('Source not set');
				if (!encTarget) errs.push('Target not set');
				if (encSource && !allColumns.includes(encSource))
					errs.push(`Column '${encSource}' not found`);
				if (encTarget && !allColumns.includes(encTarget))
					errs.push(`Column '${encTarget}' not found`);
				if (encValue && !allColumns.includes(encValue)) errs.push(`Column '${encValue}' not found`);
				break;
			default:
				if (!chanX) errs.push('X not set');
				if (!chanY.length) errs.push('Select at least one Y');
				for (const y of chanY) if (!allColumns.includes(y)) errs.push(`Column '${y}' not found`);
				if (chanX && !allColumns.includes(chanX)) errs.push(`Column '${chanX}' not found`);
		}
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

	import { onMount, onDestroy } from 'svelte';
	onDestroy(() => {
		if (pendingSpecFrame != null) cancelAnimationFrame(pendingSpecFrame);
		if (pointOverrideFrame != null) cancelAnimationFrame(pointOverrideFrame);
	});
	// Auto width like Easy tool
	let chartAreaEl = $state<HTMLDivElement | null>(null);
	let autoWidth = $state<number | null>(null);
	let resizeObs: ResizeObserver | null = null;
	onMount(() => {
		if (chartAreaEl) {
			const apply = () => (autoWidth = chartAreaEl!.clientWidth);
			resizeObs = new ResizeObserver(apply);
			resizeObs.observe(chartAreaEl);
			apply();
		}
	});
	onDestroy(() => {
		if (resizeObs && chartAreaEl) resizeObs.unobserve(chartAreaEl);
	});

	// Render size
	const renderWidth = $derived<number>(autoWidth ?? 800);
	const renderHeight = 500;

	// Export on demand when exportToken changes (skip on initial mount)
	let _prevExportToken: number | null = null;
	$effect(() => {
		if (_prevExportToken === null) {
			_prevExportToken = exportToken;
			return;
		}
		if (exportToken === _prevExportToken) return;
		_prevExportToken = exportToken;
		// defer to next frame to ensure chart is rendered
		requestAnimationFrame(() => {
			const host = chartAreaEl as HTMLDivElement | null;
			if (!host) return;
			const svg = host.querySelector('svg');
			if (!svg) return;
			exportSvgElement(svg as SVGSVGElement, {
				filename: exportName || 'chart',
				format: exportFormat,
				scale: 2
			}).catch(() => {});
		});
	});
</script>

<div class="adv-layout">
	<aside class="panel card">
		<header class="hdr">
			<h3>Advanced builder</h3>
			<div class="hdr-actions">
				<button class="secondary small" type="button" onclick={undo} disabled={undoStack.length < 2}
					>Undo</button
				>
				<button class="secondary small" type="button" onclick={redo} disabled={!redoStack.length}
					>Redo</button
				>
				<div class="json-menu-wrap">
					<button
						class="secondary small"
						type="button"
						onclick={() => (jsonMenuOpen = !jsonMenuOpen)}>JSON</button
					>
					{#if jsonMenuOpen}
						<div class="json-menu" role="menu">
							<button
								type="button"
								role="menuitem"
								onclick={() => {
									showRaw = true;
									jsonMenuOpen = false;
								}}>Show JSON</button
							>
							<button
								type="button"
								role="menuitem"
								onclick={() => {
									exportConfig();
									jsonMenuOpen = false;
								}}>Export</button
							>
							<label class="import-btn">
								Import
								<input
									type="file"
									accept="application/json"
									onchange={(e) => {
										handleImport(e);
										jsonMenuOpen = false;
									}}
								/>
							</label>
						</div>
					{/if}
				</div>
			</div>
		</header>

		{#if !showRaw}
			<!-- Move Mark & transforms to the top for better UX -->
			<section class="group">
				<h4>Chart & transforms</h4>
				<div class="row">
					<div class="fake-label" aria-hidden="true">Type</div>
					<div class="type-chooser">
						<button class="secondary small" type="button" onclick={openTypePicker}>
							Choose chart type…
						</button>
						<span class="current-type">{primaryMark}</span>
					</div>
				</div>
				<div class="row">
					<div class="toggles">
						<label><input type="checkbox" bind:checked={logX} /> log X</label>
						<label><input type="checkbox" bind:checked={logY} /> log Y</label>
					</div>
				</div>
			</section>

			<hr />

			<section class="group">
				<h4>Data columns</h4>
				<div class="cols-list" role="list">
					{#each allColumns as h}
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

			<hr />

			<section class="group">
				<h4>Channels</h4>
				<div class="channels">
					<div class="channel">
						<span class="ch-label"
							>{primaryMark === 'pie'
								? 'Category'
								: primaryMark === 'histogram'
									? 'Field'
									: 'X'}</span
						>
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
					{#if primaryMark === 'histogram'}
						<!-- No Y for histogram -->
					{:else if primaryMark === 'pie' || primaryMark === 'boxplot'}
						<div class="channel">
							<span class="ch-label">{primaryMark === 'pie' ? 'Value' : 'Value (numeric)'}</span>
							<div
								class="dropzone"
								role="listbox"
								aria-label="Y value"
								ondragover={allowDrop}
								ondrop={(e) => {
									e.preventDefault();
									const col = e.dataTransfer?.getData('text/plain');
									if (col && allColumns.includes(col)) chanY = [col];
								}}
								tabindex="0"
							>
								{#if chanY.length}
									<button
										type="button"
										class="tag removable"
										title="Remove value"
										onclick={() => (chanY = [])}>{chanY[0]}</button
									>
								{:else}
									<span class="placeholder">Drop one</span>
								{/if}
							</div>
						</div>
					{:else if primaryMark === 'arc' || primaryMark === 'alluvial'}
						<div class="channel">
							<span class="ch-label">Source</span>
							<div
								class="dropzone"
								role="listbox"
								aria-label="Source dropzone"
								tabindex="0"
								ondragover={allowDrop}
								ondrop={(e) => {
									e.preventDefault();
									const col = e.dataTransfer?.getData('text/plain');
									if (col && allColumns.includes(col)) encSource = col;
								}}
							>
								{#if encSource}<span class="tag">{encSource}</span>{:else}<span class="placeholder"
										>Drop column</span
									>{/if}
							</div>
						</div>
						<div class="channel">
							<span class="ch-label">Target</span>
							<div
								class="dropzone"
								role="listbox"
								aria-label="Target dropzone"
								tabindex="0"
								ondragover={allowDrop}
								ondrop={(e) => {
									e.preventDefault();
									const col = e.dataTransfer?.getData('text/plain');
									if (col && allColumns.includes(col)) encTarget = col;
								}}
							>
								{#if encTarget}<span class="tag">{encTarget}</span>{:else}<span class="placeholder"
										>Drop column</span
									>{/if}
							</div>
						</div>
						<div class="channel">
							<span class="ch-label">Value (optional)</span>
							<div
								class="dropzone"
								role="listbox"
								aria-label="Value dropzone"
								tabindex="0"
								ondragover={allowDrop}
								ondrop={(e) => {
									e.preventDefault();
									const col = e.dataTransfer?.getData('text/plain');
									if (col && allColumns.includes(col)) encValue = col;
								}}
							>
								{#if encValue}<span class="tag">{encValue}</span>{:else}<span class="placeholder"
										>Drop column</span
									>{/if}
							</div>
						</div>
					{:else}
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
					{/if}
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
				{#if chanColor}
					<div class="encoding-box">
						<h5>Color mapping ({chanColor})</h5>
						{#if !colorCategories.length}
							<p class="hint">No categories found in {chanColor}.</p>
						{:else}
							<div class="color-map-list">
								{#each colorCategories as cat, i}
									<div class="row">
										<span class="cat-label" title={cat}>{cat}</span>
										<input
											type="color"
											value={colorMap[cat]}
											oninput={(e) =>
												(colorMap = { ...colorMap, [cat]: (e.target as HTMLInputElement).value })}
											aria-label={`Color for ${cat}`}
										/>
										<input
											class="hex"
											value={colorMap[cat]}
											oninput={(e) =>
												(colorMap = { ...colorMap, [cat]: (e.target as HTMLInputElement).value })}
										/>
									</div>
								{/each}
								<div class="row">
									<div class="fake-label" aria-hidden="true"></div>
									<button class="secondary small" type="button" onclick={resetColorMap}
										>Reset</button
									>
								</div>
							</div>
						{/if}
					</div>
				{/if}
				{#if chanSize}
					<div class="encoding-box">
						<h5>Size range ({chanSize})</h5>
						<div class="row">
							<label for="sizemin">Min radius</label>
							<input id="sizemin" type="number" min="1" max="50" step="0.5" bind:value={sizeMin} />
						</div>
						<div class="row">
							<label for="sizemax">Max radius</label>
							<input id="sizemax" type="number" min="1" max="120" step="0.5" bind:value={sizeMax} />
						</div>
						<p class="hint">Applies to scatter plots. Other marks ignore size range.</p>
					</div>
				{/if}
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

			<hr />

			<section class="group">
				<h4>Computed fields</h4>
				<button class="secondary small" type="button" onclick={addFormula}>+ Add formula</button>
				{#if !formulas.length}<p class="hint">No formulas yet.</p>{/if}
				{#each formulas as f (f.id)}
					<div class="formula">
						<input
							class="fname"
							placeholder="name"
							id={formulaNameId(f.id)}
							bind:value={f.name}
							oninput={() => updateFormula(f)}
						/>
						<input
							class="fexpr"
							placeholder="expression e.g. log(Sales)/Population"
							bind:value={f.expression}
							oninput={(e) => {
								updateFormula(f);
								onExprInput(e);
							}}
							onkeydown={onExprKeydown}
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

			<hr />

			<section class="group">
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
							oninput={(e) => {
								/* trigger parse via state change */ styleRules = [...styleRules];
								onExprInput(e);
							}}
							onkeydown={onExprKeydown}
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

	<!-- datalist removed in favor of popover suggestions -->

	{#if suggOpen}
		<div
			class="sugg-pop"
			style={`left:${suggPos.left}px; top:${suggPos.top}px; width:${suggPos.width}px;`}
			role="listbox"
			aria-label="Column suggestions"
		>
			{#each suggItems as it, i}
				<button
					type="button"
					role="option"
					aria-selected={i === suggIndex}
					class:active={i === suggIndex}
					onclick={() => insertSuggestion(it)}>{it}</button
				>
			{/each}
		</div>
	{/if}

	<section class="stage card">
		<h3>Preview</h3>
		<!-- Interaction mode toggle -->
		<div class="interaction-toggle" role="group" aria-label="Interaction mode">
			<button
				type="button"
				class:active={interactionMode === 'zoom'}
				title="Zoom: drag to select area, click to zoom in, double‑click to reset"
				aria-pressed={interactionMode === 'zoom'}
				onclick={() => (interactionMode = 'zoom')}
			>
				<span class="material-symbols-outlined">zoom_in</span>
			</button>
			<button
				type="button"
				class:active={interactionMode === 'pan'}
				title="Pan: drag to move the current zoomed view (keeps current zoom)"
				aria-pressed={interactionMode === 'pan'}
				onclick={() => (interactionMode = 'pan')}
			>
				<span class="material-symbols-outlined">pan_tool</span>
			</button>
			<button
				type="button"
				class:active={interactionMode === 'none'}
				title="Mouse: no zoom/pan, use clicks for color overrides (color mode: point)"
				aria-pressed={interactionMode === 'none'}
				onclick={() => (interactionMode = 'none')}
			>
				<span class="material-symbols-outlined">mouse</span>
			</button>
		</div>
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
		<div class="chart-area" bind:this={chartAreaEl}>
			<D3Chart
				{spec}
				rows={chartRows}
				width={renderWidth}
				height={renderHeight}
				{interactionMode}
			/>
		</div>
	</section>
</div>

<ChartTypePicker
	open={showTypePicker}
	value={primaryMark}
	{chartTypes}
	on:cancel={() => (showTypePicker = false)}
	on:confirm={(e) => {
		pendingType = e.detail.value as ChartMark;
		applyTypePicker();
	}}
/>

<style>
	h4 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 8px;
	}
	.adv-layout {
		display: flex;
		gap: 16px;
	}
	.panel {
		width: 400px;
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.card {
		border: 1px solid #e6e6e6;
		border-radius: 12px;
		padding: 12px;
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
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
	.json-menu-wrap {
		position: relative;
	}
	.json-menu {
		position: absolute;
		right: 0;
		top: 32px;
		background: #fff;
		border: 1px solid #e2e6ec;
		border-radius: 8px;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
		padding: 6px;
		display: grid;
		gap: 4px;
		z-index: 20;
		min-width: 140px;
	}
	.json-menu > button,
	.json-menu > label {
		border: none;
		background: transparent;
		text-align: left;
		padding: 6px 8px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
	}
	.json-menu > button:hover,
	.json-menu > label:hover {
		background: #eef3ff;
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
	.group {
		display: grid;
		gap: 8px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
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
	.stage {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		min-width: 0;
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
		width: 100%;
		box-sizing: border-box;
	}
	button.small {
		font-size: 1rem;
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
	.encoding-box {
		margin-top: 8px;
		background: #f6f8fb;
		border: 1px solid #e0e6ef;
		border-radius: 8px;
		padding: 8px;
	}
	.encoding-box h5 {
		margin: 0 0 6px;
		font-size: 0.7rem;
		font-weight: 600;
		color: #445;
	}
	.color-map-list .row {
		align-items: center;
	}
	.cat-label {
		min-width: 140px;
		max-width: 260px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	input.hex {
		width: 110px;
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
	/* Interaction toggle (parity with Easy tool) */
	.interaction-toggle {
		display: inline-flex;
		gap: 6px;
		margin: 0 0 8px;
		border: 1px solid #e2e2e2;
		padding: 4px 6px;
		border-radius: 10px;
		background: #fff;
	}
	.interaction-toggle > button {
		border: none;
		background: transparent;
		cursor: pointer;
		padding: 4px 6px;
		border-radius: 8px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #333;
	}
	.interaction-toggle > button.active {
		background: #eef3ff;
		color: #123;
		font-weight: 600;
	}
	.material-symbols-outlined {
		font-variation-settings:
			'FILL' 0,
			'wght' 500,
			'GRAD' 0,
			'opsz' 24;
		font-size: 20px;
		line-height: 1;
	}
	/* Suggestions popover */
	.sugg-pop {
		position: fixed;
		z-index: 9999;
		background: #fff;
		border: 1px solid #d8dfea;
		border-radius: 8px;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
		max-height: 240px;
		overflow: auto;
		font-size: 0.8rem;
	}
	.sugg-pop > button {
		padding: 6px 8px;
		cursor: pointer;
	}
	.sugg-pop > button:hover,
	.sugg-pop > button.active {
		background: #eef3ff;
	}

	/* Inputs match Easy */
	input {
		padding: 6px 10px;
		border: 1px solid #ddd;
		border-radius: 8px;
		background: #fff;
		color: #222;
	}
	input:focus {
		border-color: #4a90e2;
		outline: none;
	}

	/* Type chooser pill */
	.type-chooser {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.type-chooser .current-type {
		font-size: 0.85rem;
		color: #333;
		background: #f3f6fb;
		border: 1px solid #e0e6ef;
		padding: 4px 8px;
		border-radius: 8px;
	}

	/* Responsive stacking */
	@media (max-width: 1100px) {
		.adv-layout {
			flex-direction: column;
		}
		.panel {
			width: 100%;
		}
	}
</style>
