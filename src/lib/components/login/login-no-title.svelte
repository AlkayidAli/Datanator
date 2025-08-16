<script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	let error = 'no';
	let success = 'yes';
</script>

<div class="login-container">
    <form
        action="/login"
        method="post"
        use:enhance={() => {
            return async ({ result }) => {
                if (result.type == 'success' && result.status === 200){
                    goto('/');
                } else if (result.type == 'redirect'){
                    goto(result.location, {invalidateAll:true});
                } else if (result.type === 'failure') {
                    error = typeof result.data?.message === 'string'
                        ? result.data.message
                        : 'Login failed';
                } else if (result.type === 'error') {
                    error = typeof result.error?.message === 'string'
                        ? result.error.message
                        : 'Login failed';
                }
            };
        }}
        class="login-form"
    >
        <div class="form-group">
            <label for="email">Email</label>
            <input type="text" id="email" name="email" required />
        </div>
        <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required />
        </div>
		
		 
        <button type="submit" class="primary">Login</button>

		<a href="/" class="forgot-password">Forgot Password?</a>
    </form>
</div>


<div class="signup-container">
	<a href="/signup" class="signup-link">Don't have an account? Sign up</a>
</div>

<!-- <script>
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
</script>


<div class="login-container">
	
	<form action="?/login" method="post" use:enhance={() => {
		return async ({ result }) => {
			console.log(result);
			//
			if (result.type == 'success' && result.status === 200){
				goto('/');
			} else if (result.type == 'redirect'){
				goto(result.location, {invalidateAll:true})
			} else{
				// Handle error case, e.g., show a notification or alert
				const errorText = (result.type === 'error' ? result.error.message : result.data?.message);
				// show error
			}
		};
	}} class="login-form">
		<div class="form-group">
			<label for="email">Email</label>
			<input type="text" id="email" name="email" required />
		</div>
		<div class="form-group">
			<label for="password">Password</label>
			<input type="password" id="password" name="password" required />
		</div>
		<button type="submit" class="primary">Login</button>
	</form>

	<a href="/" class="forgot-password">Forgot Password?</a>
</div>

<div class="signup-container">
	<a href="/" class="signup-link">Don't have an account? Sign up</a>
</div> -->

<style lang="scss">
	@use '../../../styles/global.scss';

	.login-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		margin: auto;
		width: max-content;
		height: max-content;
		border: solid 1px global.$text-grey-10;
		border-radius: 0.5em;
		padding: 1em;


		.forgot-password {
			align-self: flex-start;
			margin: 0.5em 0;
			font-size: 0.8em;
		}

		.login-form {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			width: 350px;
			gap: 1.5em;

			.form-group {
				width: 100%;
				display: flex;
				align-items: start;
				flex-wrap: wrap;
			}

			label {
				font-size: 0.8em;
				margin-bottom: 0.5em;
			}

			input {
				width: -webkit-fill-available;
				height: 1.8em;
				border-radius: 4px;
				border: solid 1px global.$text-grey-10;
				font-size: 1em;
			}

			button {
				width: 100%;
			}
		}
	}

	.signup-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		margin: 1em auto;
		width: 349px;
		height: max-content;
		border: solid 1px global.$text-grey-10;
		border-radius: 0.5em;
		padding: 1em;
	}
</style>
