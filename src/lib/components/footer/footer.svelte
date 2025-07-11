<script>
    import logo from "$lib/components/nav/logo.png"
    import FbLogo from "$lib/components/footer/fb-logo.svg";
    import XLogo from "$lib/components/footer/x-logo.svg";
    import InLogo from "$lib/components/footer/instagram-logo.svg";
    import LinLogo from "$lib/components/footer/linkedin-logo.svg"
</script>

<style lang="scss">
    @use "footer.scss";
</style>

<footer>
    <div class="footer-link-container">
        <div class="logo-container">
        <img src={logo} alt="Logo" class="logo">
        </div>

        <div class="social-links">
        <a href="instagram.com"><img src={InLogo} alt="Instagram" class="social-icon"></a>

        <a href="twitter.com"><img src={XLogo} alt="Twitter" class="social-icon"></a>

        <a href="facebook.com"><img src={FbLogo} alt="Facebook" class="social-icon"></a>

        <a href="linkedin.com"><img src={LinLogo} alt="LinkedIn" class="social-icon"></a>
        </div>
    </div>

    <div class="text-links">
        <div class="resources-links">
            <h3>Resources</h3>
            <ul>
                <li><a href="/">Use cases</a></li>
                <li><a href="/">Documentation</a></li>
                <li><a href="/">Dutorials</a></li>
            </ul>
        </div>

        <div class="legal-links">
            <h3>Legal</h3>
            <ul>
                <li><a href="/">Privacy Policy</a></li>
                <li><a href="/">Terms of Service</a></li>
                <li><a href="/">Cookie Policy</a></li>
            </ul>
        </div>

        <div class="contact-links">
            <h3>Contact</h3>
            <ul>
                <li><a href="/">Contact Us</a></li>
                <li><a href="/">Support</a></li>
                <li><a href="/">Feedback</a></li>
            </ul>
        </div>
    </div>
</footer>