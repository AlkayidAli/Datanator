<script lang="ts">
    import logo from "$lib/components/nav/logo.png"
</script>

<style lang="scss">
    @use "nav.scss";
</style>

<nav>
    <div class="logo-container">
    <img src={logo} alt="Logo" class="logo">
    <h1 class="logo-text">Datanator</h1>
        </div>

    <div class='nav-links'>
        <a href="/">Home</a>
        <a href="/">Visualize</a>
        <a href="/">Clean</a>
        <a href="/">Analyze</a>
        <a href="/">About us</a>
        <a href="/">Contact</a>
    </div>

    <div class='nav-buttons'>
        <button class="secondary">Login</button>
        <button class="primary">Sign Up</button>
        </div>
</nav>

