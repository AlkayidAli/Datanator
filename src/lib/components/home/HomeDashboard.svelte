<script lang="ts">
	import { goto } from '$app/navigation';
	let { projects } = $props<{
		projects: Array<{
			project_id: string;
			name: string;
			created_at: string;
			updated_at: string;
			file_count: number;
			viz_count: number;
			files: Array<{
				file_id: string;
				name: string;
				original_filename: string | null;
				updated_at: string;
			}>;
			preview: { columns: string[]; rows: any[][] } | null;
			recent_viz: Array<{
				viz_id: string;
				name: string;
				description?: string | null;
				title?: string | null;
				updated_at: string;
				thumbnail_mime?: string | null;
				mark?: string | null;
				file_name?: string | null;
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

	function getChartIcon(mark: string | null): string {
		const icons: Record<string, string> = {
			bar: 'bar_chart',
			line: 'show_chart',
			scatter: 'scatter_plot',
			pie: 'donut_large',
			area: 'area_chart',
			histogram: 'bar_chart',
			boxplot: 'candlestick_chart',
			arc: 'donut_large',
			alluvial: 'account_tree'
		};
		return icons[mark ?? ''] ?? 'insert_chart';
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 7) return `${diffDays}d ago`;
		return date.toLocaleDateString();
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
			<div class="empty-content">
				<span class="material-symbols-outlined empty-icon">folder_open</span>
				<h2>No projects yet</h2>
				<p>Create your first project to start analyzing and visualizing data</p>
				<button class="primary" onclick={openCsvPrep}>
					<span class="material-symbols-outlined">add</span> Create Project
				</button>
			</div>
		</div>
	{:else}
		<div class="projects-list">
			{#each projects as p}
				<div class="project-card">
					<!-- Project Header -->
					<div class="project-header">
						<div class="project-title">
							<h2>{p.name}</h2>
							<div class="project-meta">
								<span class="meta-item">
									<span class="material-symbols-outlined">schedule</span>
									Updated {formatDate(p.updated_at)}
								</span>
								<span class="meta-item">
									<span class="material-symbols-outlined">insert_drive_file</span>
									{p.file_count}
									{p.file_count === 1 ? 'file' : 'files'}
								</span>
								<span class="meta-item">
									<span class="material-symbols-outlined">bar_chart</span>
									{p.viz_count}
									{p.viz_count === 1 ? 'visualization' : 'visualizations'}
								</span>
							</div>
						</div>
						<div class="project-actions">
							<button class="secondary" onclick={openCsvPrep}>
								<span class="material-symbols-outlined">upload</span> CSV Prep
							</button>
							<button class="secondary" onclick={openDataLab}>
								<span class="material-symbols-outlined">table</span> Data Lab
							</button>
							<button class="secondary" onclick={openVisualize}>
								<span class="material-symbols-outlined">bar_chart</span> Visualize
							</button>
						</div>
					</div>

					<!-- Project Content Grid -->
					<div class="project-content">
						<!-- Files Section -->
						<div class="section files-section">
							<h3 class="section-title">
								<span class="material-symbols-outlined">folder</span>
								Files
							</h3>
							{#if p.files.length > 0}
								<div class="files-list">
									{#each p.files.slice(0, 5) as file}
										<div class="file-item">
											<span class="material-symbols-outlined">insert_drive_file</span>
											<div class="file-info">
												<div class="file-name">{file.name}</div>
												<div class="file-date">{formatDate(file.updated_at)}</div>
											</div>
										</div>
									{/each}
									{#if p.files.length > 5}
										<div class="more-indicator">+{p.files.length - 5} more files</div>
									{/if}
								</div>
							{:else}
								<div class="no-data">No files yet</div>
							{/if}
						</div>

						<!-- Data Preview Section -->
						<div class="section preview-section">
							<h3 class="section-title">
								<span class="material-symbols-outlined">table_view</span>
								Data Preview
								{#if p.files.length > 0}
									<span class="preview-source">({p.files[0].name})</span>
								{/if}
							</h3>
							{#if p.preview}
								<div class="data-table">
									<div class="table-header">
										{#each p.preview.columns as col}
											<div class="table-cell header">{col}</div>
										{/each}
									</div>
									{#each p.preview.rows as row}
										<div class="table-row">
											{#each row as cell}
												<div class="table-cell" title={String(cell ?? '')}>{cell ?? ''}</div>
											{/each}
										</div>
									{/each}
								</div>
							{:else}
								<div class="no-data">No data preview available</div>
							{/if}
						</div>

						<!-- Visualizations Section -->
						<div class="section viz-section">
							<h3 class="section-title">
								<span class="material-symbols-outlined">insert_chart</span>
								Recent Visualizations
							</h3>
							{#if p.recent_viz.length > 0}
								<div class="viz-list">
									{#each p.recent_viz as viz}
										<div class="viz-card">
											<div class="viz-header">
												<span class="material-symbols-outlined viz-icon">
													{getChartIcon(viz.mark)}
												</span>
												<div class="viz-info">
													<div class="viz-name">{viz.title || viz.name}</div>
													{#if viz.mark}
														<span class="viz-type">{viz.mark}</span>
													{/if}
												</div>
											</div>
											{#if viz.description}
												<div class="viz-description">{viz.description}</div>
											{/if}
											<div class="viz-meta">
												{#if viz.file_name}
													<span class="viz-file">
														<span class="material-symbols-outlined">dataset</span>
														{viz.file_name}
													</span>
												{/if}
												<span class="viz-date">{formatDate(viz.updated_at)}</span>
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div class="no-data">No visualizations yet</div>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.home {
		padding: 1.5rem;
		max-width: 1600px;
		margin: 0 auto;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
		flex-wrap: wrap;

		h1 {
			margin: 0;
			font-size: 2rem;
			font-weight: 600;
		}
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 400px;
		padding: 3rem;
	}

	.empty-content {
		text-align: center;
		max-width: 400px;

		.empty-icon {
			font-size: 4rem;
			color: #ccc;
			margin-bottom: 1rem;
		}

		h2 {
			margin: 0 0 0.5rem 0;
			color: #666;
		}

		p {
			margin: 0 0 1.5rem 0;
			color: #999;
		}
	}

	.projects-list {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.project-card {
		border: 1px solid #e6e6e6;
		border-radius: 16px;
		background: #fff;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
		overflow: hidden;
		transition: box-shadow 0.2s ease;

		&:hover {
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
		}
	}

	.project-header {
		padding: 1.5rem;
		background: linear-gradient(135deg, #fafafa 0%, #fff 100%);
		border-bottom: 1px solid #e6e6e6;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.project-title {
		flex: 1;
		min-width: 250px;

		h2 {
			margin: 0 0 0.75rem 0;
			font-size: 1.5rem;
			font-weight: 600;
		}
	}

	.project-meta {
		display: flex;
		gap: 1.5rem;
		flex-wrap: wrap;
	}

	.meta-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: #666;
		font-size: 0.9rem;

		.material-symbols-outlined {
			font-size: 18px;
			color: #999;
		}
	}

	.project-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.project-content {
		padding: 1.5rem;
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;

		@media (min-width: 1024px) {
			grid-template-columns: 300px 1fr;
			grid-template-rows: auto auto;
		}
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.files-section {
		@media (min-width: 1024px) {
			grid-row: 1 / 3;
		}
	}

	.section-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #333;

		.material-symbols-outlined {
			font-size: 20px;
			color: #666;
		}

		.preview-source {
			font-size: 0.85rem;
			font-weight: 400;
			color: #999;
		}
	}

	.files-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.file-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: #fafafa;
		border: 1px solid #eee;
		border-radius: 8px;
		transition: background 0.15s ease;

		&:hover {
			background: #f5f5f5;
		}

		.material-symbols-outlined {
			font-size: 20px;
			color: #999;
		}
	}

	.file-info {
		flex: 1;
		min-width: 0;
	}

	.file-name {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-date {
		font-size: 0.85rem;
		color: #999;
		margin-top: 0.15rem;
	}

	.more-indicator {
		padding: 0.5rem 0.75rem;
		text-align: center;
		color: #666;
		font-size: 0.9rem;
		font-style: italic;
	}

	.data-table {
		border: 1px solid #e6e6e6;
		border-radius: 8px;
		overflow: auto;
		background: #fff;
	}

	.table-header,
	.table-row {
		display: grid;
		grid-template-columns: repeat(5, minmax(120px, 1fr));
	}

	.table-cell {
		padding: 0.75rem;
		border-bottom: 1px solid #f2f2f2;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;

		&.header {
			background: #fafafa;
			font-weight: 600;
			color: #333;
			border-bottom: 2px solid #e6e6e6;
		}
	}

	.table-row:last-child .table-cell {
		border-bottom: none;
	}

	.viz-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.viz-card {
		padding: 1rem;
		background: #fafafa;
		border: 1px solid #eee;
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		transition: all 0.2s ease;

		&:hover {
			background: #fff;
			border-color: #ddd;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
		}
	}

	.viz-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.viz-icon {
		font-size: 28px;
		color: #666;
		flex-shrink: 0;
	}

	.viz-info {
		flex: 1;
		min-width: 0;
	}

	.viz-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.viz-type {
		display: inline-block;
		margin-top: 0.25rem;
		padding: 0.15rem 0.5rem;
		background: #fff;
		border: 1px solid #e6e6e6;
		border-radius: 4px;
		font-size: 0.75rem;
		color: #666;
		text-transform: capitalize;
	}

	.viz-description {
		font-size: 0.9rem;
		color: #666;
		line-height: 1.4;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.viz-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: #999;
		flex-wrap: wrap;
	}

	.viz-file {
		display: flex;
		align-items: center;
		gap: 0.35rem;

		.material-symbols-outlined {
			font-size: 16px;
		}
	}

	.viz-date {
		white-space: nowrap;
	}

	.no-data {
		padding: 2rem;
		text-align: center;
		color: #999;
		font-style: italic;
		background: #fafafa;
		border-radius: 8px;
	}

	.material-symbols-outlined {
		font-variation-settings:
			'FILL' 0,
			'wght' 400,
			'GRAD' 0,
			'opsz' 24;
	}
</style>
