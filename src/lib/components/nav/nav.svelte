<script lang="ts">
    import logo from "$lib/components/nav/logo.png"
</script>

<style lang="scss">
   @use "../../../styles/global.scss";

nav{
    position: sticky;
    height: 45px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 25px;
    padding: 0.4em 1em;
    border-bottom: solid 1px global.$text-grey-10;

    .logo-container{
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .nav-links{
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        flex-direction: row-reverse;

        a{
            padding: 0.5em;
        }
    }

    .nav-buttons{
        display: flex;
        align-items: center;
        gap: 10px;


    }
    .logo{
    width: 36px;
    height: 36px;   
    }
}
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

