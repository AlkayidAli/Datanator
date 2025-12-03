<script lang="ts">
	import logo from '$lib/components/nav/logo.png';
	let { data } = $props();
</script>

<nav>
	<div class="logo-container">
		<img src={logo} alt="Logo" class="logo" />
		<h1 class="logo-text">Datanator</h1>
	</div>

	{#if data.user}
		<div class="nav-links">
			<a href="/">Home</a>
			<a href="/csvUploader">CSV Prep</a>
			<a href="/dataLab">Data Lab</a>
			<a href="/visualize">Visualize</a>
			<a href="/about">About us</a>
		</div>
		<img
			src={'https://ui-avatars.com/api/?name=' + data.user.email}
			alt="Avatar"
			style="width:32px;height:32px;border-radius:50%;margin-right:0.5em;"
		/>
		<a class="btn secondary" href="/logout">Logout</a>
	{:else}
		<!-- Hide app links when logged out; show only auth actions -->
		<div class="spacer"></div>
		<a class="btn secondary" href="/login">Login</a>
		<a class="btn primary" href="/signup">Sign Up</a>
	{/if}
</nav>

<style lang="scss">
	@use '../../../styles/global.scss';

	nav {
		position: sticky;
		height: 45px;
		z-index: 1000;
		display: flex;
		align-items: center;
		gap: 25px;
		padding: 0.4em 1em;
		border-bottom: solid 1px global.$text-grey-10;

		.logo-container {
			display: flex;
			align-items: center;
			justify-content: center;
		}
		.nav-links {
			display: flex;
			align-items: center;
			justify-content: end;
			gap: 10px;
			width: 100%;
			flex-direction: row;

			a {
				padding: 0.5em;
			}

			&.hidden {
				display: none;
			}
		}

		.spacer {
			flex: 1 1 auto;
		}

		.nav-buttons {
			/* unused: removed to avoid warnings */
		}
		.logo {
			width: 36px;
			height: 36px;
		}
	}
</style>
