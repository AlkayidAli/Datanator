<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import D3Chart from './D3Chart.svelte';
	import type { ChartSpec } from '$lib/types/visualization';

	const dispatch = createEventDispatcher<{ specChange: { spec: ChartSpec } }>();

	let { headers, rows } = $props<{
		headers: string[];
		rows: Record<string, unknown>[];
	}>();

	// Simple config
	let chartType = $state<'line' | 'bar' | 'scatter' | 'pie' | 'area' | 'histogram'>('line');
	let xAxis = $state<string | null>(null);
	let yAxes = $state<string[]>([]);
	let colorBy = $state<string | null>(null);
	let groupBy = $state<string | null>(null);
	let showLegend = $state(true);
	let title = $state('');
	let width = $state<number | ''>('');
	let height = $state<number | ''>('');

	function toggleY(h: string) {
		yAxes = yAxes.includes(h) ? yAxes.filter((c) => c !== h) : [...yAxes, h];
	}

	const spec = $derived<ChartSpec>({
		mark: chartType,
		title: title || undefined,
		legend: showLegend,
		encoding: {
			x: xAxis,
			y: yAxes,
			color: colorBy,
			groupBy
		},
		size: {
			width: typeof width === 'number' && width > 0 ? width : undefined,
			height: typeof height === 'number' && height > 0 ? height : undefined
		},
		options: {}
	});

	const renderWidth = $derived<number>(spec.size?.width ?? 800);
	const renderHeight = $derived<number>(spec.size?.height ?? 500);

	$effect(() => {
		dispatch('specChange', { spec });
	});
</script>

<div class="layout">
	<aside class="controls card">
		<h3>Easy mode</h3>
		<div class="row">
			<label for="chart-type">Type</label>
			<select id="chart-type" bind:value={chartType}>
				<option value="line">Line</option>
				<option value="bar">Bar</option>
				<option value="scatter">Scatter</option>
				<option value="pie">Pie</option>
				<option value="area">Area</option>
				<option value="histogram">Histogram</option>
			</select>
		</div>

		<div class="row">
			<label for="title">Title</label>
			<input id="title" bind:value={title} placeholder="Optional" />
		</div>

		<div class="row">
			<label for="size-w">Size</label>
			<div class="size">
				<input
					id="size-w"
					type="number"
					min="100"
					step="10"
					bind:value={width}
					placeholder="Width"
				/>
				<span>×</span>
				<input type="number" min="100" step="10" bind:value={height} placeholder="Height" />
			</div>
		</div>

		<label class="inline">
			<input type="checkbox" bind:checked={showLegend} />
			Show legend
		</label>

		<hr />

		<h4>Data mapping</h4>
		<div class="row">
			<label for="x-axis">X axis</label>
			<select id="x-axis" bind:value={xAxis}>
				<option value={null as any} disabled selected>Select column</option>
				{#each headers as h}<option value={h}>{h}</option>{/each}
			</select>
		</div>

		<div class="row">
			<label>Y axis</label>
			<div class="cols">
				{#each headers as h}
					<label class="chk">
						<input type="checkbox" checked={yAxes.includes(h)} onchange={() => toggleY(h)} />
						<span>{h}</span>
					</label>
				{/each}
			</div>
		</div>

		<div class="row">
			<label for="color-by">Color by</label>
			<select id="color-by" bind:value={colorBy}>
				<option value={null as any} selected>None</option>
				{#each headers as h}<option value={h}>{h}</option>{/each}
			</select>
		</div>

		<div class="row">
			<label for="group-by">Group by</label>
			<select id="group-by" bind:value={groupBy}>
				<option value={null as any} selected>None</option>
				{#each headers as h}<option value={h}>{h}</option>{/each}
			</select>
		</div>
	</aside>

	<section class="stage card">
		<h3>Chart</h3>
		<div class="chart-area">
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
		width: 360px;
		flex: 0 0 auto;
	}
	.card {
		border: 1px solid #e6e6e6;
		border-radius: 12px;
		padding: 12px;
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 8px 0;
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
	.chart-area {
		border: 1px dashed #cfd6e4;
		border-radius: 12px;
		min-height: 420px;
		background: #f9fbff;
		display: flex;
		align-items: center;
		justify-content: center;
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
