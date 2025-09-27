<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import D3Chart from './D3Chart.svelte';
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
		size: { width: 800, height: 500 },
		options: {}
	});

	let jsonText = $state(JSON.stringify(defaultSpec, null, 2));
	let parseError = $state<string | null>(null);

	const spec = $derived.by<ChartSpec | null>(() => {
		try {
			parseError = null;
			return JSON.parse(jsonText) as ChartSpec;
		} catch (e) {
			parseError = e instanceof Error ? e.message : String(e);
			return null;
		}
	});

	$effect(() => {
		dispatch('specChange', { spec });
	});

	const renderWidth = $derived<number>(spec?.size?.width ?? 800);
	const renderHeight = $derived<number>(spec?.size?.height ?? 500);
</script>

<div class="layout">
	<aside class="controls card">
		<h3>Advanced mode</h3>
		<p class="hint">Edit the JSON spec directly.</p>
		<textarea bind:value={jsonText} spellcheck="false" aria-label="Chart spec JSON"></textarea>
		{#if parseError}
			<p class="error">{parseError}</p>
		{/if}
		<div class="hint">
			<p>Headers</p>
			<code>{headers.join(', ')}</code>
		</div>
	</aside>

	<section class="stage card">
		<h3>Chart</h3>
		<div class="chart-area">
			{#if spec}
				<D3Chart {spec} {rows} width={renderWidth} height={renderHeight} />
			{:else}
				<p class="muted">Fix spec errors to preview.</p>
			{/if}
		</div>
	</section>
</div>

<style>
	.layout {
		display: flex;
		gap: 16px;
	}
	.controls {
		width: 420px;
		flex: 0 0 auto;
	}
	.card {
		border: 1px solid #e6e6e6;
		border-radius: 12px;
		padding: 12px;
		background: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	}
	textarea {
		width: 100%;
		min-height: 340px;
		resize: vertical;
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 10px;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}
	.hint {
		color: #666;
		font-size: 0.9rem;
	}
	.error {
		color: #a11;
		font-weight: 600;
		margin-top: 6px;
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
	.muted {
		color: #666;
	}
	code {
		display: block;
		white-space: pre-wrap;
		word-break: break-word;
		background: #fafafa;
		border: 1px solid #eee;
		border-radius: 8px;
		padding: 6px;
	}
</style>
