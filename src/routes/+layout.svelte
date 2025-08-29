<script lang="ts">
	import Nav from '$lib/components/nav/nav.svelte';
	import Footer from '$lib/components/footer/footer.svelte';
	import { page } from '$app/state';
	import Toast from '$lib/components/toast/toast.svelte';
	import { csvData } from '$lib/stores/csvData';
	let { children } = $props();
</script>

<Nav data={page.data} />

<main>
	{@render children()}
</main>

{#if !$csvData}
	<Footer />
{/if}
<Toast />
