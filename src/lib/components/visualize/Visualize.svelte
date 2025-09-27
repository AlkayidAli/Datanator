<script lang="ts">
	import { currentProject, activeFileId } from '$lib/stores/project';
	import { filesState } from '$lib/stores/csvMulti';
	import type { ParsedCSV } from '$lib/stores/csvData';
	import { toasts } from '$lib/stores/toastStore';
	import { goto } from '$app/navigation';

	// Derived
	const data = $derived<ParsedCSV | null>(
		$activeFileId ? ($filesState[$activeFileId] ?? null) : null
	);
	const headers = $derived<string[]>(data ? data.headers : []);

	// Chart config state (you will implement later)
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

	// Placeholder actions
	function renderChart() {
		// TODO: You implement chart creation/rendering here (D3, Chart.js, ECharts, etc.)
		toasts.info('Chart rendering will be added later.');
	}
	function saveChartConfig() {
		// TODO: Persist chart configuration if needed
		toasts.success('Chart config saved (placeholder).');
	}
	function exportChartImage() {
		// TODO: Export chart as PNG/SVG
		toasts.warning('Export not implemented yet.');
	}
	function backToProjects() {
		// same behavior as CsvParser/DataLab
		activeFileId.set(null);
	}
</script>

{#if !$currentProject}
	<p>Select a project to continue.</p>
{:else if !$activeFileId || !data}
	<p>Open a dataset first (select a file tab), then come back to Visualization.</p>
{:else}
	<div class="viz">
		<div class="topbar">
			<button class="secondary" onclick={backToProjects} title="Back to projects">
				<span class="material-symbols-outlined">arrow_back</span>
				Projects
			</button>
			<button class="secondary" onclick={() => goto('/dataLab')}>
				<span class="material-symbols-outlined">functions</span>
				Data Lab
			</button>
		</div>

		<div class="layout">
			<aside class="controls">
				<h2>Visualization</h2>
				<p class="hint">Pick chart type and columns, then preview.</p>

				<section class="card">
					<h3>Chart</h3>
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
				</section>

				<section class="card">
					<h3>Data mapping</h3>
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

					<div class="actions">
						<button
							class="secondary"
							onclick={renderChart}
							disabled={!xAxis && chartType !== 'pie'}
						>
							Preview chart
						</button>
						<button onclick={saveChartConfig}>Save config</button>
						<button onclick={exportChartImage}>Export image</button>
					</div>
				</section>
			</aside>

			<section class="stage">
				<div class="card">
					<h3>Chart</h3>
					<div class="chart-area" role="img" aria-label="Chart placeholder">
						<!-- TODO: render chart here in later steps -->
						<div class="placeholder">
							<span class="material-symbols-outlined">insert_chart</span>
							<p>Chart will render here.</p>
						</div>
					</div>
					<small class="muted"
						>Rows: {data.rows.length} | Columns: {data.headers.length} • File: {data.filename}</small
					>
				</div>
			</section>
		</div>
	</div>
{/if}

<style>
	.viz {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.topbar {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.layout {
		display: flex;
		gap: 16px;
	}
	.controls {
		width: 360px;
		flex: 0 0 auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.stage {
		flex: 1 1 auto;
		min-width: 0;
	}

	.card {
		border: 1px solid #e6e6e6;
		border-radius: 12px;
		padding: 12px;
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	}
	h2 {
		margin: 0 0 4px;
	}
	h3 {
		margin: 0 0 8px;
		font-size: 1.05rem;
	}
	.hint,
	.muted {
		color: #666;
	}

	.row {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 8px 0;
	}
	.row > label {
		min-width: 110px;
		color: #333;
		font-weight: 500;
	}
	.inline {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}
	.size {
		display: inline-flex;
		align-items: center;
		gap: 6px;
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

	select,
	input {
		padding: 6px 10px;
		border: 1px solid #ddd;
		border-radius: 8px;
		background: #fff;
		color: #222;
		font-size: 0.95rem;
	}
	select:focus,
	input:focus {
		border-color: #4a90e2;
		outline: none;
	}

	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	button {
		cursor: pointer;
		width: fit-content;
	}
	button.secondary {
		min-height: 36px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		border-radius: 10px;
		padding: 6px 10px;
		border: 1px solid #e1e1e1;
		background: #fff;
	}
	.material-symbols-outlined {
		font-size: 20px;
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
	.placeholder {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		color: #567;
	}
</style>
