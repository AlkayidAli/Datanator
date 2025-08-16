<script>
	import { enhance } from "$app/forms";
    let {form} = $props()
</script>
<style lang="scss">
    @use "$lib/styles/global.scss";

.signup-container {
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

    h2{
        font-size: 2.5em;
    }


    .signup-form {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 350px;
        gap: 1em;

        .form-group{
            width: 100%;
        }

        .checkbox-group{
            display: flex;
            align-items: center;
            justify-content: start;
            width: 100%;

            input{
                width: 1.2em;
            }
            label{
                margin: 0;
            }
        }

        label{
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
        
        button{
            width: 100%;
        }
       
    }
}

</style>

<div class="signup-container">
    <h2>Create Account</h2>
    <form class="signup-form" action="?/create" method="post" use:enhance>
        <div class="form-group">
            <label for="email">Email</label>
            <input type="text" id="email" name="email" required>
        </div>
        <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required>
        </div>
        <div class="form-group">
            <label for="confirm-password">Confirm Password</label>
            <input type="password" id="confirm-password" name="confirm-password" required>
        </div>
        <div class="checkbox-group">
            <input type="checkbox" id="terms" name="terms" required>
            <label for="terms">I agree to the terms and conditions</label>
        </div>
        <button type="submit" class="primary">Register</button>
    </form>

</div>
