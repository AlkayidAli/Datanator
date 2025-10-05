<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import D3Chart from './D3Chart.svelte';
	import type { ChartSpec } from '$lib/types/visualization';
	import { onMount, onDestroy } from 'svelte';

	const dispatch = createEventDispatcher<{ specChange: { spec: ChartSpec } }>();

	let { headers, rows } = $props<{
		headers: string[];
		rows: Record<string, unknown>[];
	}>();

	// Simple config
	let chartType = $state<'line' | 'bar' | 'scatter' | 'pie' | 'area' | 'histogram'>('line');

	// Mappings
	let xAxis = $state<string | null>(null);
	let yAxes = $state<string[]>([]);

	// Pie/Hist fields
	let pieValue = $state<string | null>(null);
	let showLegend = $state(true);
	let title = $state('');
	let width = $state<number | ''>(''); // px
	let height = $state<number | ''>(''); // px

	// Visual options
	let xLabel = $state('');
	let yLabel = $state('');
	let paletteText = $state(''); // comma-separated colors

	// Axis tick rotation (needed for bind:value)
	let xTickRotate = $state<number>(0); // 0..90
	let yTickRotate = $state<number>(0); // 0..90

	// Line options
	let lineCurve = $state<'linear' | 'monotone' | 'step' | 'natural'>('linear');
	let lineStrokeWidth = $state<number>(2);

	// Scatter options
	let pointRadius = $state<number>(3.5);

	// Bar options
	let barOrientation = $state<'vertical' | 'horizontal'>('vertical');
	let barPadding = $state<number>(0.2);
	let barInnerPadding = $state<number>(0.05);

	// Pie options
	let pieInnerRatio = $state<number>(0);
	let piePadAngle = $state<number>(0);

	// Histogram options
	let histBins = $state<number>(20);

	// Series color overrides
	let seriesColors = $state<Record<string, string>>({});

	// Color mode
	let colorMode = $state<'series' | 'point'>('series'); // coloring strategy
	const supportsPointMode = $derived(chartType === 'scatter');

	function toggleY(h: string) {
		yAxes = yAxes.includes(h) ? yAxes.filter((c) => c !== h) : [...yAxes, h];
	}

	const isPie = $derived<boolean>(chartType === 'pie');
	const isHist = $derived<boolean>(chartType === 'histogram');

	// Normalize palette from paletteText
	const palette = $derived.by<string[] | undefined>(() => {
		const arr = paletteText
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		return arr.length ? arr : undefined;
	});

	// Palette helpers (fix TS errors)
	function addPaletteColor() {
		const arr = paletteText
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		arr.push('#1f77b4'); // default new color
		paletteText = arr.join(', ');
	}
	function updatePaletteColor(i: number, value: string) {
		const arr = paletteText
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (i >= 0 && i < arr.length) arr[i] = value;
		else arr.push(value);
		paletteText = arr.join(', ');
	}

	// Remove auto seeding, only prune removed keys
	$effect(() => {
		if (isPie || isHist) return;
		for (const k of Object.keys(seriesColors)) {
			if (!yAxes.includes(k)) delete seriesColors[k];
		}
	});

	// Default labels based on current mapping (only if user has not typed anything)
	$effect(() => {
		if (!xLabel && xAxis) xLabel = xAxis;
		if (isPie) {
			if (!xLabel && xAxis) xLabel = xAxis;
			if (!yLabel && pieValue) yLabel = pieValue;
		} else if (isHist) {
			if (!xLabel && xAxis) xLabel = xAxis;
			if (!yLabel) yLabel = 'Count';
		} else {
			if (!yLabel && yAxes.length > 0) yLabel = yAxes.join(', ');
		}
	});

	// Series fallback colors (used when user has not overridden)
	const defaultFallback = [
		'#1f77b4',
		'#ff7f0e',
		'#2ca02c',
		'#d62728',
		'#9467bd',
		'#8c564b',
		'#e377c2',
		'#7f7f7f',
		'#bcbd22',
		'#17becf'
	];
	function getSeriesFallbackColor(key: string, i: number) {
		// Prefer palette if provided, else defaultFallback
		const cols = palette && palette.length ? palette : defaultFallback;
		return cols[i % cols.length];
	}

	const spec = $derived<ChartSpec>({
		mark: chartType,
		title: title || undefined,
		legend: colorMode === 'point' ? false : showLegend,
		encoding: {
			x: isPie ? (xAxis ?? null) : isHist ? (xAxis ?? null) : xAxis,
			y: isPie ? (pieValue ? [pieValue] : []) : isHist ? [] : yAxes,
			color: null
		},
		size: {
			width: typeof width === 'number' && width > 0 ? width : undefined,
			height: typeof height === 'number' && height > 0 ? height : undefined
		},
		options: {
			axisLabels: {
				x: xLabel || undefined,
				y: yLabel || undefined
			},
			axis: {
				xTickRotate,
				yTickRotate
			},
			palette,
			line: {
				curve: lineCurve,
				strokeWidth: lineStrokeWidth
			},
			scatter: {
				radius: pointRadius
			},
			bar: {
				orientation: barOrientation,
				padding: barPadding,
				innerPadding: barInnerPadding
			},
			pie: {
				innerRatio: pieInnerRatio,
				padAngle: piePadAngle
			},
			histogram: {
				bins: histBins
			},
			colors: {
				series: seriesColors,
				mode: colorMode
			}
		} as Record<string, unknown>
	});

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

	const renderWidth = $derived<number>(
		// explicit width from spec if provided, else observed container width, else fallback
		spec.size?.width ?? autoWidth ?? 800
	);
	const renderHeight = $derived<number>(spec.size?.height ?? 500);

	$effect(() => {
		dispatch('specChange', { spec });
	});
</script>

<div class="layout">
	<aside class="controls card">
		<h3>Easy mode</h3>

		<section class="group">
			<h4>Chart</h4>
			<div class="row">
				<label for="chart-type">Type</label>
				<select id="chart-type" bind:value={chartType}>
					<option value="line">Line</option>
					<option value="bar">Bar</option>
					<option value="scatter">Scatter</option>
					<option value="pie">Pie</option>
					<option value="histogram">Histogram</option>
				</select>
			</div>
		</section>

		<hr />

		<section class="group">
			<h4>Data mapping</h4>
			{#if isPie}
				<div class="row">
					<label for="pie-cat">Category</label>
					<select id="pie-cat" bind:value={xAxis}>
						<option value={null as any} disabled selected>Select column</option>
						{#each headers as h}<option value={h}>{h}</option>{/each}
					</select>
				</div>
				<div class="row">
					<label for="pie-val">Value</label>
					<select id="pie-val" bind:value={pieValue}>
						<option value={null as any} disabled selected>Select numeric column</option>
						{#each headers as h}<option value={h}>{h}</option>{/each}
					</select>
				</div>
			{:else if isHist}
				<div class="row">
					<label for="hist-field">Field</label>
					<select id="hist-field" bind:value={xAxis}>
						<option value={null as any} disabled selected>Select numeric column</option>
						{#each headers as h}<option value={h}>{h}</option>{/each}
					</select>
				</div>
			{:else}
				<div class="row">
					<label for="x-axis">X axis</label>
					<select id="x-axis" bind:value={xAxis}>
						<option value={null as any} disabled selected>Select column</option>
						{#each headers as h}<option value={h}>{h}</option>{/each}
					</select>
				</div>

				<div class="row">
					<label for="y-axis">Y axis</label>
					<div class="cols" id="y-axis">
						{#each headers as h}
							<label class="chk">
								<input type="checkbox" checked={yAxes.includes(h)} onchange={() => toggleY(h)} />
								<span>{h}</span>
							</label>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<hr />

		<section class="group">
			<h4>Appearance</h4>

			<div class="row">
				<label for="title">Title</label>
				<input id="title" bind:value={title} placeholder="Chart title" />
			</div>

			<div class="row">
				<label for="size-w">Size</label>
				<div class="size">
					<input
						id="size-w"
						type="number"
						min="200"
						step="20"
						bind:value={width}
						placeholder="Width"
					/>
					<span>×</span>
					<input type="number" min="150" step="20" bind:value={height} placeholder="Height" />
				</div>
			</div>

			<div class="row">
				<label for="x-label">X label</label>
				<input id="x-label" bind:value={xLabel} placeholder="Optional" />
			</div>
			<div class="row">
				<label for="y-label">Y label</label>
				<input id="y-label" bind:value={yLabel} placeholder="Optional" />
			</div>

			<div class="row">
				<label for="legend-toggle">Legend</label>
				<input id="legend-toggle" type="checkbox" bind:checked={showLegend} />
			</div>

			<div class="row">
				<label for="palette-label">Palette</label>
				<div class="palette" aria-labelledby="palette-label" id="palette-label">
					{#each palette ?? [] as col, i}
						<label class="swatch">
							<input
								type="color"
								value={col}
								oninput={(e: any) => updatePaletteColor(i, e.target.value)}
								aria-label={`Palette color ${i + 1}`}
							/>
							<span style={`--c:${col}`}></span>
						</label>
					{/each}
					<button class="secondary small" type="button" onclick={addPaletteColor}>+ Add</button>
				</div>
			</div>

			<div class="row">
				<label for="xrot">X tick rotate</label>
				<select id="xrot" bind:value={xTickRotate}>
					<option value={0}>0</option>
					<option value={45}>45</option>
					<option value={90}>90</option>
				</select>
			</div>
			<div class="row">
				<label for="yrot">Y tick rotate</label>
				<select id="yrot" bind:value={yTickRotate}>
					<option value={0}>0</option>
					<option value={45}>45</option>
					<option value={90}>90</option>
				</select>
			</div>

			<div class="row">
				<label for="color-mode">Color mode</label>
				<select
					id="color-mode"
					bind:value={colorMode}
					disabled={!supportsPointMode}
					title={supportsPointMode
						? 'Choose how colors are assigned'
						: 'Point coloring only available for scatter'}
				>
					<option value="series">By series</option>
					<option value="point">Each point</option>
				</select>
			</div>
		</section>

		{#if !isPie && !isHist && colorMode === 'series'}
			<hr />
			<section class="group">
				<h4>Series colors</h4>
				{#if yAxes.length === 0}
					<p class="hint">Choose at least one Y axis to customize colors.</p>
				{:else}
					{#each yAxes as key, i}
						<div class="row">
							<label for={`series-${i}-hex`}>{key}</label>
							<input
								id={`series-${i}-color`}
								type="color"
								value={seriesColors[key] ?? getSeriesFallbackColor(key, i)}
								oninput={(e) => (seriesColors[key] = (e.target as HTMLInputElement).value)}
							/>
							<input
								id={`series-${i}-hex`}
								class="hex"
								value={seriesColors[key] ?? getSeriesFallbackColor(key, i)}
								oninput={(e) => (seriesColors[key] = (e.target as HTMLInputElement).value)}
							/>
						</div>
					{/each}
					<small class="hint"
						>Palette provides default colors. Changing a color creates an override.</small
					>
				{/if}
			</section>
		{/if}

		{#if chartType === 'line'}
			<hr />
			<section class="group">
				<h4>Line</h4>
				<div class="row">
					<label for="curve">Curve</label>
					<select id="curve" bind:value={lineCurve}>
						<option value="linear">Linear</option>
						<option value="monotone">Monotone</option>
						<option value="step">Step</option>
						<option value="natural">Natural</option>
					</select>
				</div>
				<div class="row">
					<label for="lw">Stroke</label>
					<input id="lw" type="number" min="1" max="8" step="0.5" bind:value={lineStrokeWidth} />
				</div>
			</section>
		{:else if chartType === 'scatter'}
			<hr />
			<section class="group">
				<h4>Scatter</h4>
				<div class="row">
					<label for="pr">Point size</label>
					<input id="pr" type="number" min="1" max="12" step="0.5" bind:value={pointRadius} />
				</div>
			</section>
		{:else if chartType === 'bar'}
			<hr />
			<section class="group">
				<h4>Bar</h4>
				<div class="row">
					<label for="orient">Orientation</label>
					<select id="orient" bind:value={barOrientation}>
						<option value="vertical">Vertical</option>
						<option value="horizontal">Horizontal</option>
					</select>
				</div>
				<div class="row">
					<label for="bp">Outer padding</label>
					<input id="bp" type="number" min="0" max="0.5" step="0.05" bind:value={barPadding} />
				</div>
				<div class="row">
					<label for="bip">Inner padding</label>
					<input
						id="bip"
						type="number"
						min="0"
						max="0.5"
						step="0.05"
						bind:value={barInnerPadding}
					/>
				</div>
			</section>
		{:else if chartType === 'pie'}
			<hr />
			<section class="group">
				<h4>Pie</h4>
				<div class="row">
					<label for="ir">Inner ratio</label>
					<input id="ir" type="number" min="0" max="0.9" step="0.05" bind:value={pieInnerRatio} />
				</div>
				<div class="row">
					<label for="pa">Pad angle</label>
					<input id="pa" type="number" min="0" max="0.3" step="0.01" bind:value={piePadAngle} />
				</div>
			</section>
		{:else if chartType === 'histogram'}
			<hr />
			<section class="group">
				<h4>Histogram</h4>
				<div class="row">
					<label for="bins">Bins</label>
					<input id="bins" type="number" min="5" max="100" step="1" bind:value={histBins} />
				</div>
			</section>
		{/if}
	</aside>

	<section class="stage card">
		<h3>Chart</h3>
		<div class="chart-area" bind:this={chartAreaEl}>
			<D3Chart {spec} {rows} width={renderWidth} height={renderHeight} />
		</div>
	</section>
</div>

<style>
	.layout {
		display: flex;
		gap: 16px;
	}
	.controls {
		width: 400px;
		flex: 0 0 auto;
	}
	.card {
		border: 1px solid #e6e6e6;
		border-radius: 12px;
		padding: 12px;
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	}
	.group {
		display: grid;
		gap: 8px;
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.row > label {
		min-width: 110px;
		font-weight: 500;
		color: #333;
	}
	.size {
		display: inline-flex;
		gap: 6px;
		align-items: center;
	}
	.palette {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.swatch {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.swatch > span {
		width: 20px;
		height: 20px;
		border-radius: 4px;
		border: 1px solid #ddd;
		background: var(--c);
		display: inline-block;
	}
	input.hex {
		width: 110px;
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
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 8px;
		box-sizing: border-box;
	}
	select,
	input {
		padding: 6px 10px;
		border: 1px solid #ddd;
		border-radius: 8px;
		background: #fff;
		color: #222;
	}
	select:focus,
	input:focus {
		border-color: #4a90e2;
		outline: none;
	}
</style>
