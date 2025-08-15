<script lang="ts">
	import LoginNOTitle from '$lib/components/login/login-no-title.svelte';
	import learnersImage from '../images/learners.png';
	import developersImage from '../images/developers.png';
	import researchersImage from '../images/researchers.png';
	import checkIcon from '../images/check.png';

</script>

<div class="welcome-container">
	<div class="welcome-text-container">
		<h1>
			Analyse ,Visualize <br />
			and Manipulate <br />
			your data with <br />
			DATANATOR

		</h1>
		<div class="welcome-subtext-container">
			<div class="subtext">
				<p>Clean Data</p>
				<img src={checkIcon} alt="Check Icon" />
			</div>

			<div class="subtext">
				<p>Visually Analyze</p>
				<img src={checkIcon} alt="Check Icon" />
			</div>

			<div class="subtext">
				<p>Get Insights</p>
				<img src={checkIcon} alt="Check Icon" />
			</div>
		</div>
	</div>
	<div class="welcome-actions">
		<LoginNOTitle />
	</div>
</div>

<div class="info-container">
	<h2 class="info-title">Who can use DATANATOR ?</h2>
	<div class="user-container">
		<div class="user">
			<p>
				<span>Learners</span> <br />
				Learn the processes of <br/>data manipulation.
			</p>
			<img src={learnersImage} alt="Learners" />
		</div>

		<div class="user">
			<p>
				<span>Developers</span> <br />
				Use fast code free <br/>methods.
			</p>
			<img src={developersImage} alt="Developers" />
		</div>

		<div class="user">
			<p>
				<span>Researchers</span> <br />
				visualize and analyse <br/>data for research.
			</p>
			<img src={researchersImage} alt="Researchers" />
		</div>
	</div>
</div>

<style lang="scss">
	@use '../styles/global.scss';
	@use 'landingPage.scss';
</style>
