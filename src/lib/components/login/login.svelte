<style lang="scss">
    @use "login.scss";
</style>

<div class="login-container">
    <h2>Welcome Back!</h2>
    <form class="login-form">
        <div class="form-group">
            <label for="Email">Email</label>
            <input type="text" id="Email" name="Email" required>
        </div>
        <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required>
        </div>
        <button type="submit" class="primary">Login</button>
        </form>

        <a href="/" class="forgot-password">Forgot Password?</a>
</div>

<div class="signup-container">
    <a href="/" class="signup-link">Don't have an account? Sign up</a>
</div>