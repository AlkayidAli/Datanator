<script lang="ts">
    import Nav from '$lib/components/nav/nav.svelte';
    import Footer from "$lib/components/footer/footer.svelte";

    let { children } = $props();
</script>

<Nav/>

    <main>
        {@render children()}
    </main>

<Footer/>