<script lang="ts">
	import * as d3 from 'd3';
	import type { ChartSpec } from '$lib/types/visualization';

	let {
		spec,
		rows,
		width = 800,
		height = 500
	} = $props<{
		spec: ChartSpec;
		rows: Record<string, unknown>[];
		width?: number;
		height?: number;
	}>();

	let svgEl = $state<SVGSVGElement | null>(null);

	$effect(() => {
		if (!svgEl) return;
		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();
		svg.attr('width', width).attr('height', height);

		// TODO: Implement D3 rendering here using spec + rows.
		// Example sketch:
		// const { mark, encoding } = spec;
		// switch (mark) {
		//   case 'line': /* draw line */ break;
		//   case 'bar': /* draw bars */ break;
		//   // ...
		// }
	});
</script>

<svg bind:this={svgEl} role="img" aria-label={spec.title ?? 'Chart'}></svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
