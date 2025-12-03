<script lang="ts">
	import { goto } from '$app/navigation';
	let { projects } = $props<{
		projects: Array<{
			project_id: string;
			name: string;
			updated_at: string;
			file_count: number;
			viz_count: number;
			preview: { columns: string[]; rows: any[][] } | null;
			recent_viz: Array<{
				viz_id: string;
				name: string;
				updated_at: string;
				thumbnail_mime?: string | null;
				mark?: string | null;
			}>;
		}>;
	}>();

	function openCsvPrep() {
		goto('/csvUploader');
	}
	function openDataLab() {
		goto('/dataLab');
	}
	function openVisualize() {
		goto('/visualize');
	}
</script>

<div class="home">
	<div class="head">
		<h1>Welcome back</h1>
		<div class="actions">
			<button class="primary" onclick={openCsvPrep}
				><span class="material-symbols-outlined">upload</span> CSV Prep</button
			>
			<button class="secondary" onclick={openDataLab}
				><span class="material-symbols-outlined">table</span> Data Lab</button
			>
			<button class="secondary" onclick={openVisualize}
				><span class="material-symbols-outlined">bar_chart</span> Visualize</button
			>
		</div>
	</div>

	{#if projects.length === 0}
		<div class="empty">
			<p>No projects yet.</p>
			<button class="primary" onclick={openCsvPrep}
				><span class="material-symbols-outlined">add</span> Create your first project</button
			>
		</div>
	{:else}
		<div class="grid">
			{#each projects as p}
				<div class="card">
					<div class="card-head">
						<h2>{p.name}</h2>
						<small class="muted">Updated {new Date(p.updated_at).toLocaleString()}</small>
					</div>

					<div class="stats">
						<div class="stat"><strong>{p.file_count}</strong><span>Files</span></div>
						<div class="stat"><strong>{p.viz_count}</strong><span>Visualizations</span></div>
					</div>

					<div class="preview">
						<div class="preview-title">Data preview</div>
						{#if p.preview}
							<div class="table">
								<div class="thead">
									{#each p.preview.columns as c}
										<div class="th">{c}</div>
									{/each}
								</div>
								{#each p.preview.rows as r}
									<div class="tr">
										{#each r as cell}
											<div class="td" title={String(cell ?? '')}>{cell}</div>
										{/each}
									</div>
								{/each}
							</div>
						{:else}
							<div class="no-data">No data yet</div>
						{/if}
					</div>

					<div class="viz">
						<div class="preview-title">Recent visualizations</div>
						{#if p.recent_viz.length}
							<div class="viz-row">
								{#each p.recent_viz as v}
									<div class="viz-chip" title={v.name}>
										<span class="material-symbols-outlined">
											{v.mark === 'bar'
												? 'bar_chart'
												: v.mark === 'line'
													? 'show_chart'
													: v.mark === 'scatter'
														? 'scatter_plot'
														: 'donut_large'}
										</span>
										<span class="name">{v.name}</span>
									</div>
								{/each}
							</div>
						{:else}
							<div class="no-data">No visualizations yet</div>
						{/if}
					</div>

					<div class="card-actions">
						<button onclick={openCsvPrep}
							><span class="material-symbols-outlined">upload</span> CSV Prep</button
						>
						<button onclick={openDataLab}
							><span class="material-symbols-outlined">table</span> Data Lab</button
						>
						<button onclick={openVisualize}
							><span class="material-symbols-outlined">bar_chart</span> Visualize</button
						>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.home {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(12, 1fr);
		gap: 12px;
	}
	.card {
		grid-column: span 12;
		border: 1px solid #e6e6e6;
		border-radius: 12px;
		padding: 12px;
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	@media (min-width: 880px) {
		.card {
			grid-column: span 6;
		}
	}
	@media (min-width: 1320px) {
		.card {
			grid-column: span 4;
		}
	}

	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.card-head h2 {
		margin: 0;
		font-size: 1.1rem;
	}
	.muted {
		color: #666;
	}

	.stats {
		display: flex;
		gap: 1rem;
	}
	.stat {
		display: flex;
		gap: 0.35rem;
		align-items: baseline;
	}
	.stat strong {
		font-size: 1.1rem;
	}
	.stat span {
		color: #666;
	}

	.preview-title {
		font-weight: 600;
		margin-bottom: 4px;
	}
	.table {
		border: 1px solid #eee;
		border-radius: 8px;
		overflow: hidden;
	}
	.thead,
	.tr {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}
	.th,
	.td {
		padding: 6px 8px;
		border-bottom: 1px solid #f2f2f2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.thead {
		background: #fafafa;
		font-weight: 600;
	}
	.tr:last-child .td {
		border-bottom: none;
	}
	.no-data {
		color: #777;
		font-style: italic;
	}

	.viz-row {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.viz-chip {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		padding: 6px 8px;
		border: 1px solid #eee;
		border-radius: 999px;
	}
	.viz-chip .name {
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>
