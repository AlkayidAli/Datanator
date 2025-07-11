<style lang="scss">
    @use "signup.scss";
</style>

<div class="signup-container">
    <h2>Create Account</h2>
    <form class="signup-form">
        <div class="form-group">
            <label for="Email">Email</label>
            <input type="text" id="Email" name="Email" required>
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
