<script lang="ts">
	import { goto } from '$app/navigation';
	import { parseCSVFile } from '$lib/utils/csv/csv';
	import { csvData } from '$lib/stores/csvData';
	import UploadIcon from '$lib/common/upload_icon.svg';

	let isParsing = $state(false);
	let parseError: string | null = $state(null);

	// Drag & drop overlay state
	let showDrop = $state(false);
	let isDragging = $state(false);

	// Hidden input ref (programmatic open)
	let fileInputRef = $state<HTMLInputElement | null>(null);

	async function processFile(file: File) {
		isParsing = true;
		parseError = null;
		try {
			const parsed = await parseCSVFile(file, { useHeader: true });
			csvData.set(parsed); // single source of truth (persists to localStorage)
			await goto('/csvUploader'); // open the parser UI
		} catch (err: any) {
			parseError = err?.message ?? 'Failed to load CSV';
		} finally {
			isParsing = false;
		}
	}

	async function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		await processFile(file);
		input.value = ''; // allow re-selecting same file
		showDrop = false;
	}

	function openOverlay() {
		showDrop = true;
		isDragging = false;
	}

	function closeOverlay() {
		showDrop = false;
		isDragging = false;
	}

	function openFilePicker() {
		fileInputRef?.click();
	}

	// Drag & drop handlers
	function onDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}
	function onDragLeave(e: DragEvent) {
		// only when leaving the dropzone, not its children
		if (e.currentTarget === e.target) isDragging = false;
	}
	async function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) await processFile(file);
		showDrop = false;
	}
</script>

<div class="csv-home">
	<h1>CSV Upload</h1>
	<p>
		To get started Upload a csv file. Your data will not be saved in our database, it is local to
		your browser.
	</p>

	<!-- Trigger button -->
	<!-- svelte-ignore event_directive_deprecated -->
	<button class="upload-button" on:click={openOverlay}>
		<span class="icon" style={`--icon-url: url("${UploadIcon}")`}></span>
		<span class="label">
			Upload CSV<br />File
		</span>
	</button>

	<!-- Hidden input used by both the button and the dropzone -->
	<!-- svelte-ignore event_directive_deprecated -->
	<!-- svelte-ignore event_directive_deprecated -->
	<input
		bind:this={fileInputRef}
		type="file"
		accept=".csv,text/csv"
		aria-label="Upload CSV file"
		class="visually-hidden"
		on:change={onFileChange}
	/>

	{#if isParsing}<p>Loading file…</p>{/if}
	{#if parseError}<p class="error">{parseError}</p>{/if}

	<h3>Keep this in mind</h3>
	<p>ADD THE GUIDE OF USE LATER***</p>
</div>

<!-- Overlay with dropzone -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore event_directive_deprecated -->
{#if showDrop}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_interactive_supports_focus -->
	<div class="overlay" on:click={closeOverlay}>
		<div
			class="dropzone"
			class:dragging={isDragging}
			on:click|stopPropagation={openFilePicker}
			on:dragover={onDragOver}
			on:dragleave={onDragLeave}
			on:drop={onDrop}
			role="dialog"
			aria-modal="true"
			aria-label="Upload CSV by dragging a file here or click to browse"
		>
			<div class="dz-content">
				<strong>Drag & drop</strong> your CSV here
				<span>or</span>
				<button class="browse-btn secondary" on:click|stopPropagation={openFilePicker}>
					Browse files
				</button>
				<small>Only .csv files are supported</small>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../styles/global.scss' as *;

	.upload-button {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;

		padding: 0.85rem 1.1rem;
		border-radius: 12px;
		border: 1px solid $text-grey-10;
		background: $background-primary-color;
		color: $text-white;
		cursor: pointer;

		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
		transition:
			background-color 0.15s ease,
			color 0.15s ease,
			transform 0.02s ease,
			box-shadow 0.15s ease;

		/* optional: fix width/height similar to your previous version */
		min-width: 12rem;
	}

	.upload-button:hover {
		background: $background-secondary-color;
		color: $text-grey-90;
		box-shadow: 0 10px 22px rgba(0, 0, 0, 0.18);
	}

	.upload-button:active {
		transform: translateY(1px);
	}
	.upload-button:focus-visible {
		outline: 3px solid rgba(74, 144, 226, 0.6);
		outline-offset: 2px;
	}

	/* Icon uses CSS mask and inherits currentColor */
	.upload-button .icon {
		display: inline-block;
		width: 36px;
		height: 36px;
		background-color: currentColor;

		/* shorthand ensures repeat/position/size are set */
		-webkit-mask: var(--icon-url) no-repeat center / contain;
		mask: var(--icon-url) no-repeat center / contain;
	}

	.upload-button .label {
		line-height: 1.1;
		font-weight: 550;
		font-size: 1.05rem;
		text-align: left;
	}

	/* Optional fallback if mask isn’t supported (older browsers) */
	@supports not (mask: url('')) {
		.upload-button .icon {
			background-color: transparent;
			background-image: var(--icon-url);
			background-repeat: no-repeat;
			background-position: center;
			background-size: contain;
		}
	}

	.browse-btn {
		width: 8rem;
	}
	.csv-home {
		padding: 1rem;
		display: grid;
		gap: 0.75rem;
	}

	/* Hide the actual input but keep it accessible for screen readers if needed */
	.visually-hidden {
		position: absolute !important;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	/* Overlay: dark tint + backdrop blur over the whole page */
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6); /* darker transparent */
		backdrop-filter: blur(8px) saturate(120%);
		-webkit-backdrop-filter: blur(8px) saturate(120%);
		display: grid;
		place-items: center;
		z-index: 10000;
	}

	/* Dropzone: frosted glass card */
	.dropzone {
		background: rgba(255, 255, 255, 0.1);
		background-image: linear-gradient(120deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.06));
		min-width: 520px;
		max-width: 90vw;
		min-height: 240px;

		border: 1px solid rgba(255, 255, 255, 0.35);
		border-radius: 16px;
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);

		backdrop-filter: blur(18px) saturate(130%);
		-webkit-backdrop-filter: blur(18px) saturate(130%);

		display: grid;
		place-items: center;
		padding: 1rem;
		cursor: pointer;
	}

	.dropzone.dragging {
		background: rgba(255, 255, 255, 0.18);
		border-color: rgba(255, 255, 255, 0.55);
	}

	.dz-content {
		display: grid;
		place-items: center;
		gap: 0.5rem;
		color: $text-white; /* readable on dark backdrop */
		text-align: center;
	}
	.dz-content small {
		color: rgba(245, 245, 245, 0.75);
	}

	/* Fallback when backdrop-filter is unsupported */
	@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
		.overlay {
			background: rgba(0, 0, 0, 0.75);
		}
		.dropzone {
			background: rgba(255, 255, 255, 0.2);
			box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
		}
	}
</style>
