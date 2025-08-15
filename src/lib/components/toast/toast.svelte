<script lang="ts">
	import { toasts, type Toast } from '$lib/stores/toastStore';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
</script>

<div class="toast-container">
	{#each $toasts as toast (toast.id)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div 
			class="toast {toast.type}" 
			transition:fly={{ y: 50 }}
			animate:flip
			on:click={() => toasts.remove(toast.id)}
		>
			<div class="toast-content">
				<span class="toast-message">{toast.message}</span>
			</div>
			<button class="toast-close" on:click|stopPropagation={() => toasts.remove(toast.id)}>
				×
			</button>
		</div>
	{/each}
</div>

<style lang="scss">
	@use "../../../styles/global.scss";

	.toast-container {
		position: fixed;
		bottom: 20px;
		right: 20px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		z-index: 9999;
		max-width: 350px;
	}

	.toast {
		padding: 12px 16px;
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		display: flex;
		align-items: center;
		justify-content: space-between;
		cursor: pointer;
		color: white;
		animation: slideIn 0.3s ease-out;
		background-color: global.$background-primary-color;
		border: 1px solid global.$text-grey-10;
	}

	.toast.success {
		background-color: #4CAF50;
		border-color: #388E3C;
	}

	.toast.error {
		background-color: #F44336;
		border-color: #D32F2F;
	}

	.toast.warning {
		background-color: #FF9800;
		border-color: #F57C00;
	}

	.toast.info {
		background-color: #2196F3;
		border-color: #1976D2;
	}

	.toast-content {
		flex: 1;
		margin-right: 10px;
	}

	.toast-message {
		font-size: 14px;
		color: global.$text-white;
	}

	.toast-close {
		background: transparent;
		border: none;
		color: global.$text-white;
		font-size: 18px;
		cursor: pointer;
		padding: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: background-color 0.2s;

		&:hover {
			background-color: rgba(255, 255, 255, 0.2);
		}
	}

	@keyframes slideIn {
		from {
			transform: translateY(30px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>