<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { ChartMark } from '$lib/types/visualization';
	const dispatch = createEventDispatcher<{ confirm: { value: ChartMark }; cancel: void }>();

	let {
		open = false,
		value = 'line' as ChartMark,
		chartTypes = [] as Array<{
			id: ChartMark;
			name: string;
			short: string;
			long: string;
			img: string;
			preview: string;
			link: string;
		}>
	} = $props();

	let selected = $state<ChartMark>(value);
	$effect(() => {
		selected = value;
	});

	function confirm() {
		dispatch('confirm', { value: selected });
	}
	function cancel() {
		dispatch('cancel');
	}
</script>

{#if open}
	<div class="modal-overlay" role="dialog" aria-label="Choose chart type" tabindex="-1">
		<div class="modal-card" role="document">
			<div class="modal-header">
				<h3>Select a chart type</h3>
				<button class="secondary small" type="button" onclick={cancel}>✕</button>
			</div>
			<div class="modal-body">
				<aside class="details">
					{#if chartTypes.length}
						{#each chartTypes as t}
							{#if t.id === selected}
								<div class="detail-wrap">
									<div class="big-preview"><img alt={t.name} src={t.preview} /></div>
									<div class="dmeta">
										<div class="tname">{t.name}</div>
										<div class="tlong">{t.long}</div>
										<a href={t.link} target="_blank" rel="noreferrer">More info</a>
									</div>
								</div>
							{/if}
						{/each}
					{/if}
				</aside>
				<section class="grid">
					{#each chartTypes as t}
						<button
							type="button"
							class="type-card {selected === t.id ? 'active' : ''}"
							onclick={() => (selected = t.id)}
						>
							<div class="thumb"><img alt={t.name} src={t.img} /></div>
							<div class="meta">
								<div class="tname">{t.name}</div>
								<div class="tdesc">{t.short}</div>
							</div>
						</button>
					{/each}
				</section>
			</div>
			<div class="modal-actions">
				<button class="secondary" type="button" onclick={cancel}>Cancel</button>
				<button class="primary" type="button" onclick={confirm}>Done</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.modal-card {
		background: #fff;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
		width: min(1200px, 95vw);
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		padding: 12px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
	}
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 6px 10px;
		border-bottom: 1px solid #eef2f7;
	}
	.modal-body {
		display: grid;
		grid-template-columns: 1.2fr 2fr;
		gap: 16px;
		padding: 12px 6px;
		overflow: auto;
	}
	.details {
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		background: #f8fafc;
		padding: 10px;
	}
	.big-preview {
		width: 100%;
		aspect-ratio: 16/10;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.big-preview img {
		max-width: 100%;
		max-height: 100%;
		object-fit: cover;
	}
	.dmeta .tname {
		font-weight: 700;
		margin: 10px 0 6px;
	}
	.dmeta .tlong {
		color: #333;
		font-size: 0.95rem;
		margin-bottom: 6px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.type-card {
		text-align: left;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		padding: 8px;
		background: #fff;
		display: grid;
		grid-template-columns: 100px 1fr;
		gap: 10px;
		cursor: pointer;
	}
	.type-card.active {
		outline: 2px solid #4a90e2;
		outline-offset: 2px;
	}
	.thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f3f4f6;
		border-radius: 8px;
		overflow: hidden;
	}
	.thumb img {
		max-width: 100%;
		max-height: 100%;
		object-fit: cover;
	}
	.meta .tname {
		font-weight: 600;
		margin-bottom: 4px;
	}
	.meta .tdesc {
		font-size: 0.85rem;
		color: #444;
	}

	.modal-actions {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
		border-top: 1px solid #eef2f7;
		padding-top: 10px;
		margin-top: 8px;
	}
</style>
