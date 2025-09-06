<script lang="ts">
	let { onClose, onSelect } = $props<{
		onClose: () => void;
		onSelect: (mode: 'duplicates' | 'empty' | 'date') => void;
	}>();
	function stop(e: MouseEvent) {
		e.stopPropagation();
	}
</script>

<div class="menu-overlay" onclick={onClose}>
	<div
		class="menu-card"
		onclick={stop}
		role="dialog"
		aria-modal="true"
		aria-label="Choose cleaning tool"
	>
		<h3>Data cleaning</h3>
		<p class="hint">Choose a tool to open its panel</p>
		<div class="menu-list">
			<button class="menu-item" onclick={() => onSelect('duplicates')}>
				<span class="material-symbols-outlined">content_copy</span>
				<div>
					<strong>Duplicate finder</strong>
					<small>Select columns, case sensitivity, remove duplicates</small>
				</div>
			</button>
			<button class="menu-item" onclick={() => onSelect('empty')}>
				<span class="material-symbols-outlined">rule</span>
				<div>
					<strong>Empty cells</strong>
					<small>Find empties, remove rows, or fill with a value</small>
				</div>
			</button>
			<button class="menu-item" onclick={() => onSelect('date')}>
				<span class="material-symbols-outlined">calendar_month</span>
				<div>
					<strong>Date formatter</strong>
					<small>Format dates, add to new column (default) or replace</small>
				</div>
			</button>
		</div>
		<div class="actions">
			<button class="secondary" onclick={onClose}>Cancel</button>
		</div>
	</div>
</div>

<style>
	.menu-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}
	.menu-card {
		width: min(520px, 92vw);
		background: #fff;
		border: 1px solid #e6e6e6;
		border-radius: 12px;
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
		padding: 14px;
	}
	h3 {
		margin: 0 0 4px 0;
	}
	.hint {
		margin: 0 0 8px 0;
		color: #666;
	}
	.menu-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 10px;
	}
	.menu-item {
		display: flex;
		align-items: center;
		justify-content: start;
		gap: 10px;
		width: 100%;
		text-align: left;
		padding: 10px;
		border: 1px solid #e9e9e9;
		border-radius: 10px;
		background: #fafafa;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}
	.menu-item:hover,
	.menu-item:focus {
		background: #f6f6f6;
		border-color: #dedede;
		outline: none;
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
	}
	.menu-item .material-symbols-outlined {
		font-variation-settings:
			'FILL' 0,
			'wght' 500,
			'GRAD' 0,
			'opsz' 24;
		font-size: 32px;
		line-height: 1;
		margin-top: 2px;
	}
	.menu-item strong {
		display: block;
	}
	.menu-item small {
		color: #666;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
	}
</style>
