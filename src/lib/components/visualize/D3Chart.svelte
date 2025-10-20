<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { select, pointer } from 'd3-selection';
	import {
		scaleLinear,
		scaleBand,
		scaleUtc,
		scaleOrdinal,
		scaleLog,
		type ScaleBand
	} from 'd3-scale';
	import { axisBottom, axisLeft } from 'd3-axis';
	import { extent, max, rollups, sum, bin } from 'd3-array';
	import {
		line as shapeLine,
		area as shapeArea,
		curveLinear,
		curveMonotoneX,
		curveStep,
		curveNatural,
		pie as shapePie,
		arc as shapeArc,
		type PieArcDatum
	} from 'd3-shape';
	import { brush } from 'd3-brush';
	import { schemeTableau10 } from 'd3-scale-chromatic';
	import type { ChartSpec } from '$lib/types/visualization';

	let {
		spec,
		rows,
		width = 800,
		height = 500,
		interactionMode = 'zoom'
	} = $props<{
		spec: ChartSpec;
		rows: Record<string, unknown>[];
		width?: number;
		height?: number;
		interactionMode?: 'zoom' | 'pan' | 'none';
	}>();

	let svgEl = $state<SVGSVGElement | null>(null);
	let wrapEl = $state<HTMLDivElement | null>(null);
	let tipEl = $state<HTMLDivElement | null>(null);

	// Keep the original (full) domains for double‑click reset
	let baseXDom: any[] | null = null;
	let baseYDom: [number, number] | null = null;

	// Persist current zoomed (filtered) domains across redraws & mode switches
	let curXDomOverride: any[] | [number, number] | null = null;
	let curYDomOverride: any[] | [number, number] | null = null;

	function isNum(v: unknown) {
		return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(+v));
	}
	function toNum(v: unknown): number | null {
		if (typeof v === 'number') return v;
		if (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) return +v;
		return null;
	}
	function isDateish(v: unknown) {
		return v instanceof Date || (typeof v === 'string' && !isNaN(Date.parse(v)));
	}
	function toDate(v: unknown): Date | null {
		if (v instanceof Date) return v;
		if (typeof v === 'string' && !isNaN(Date.parse(v))) return new Date(v);
		return null;
	}
	function hasBand(scale: any): scale is ScaleBand<string> {
		return typeof (scale as any).bandwidth === 'function';
	}
	function curveFrom(name: string) {
		switch (name) {
			case 'monotone':
				return curveMonotoneX;
			case 'step':
				return curveStep;
			case 'natural':
				return curveNatural;
			default:
				return curveLinear;
		}
	}
	function clamp(n: number, min: number, max: number) {
		return Math.max(min, Math.min(max, n));
	}
	function showTip(html: string, ev: PointerEvent | MouseEvent) {
		if (!wrapEl || !tipEl) return;
		const [x, y] = pointer(ev as any, wrapEl);
		tipEl.innerHTML = html;
		tipEl.style.display = 'block';
		tipEl.style.left = `${x + 12}px`;
		tipEl.style.top = `${y + 12}px`;
	}
	function moveTip(ev: PointerEvent | MouseEvent) {
		if (!wrapEl || !tipEl) return;
		const [x, y] = pointer(ev as any, wrapEl);
		tipEl.style.left = `${x + 12}px`;
		tipEl.style.top = `${y + 12}px`;
	}
	function hideTip() {
		if (tipEl) tipEl.style.display = 'none';
	}

	function normRot(v: any): 0 | 45 | 90 {
		const n = Number(v);
		return n >= 90 ? 90 : n >= 45 ? 45 : 0;
	}

	const dispatch = createEventDispatcher<{
		itemClick: { id: string; series: string; x: any; y: any };
	}>();

	// Track prior spec/size/rows to decide when to truly reset
	let prevSpecKey: string | null = null;
	let prevRowsLen = -1;
	let prevW = -1;
	let prevH = -1;
	let prevInteractionMode: string | null = null;

	// Dynamic left margin to accommodate long Y tick labels outside the plot
	let dynamicLeftMargin: number | null = null;

	$effect(() => {
		if (!svgEl) return;

		// Key (exclude options shallowly to reduce resets)
		const specKey = JSON.stringify({
			mark: spec.mark,
			enc: spec.encoding,
			// removed size
			title: spec.title,
			legend: spec.legend
		});
		const rowsLen = rows.length;

		const structuralChanged =
			specKey !== prevSpecKey || rowsLen !== prevRowsLen || width !== prevW || height !== prevH;

		// Only reset base domains (full reference) when structural changes occur
		if (structuralChanged) {
			baseXDom = null;
			baseYDom = null;
			// If structure changed, also clear current zoom overrides (they may be invalid)
			curXDomOverride = null;
			curYDomOverride = null;
		}
		// Interaction mode change alone should NOT clear overrides or base domains
		prevSpecKey = specKey;
		prevRowsLen = rowsLen;
		prevW = width;
		prevH = height;
		prevInteractionMode = interactionMode;

		const svg = select(svgEl);

		function draw(xDom?: any[], yDom?: any[]) {
			// Update overrides if new domains explicitly provided
			if (Array.isArray(xDom)) curXDomOverride = xDom;
			if (Array.isArray(yDom)) curYDomOverride = yDom;

			svg.selectAll('*').remove();
			const opts = (spec.options ?? {}) as any;

			// rotations and margins
			const xRot: 0 | 45 | 90 = normRot(opts.axis?.xTickRotate ?? 0);
			const yRot: 0 | 45 | 90 = normRot(opts.axis?.yTickRotate ?? 0);
			const extraBottom = xRot === 90 ? 90 : xRot === 45 ? 44 : 18;
			const extraLeft = yRot === 90 ? 72 : yRot === 45 ? 32 : 0;

			// Use dynamic left margin if previously computed (to keep labels outside plot)
			const baseLeft = 56 + extraLeft;
			const margin = {
				top: 28,
				right: 16,
				bottom: 40 + extraBottom,
				left: dynamicLeftMargin ?? baseLeft
			};
			const iw = Math.max(10, width - margin.left - margin.right);
			const ih = Math.max(10, height - margin.top - margin.bottom);

			svg.attr('width', width).attr('height', height);
			const root = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

			// BEFORE using spec.mark, handle layers fallback
			const baseSpec: any =
				spec.layers && spec.layers.length
					? { ...spec, ...spec.layers[0], encoding: spec.layers[0].encoding }
					: spec;
			const mark = baseSpec.mark;
			const enc = baseSpec.encoding ?? {};
			const transforms = spec.transforms || baseSpec.transforms || {};

			const palette: string[] =
				Array.isArray(opts.palette) && opts.palette.length ? opts.palette : schemeTableau10;
			const seriesOverrides: Record<string, string> = opts.colors?.series || {};

			// Title
			if (spec.title) {
				root
					.append('text')
					.attr('x', iw / 2)
					.attr('y', -8)
					.attr('text-anchor', 'middle')
					.attr('font-weight', 600)
					.text(spec.title);
			}

			// Axis groups
			const gx = root.append('g').attr('transform', `translate(0,${ih})`);
			const gy = root.append('g');

			// Clip-path for the plotting region (prevents overshoot)
			const clipId = `clip-${Math.random().toString(36).slice(2)}`;
			root
				.append('defs')
				.append('clipPath')
				.attr('id', clipId)
				.append('rect')
				.attr('x', 0)
				.attr('y', 0)
				.attr('width', iw)
				.attr('height', ih);

			// All marks go into this clipped group
			const gPlot = root.append('g').attr('clip-path', `url(#${clipId})`);

			const xLabel: string | undefined = opts.axisLabels?.x;
			const yLabel: string | undefined = opts.axisLabels?.y;

			let xTitleSel: any = null;
			let yTitleSel: any = null;
			function placeXLabel() {
				if (!xLabel) return;
				xTitleSel = root
					.append('text')
					.attr('class', 'axis-title x')
					.attr('x', iw / 2)
					.attr('y', ih + 36) // provisional, will adjust later
					.attr('text-anchor', 'middle')
					.attr('fill', '#333')
					.text(xLabel);
			}
			function placeYLabel() {
				if (!yLabel) return;
				yTitleSel = root
					.append('text')
					.attr('class', 'axis-title y')
					.attr('transform', 'rotate(-90)')
					.attr('x', -ih / 2)
					.attr('y', -44) // provisional, will adjust later
					.attr('text-anchor', 'middle')
					.attr('fill', '#333')
					.text(yLabel);
			}
			function rotateTicks() {
				const xt = gx
					.selectAll<SVGTextElement, unknown>('text')
					.attr('dominant-baseline', 'hanging');
				if (xRot === 0)
					xt.attr('transform', null)
						.style('text-anchor', 'middle')
						.attr('dx', '0')
						.attr('dy', '0.9em');
				else if (xRot === 45)
					xt.attr('transform', 'translate(0,12) rotate(-45)')
						.style('text-anchor', 'end')
						.attr('dx', '-0.35em')
						.attr('dy', '0');
				else
					xt.attr('transform', 'translate(0,12) rotate(-90)')
						.style('text-anchor', 'end')
						.attr('dx', '-0.35em')
						.attr('dy', '0');

				const yt = gy
					.selectAll<SVGTextElement, unknown>('text')
					.attr('dominant-baseline', 'middle');
				// Render Y tick labels to the LEFT of the axis line (outside the plot)
				if (yRot === 0) yt.attr('transform', null).style('text-anchor', 'end').attr('dx', '-0.4em');
				else if (yRot === 45)
					yt.attr('transform', 'translate(-6,0) rotate(-45)')
						.style('text-anchor', 'end')
						.attr('dx', '-0.4em');
				else
					yt.attr('transform', 'translate(-8,0) rotate(-90)')
						.style('text-anchor', 'middle')
						.attr('dx', '-0.6em');
			}

			function adjustAxisTitles() {
				// Adjust X title below tallest tick label
				if (xTitleSel) {
					const tickNodes = gx.selectAll<SVGTextElement, unknown>('text').nodes();
					if (tickNodes.length) {
						let maxH = 0;
						for (const n of tickNodes) {
							const bb = n.getBBox();
							maxH = Math.max(maxH, bb.height);
						}
						xTitleSel.attr('y', ih + maxH + 28);
					}
				}
				// Adjust Y title left of widest tick label
				if (yTitleSel) {
					const tickNodes = gy.selectAll<SVGTextElement, unknown>('text').nodes();
					if (tickNodes.length) {
						let maxW = 0;
						for (const n of tickNodes) {
							const bb = n.getBBox();
							maxW = Math.max(maxW, bb.width);
						}
						// yTitleSel already rotated; its 'y' negative moves left
						yTitleSel.attr('y', -(maxW + 24));
					}
				}
			}

			// New: prevent overlapping X tick labels (after rotateTicks call)
			function fixXTicks() {
				const tickGroups = gx.selectAll<SVGGElement, unknown>('g.tick');
				if (!tickGroups.size()) return;

				function hasOverlap(nodes: SVGTextElement[]) {
					for (let i = 1; i < nodes.length; i++) {
						const a = nodes[i - 1].getBoundingClientRect();
						const b = nodes[i].getBoundingClientRect();
						// horizontal overlap (1px tolerance)
						if (a.right + 1 >= b.left) return true;
					}
					return false;
				}

				let iterations = 0;
				while (iterations < 6) {
					const visibleTexts = tickGroups
						.filter(function () {
							const disp = (this as SVGGElement).style.display;
							return disp !== 'none';
						})
						.select('text')
						.nodes() as SVGTextElement[];

					if (visibleTexts.length <= 1 || !hasOverlap(visibleTexts)) break;

					// hide every other tick
					let keep = true;
					tickGroups
						.filter(function () {
							const disp = (this as SVGGElement).style.display;
							return disp !== 'none';
						})
						.each(function () {
							if (!keep) (this as SVGGElement).style.display = 'none';
							keep = !keep;
						});
					iterations++;
				}
			}

			// Legend helper now takes color function
			function drawLegend(labels: string[], colorFn: (label: string, i: number) => string) {
				if (!spec.legend || !labels.length) return;
				const lg = root.append('g').attr('transform', `translate(${iw - 140}, 0)`);
				const item = lg
					.selectAll('g')
					.data(labels)
					.enter()
					.append('g')
					.attr('transform', (_d, i) => `translate(0,${i * 18})`);
				item
					.append('rect')
					.attr('width', 12)
					.attr('height', 12)
					.attr('fill', (d, i) => colorFn(d, i))
					.attr('rx', 2);
				item
					.append('text')
					.attr('x', 16)
					.attr('y', 10)
					.text((d) => d)
					.attr('font-size', 12);
			}

			// Pie — unchanged (no zoom)
			if (mark === 'pie') {
				const category = enc.x ?? null;
				const yCol = enc.y && enc.y[0] ? enc.y[0] : null;
				if (!category || !yCol) {
					root
						.append('text')
						.attr('x', iw / 2)
						.attr('y', ih / 2)
						.attr('text-anchor', 'middle')
						.text('Select category and value for pie chart');
					return;
				}
				const grouped = rollups(
					rows as any[],
					(v) => sum(v, (d) => toNum(d[yCol]) ?? 0),
					(d) => String(d[category])
				);
				const data = grouped.map(([k, v]) => ({ key: k, value: v as number }));
				const total = data.reduce((a, b) => a + b.value, 0);
				const radius = Math.min(iw, ih) / 2;
				const inner = clamp(Number(opts.pie?.innerRatio ?? 0), 0, 0.9);
				const pad = clamp(Number(opts.pie?.padAngle ?? 0), 0, 0.3);
				const g = root.append('g').attr('transform', `translate(${iw / 2},${ih / 2})`);
				const pie = shapePie<{ key: string; value: number }>()
					.value((d) => d.value)
					.padAngle(pad);
				const arc = shapeArc<PieArcDatum<{ key: string; value: number }>>()
					.innerRadius(radius * inner)
					.outerRadius(radius);
				g.selectAll('path')
					.data(pie(data))
					.enter()
					.append('path')
					.attr('fill', (_d, i) => palette[i % palette.length])
					.attr('d', arc as any)
					.on('pointerenter', (ev, d: any) =>
						showTip(
							`<b>${d.data.key}</b><br/>${d.data.value} (${((d.data.value / total) * 100).toFixed(1)}%)`,
							ev
						)
					)
					.on('pointermove', moveTip)
					.on('pointerleave', hideTip);

				g.selectAll('text')
					.data(pie(data))
					.enter()
					.append('text')
					.attr('transform', (d) => `translate(${arc.centroid(d)})`)
					.attr('dy', '0.35em')
					.attr('text-anchor', 'middle')
					.attr('font-size', 11)
					.text((d) => d.data.key);

				return;
			}

			// Histogram — unchanged for zoom (can still be clipped safely)
			if (mark === 'histogram') {
				const xField = enc.x ?? null;
				if (!xField) {
					root
						.append('text')
						.attr('x', iw / 2)
						.attr('y', ih / 2)
						.attr('text-anchor', 'middle')
						.text('Select a numeric field for histogram');
					return;
				}
				const values = (rows as any[])
					.map((r) => toNum(r[xField]))
					.filter((v): v is number => v != null);
				if (!values.length) {
					root
						.append('text')
						.attr('x', iw / 2)
						.attr('y', ih / 2)
						.attr('text-anchor', 'middle')
						.text('No numeric data in the selected field');
					return;
				}
				const binsCount = clamp(Number(opts.histogram?.bins ?? 20), 5, 100);
				const x = scaleLinear()
					.domain(extent(values) as [number, number])
					.nice()
					.range([0, iw]);
				const binsArr = bin()
					.domain(x.domain() as [number, number])
					.thresholds(binsCount)(values);
				const y = scaleLinear()
					.domain([0, max(binsArr, (b) => b.length) ?? 0])
					.nice()
					.range([ih, 0]);

				gx.call(axisBottom(x).ticks(6));
				gy.call(axisLeft(y).ticks(5));
				placeXLabel();
				placeYLabel();
				rotateTicks();

				root
					.append('g')
					.selectAll('rect')
					.data(binsArr)
					.enter()
					.append('rect')
					.attr('x', (d) => x(d.x0 as number) + 1)
					.attr('width', (d) => Math.max(0, x(d.x1 as number) - x(d.x0 as number) - 1))
					.attr('y', (d) => y(d.length))
					.attr('height', (d) => ih - y(d.length))
					.attr('fill', palette[0]);

				return;
			}

			// Require X/Y for marks that need them
			if (
				!['pie', 'histogram', 'arc', 'alluvial'].includes(mark) &&
				(!enc.x || !enc.y || !enc.y.length)
			) {
				root
					.append('text')
					.attr('x', iw / 2)
					.attr('y', ih / 2)
					.attr('text-anchor', 'middle')
					.text('Select X and Y columns');
				return;
			}

			// Build scales (supports bar orientation)
			const xVals = (rows as any[]).map((r) => r[enc.x!]);
			let xType: 'band' | 'number' | 'time';
			if (xVals.every(isDateish)) xType = 'time';
			else if (xVals.every(isNum)) xType = 'number';
			else xType = 'band';

			const seriesKeys: string[] = enc.y!;
			const paletteScale = scaleOrdinal<string, string>().domain(seriesKeys).range(palette);

			// Prepare domains/helpers used by multiple marks
			const categoriesDomain = Array.from(new Set(xVals.map((v) => String(v))));
			// Gather Y values across all selected series
			const yRawValues: any[] = [];
			for (const key of seriesKeys) {
				for (const r of rows as any[]) yRawValues.push((r as any)[key]);
			}
			// Decide Y type: numeric or categorical (band)
			const yType: 'number' | 'band' = yRawValues.every(isNum) ? 'number' : 'band';

			const allYValues: number[] = [];
			if (yType === 'number') {
				for (const key of seriesKeys)
					for (const r of rows as any[]) {
						const v = toNum(r[key]);
						if (v != null) allYValues.push(v);
					}
			}
			const yCategoriesDomain: string[] =
				yType === 'band'
					? Array.from(
							new Set(seriesKeys.flatMap((k) => (rows as any[]).map((r) => String((r as any)[k]))))
						)
					: [];

			if (
				yType === 'number' &&
				!allYValues.length &&
				spec.mark !== 'pie' &&
				spec.mark !== 'histogram'
			) {
				root
					.append('text')
					.attr('x', iw / 2)
					.attr('y', ih / 2)
					.attr('text-anchor', 'middle')
					.text('No numeric data in selected Y columns');
				return;
			}

			const barOrient = (opts.bar?.orientation ?? 'vertical') as 'vertical' | 'horizontal';
			const isBar = spec.mark === 'bar';
			const isBarH = isBar && barOrient === 'horizontal';

			// X scale
			let x: any;
			if (isBar && barOrient === 'vertical') {
				if (!baseXDom) baseXDom = categoriesDomain.slice();
				const useDom = (curXDomOverride as string[]) ?? categoriesDomain;
				x = scaleBand<string>()
					.domain(useDom)
					.range([0, iw])
					.padding(clamp(Number(opts.bar?.padding ?? 0.2), 0, 0.5));
			} else if (isBar && barOrient === 'horizontal') {
				const dom: [number, number] = [0, max(allYValues) ?? 0];
				if (!baseXDom) baseXDom = dom.slice() as any[];
				const useDom = (curXDomOverride as [number, number]) ?? dom;
				x = scaleLinear().domain(useDom).range([0, iw]);
				if (!curXDomOverride) x.nice();
			} else if (xType === 'time') {
				const dates = xVals.map(toDate) as Date[];
				const dom = extent(dates) as [Date, Date];
				if (!baseXDom) baseXDom = dom.slice() as any[];
				const useDom = (curXDomOverride as [Date, Date]) ?? dom;
				x = scaleUtc().domain(useDom).range([0, iw]);
				if (!curXDomOverride) x.nice();
			} else if (xType === 'number') {
				const nums = xVals.map(toNum) as number[];
				const dom = extent(nums) as [number, number];
				if (!baseXDom) baseXDom = dom.slice() as any[];
				const useDom = (curXDomOverride as [number, number]) ?? dom;
				if (transforms.logX) {
					const safe: [number, number] = [
						Math.max(1e-6, useDom[0] <= 0 ? 1e-6 : useDom[0]),
						Math.max(1e-6, useDom[1] <= 0 ? 1 : useDom[1])
					];
					x = scaleLog().domain(safe).range([0, iw]).clamp(true);
				} else {
					x = scaleLinear().domain(useDom).range([0, iw]);
					if (!curXDomOverride) x.nice();
				}
			} else {
				if (!baseXDom) baseXDom = categoriesDomain.slice();
				const useDom = (curXDomOverride as string[]) ?? categoriesDomain;
				x = scaleBand<string>().domain(useDom).range([0, iw]).padding(0.1);
			}

			// Y scale (only apply override for continuous; categorical override for bands)
			let y: any;
			if (isBarH) {
				const yCats =
					(curYDomOverride as string[]) ??
					(Array.isArray(yDom) && yDom.length ? (yDom as string[]) : categoriesDomain);
				y = scaleBand<string>()
					.domain(yCats)
					.range([0, ih])
					.padding(clamp(Number(opts.bar?.padding ?? 0.2), 0, 0.5));
			} else if (yType === 'band') {
				const yCats =
					(curYDomOverride as string[]) ??
					(Array.isArray(yDom) && yDom.length ? (yDom as string[]) : yCategoriesDomain);
				y = scaleBand<string>().domain(yCats).range([0, ih]).padding(0.1);
			} else {
				const yDomDefault: [number, number] = [0, max(allYValues) ?? 0];
				if (!baseYDom) baseYDom = yDomDefault.slice() as [number, number];
				const useYDom = (curYDomOverride as [number, number]) ?? yDomDefault;
				if (transforms.logY) {
					const safe: [number, number] = [
						Math.max(1e-6, useYDom[0] <= 0 ? 1e-6 : useYDom[0]),
						Math.max(1e-6, useYDom[1] <= 0 ? 1 : useYDom[1])
					];
					y = scaleLog().domain(safe).range([ih, 0]).clamp(true);
				} else {
					y = scaleLinear().domain(useYDom).range([ih, 0]);
					if (!curYDomOverride) y.nice();
				}
			}

			// Axes
			const hideXAxis = mark === 'alluvial';
			if (!hideXAxis) {
				gx.call(hasBand(x) ? axisBottom(x) : axisBottom(x).ticks(6));
				placeXLabel();
			}
			gy.call(hasBand(y) ? axisLeft(y) : axisLeft(y).ticks(5));
			placeYLabel();
			rotateTicks();
			fixXTicks();
			adjustAxisTitles();

			// Measure Y tick width and, if needed, expand left margin and redraw once
			{
				const yTicks = gy.selectAll<SVGTextElement, unknown>('text').nodes();
				if (yTicks.length) {
					let maxW = 0;
					for (const n of yTicks) maxW = Math.max(maxW, n.getBBox().width);
					// desired left margin: max of base and label width + padding
					const desiredLeft = Math.max(baseLeft, Math.ceil(maxW + 24));
					if (dynamicLeftMargin == null || Math.abs(dynamicLeftMargin - desiredLeft) > 2) {
						dynamicLeftMargin = desiredLeft;
						// Redraw with updated margin (preserve existing overrides)
						draw();
						return;
					}
				}
			}

			const pointOverrides: Record<string, string> =
				(opts.colors?.pointOverrides as Record<string, string>) || {};

			function makeId(seriesKey: string, xVal: any) {
				return `s:${seriesKey}|x:${String(xVal)}`;
			}

			const colorMode: 'series' | 'point' =
				(opts.colors?.mode as any) === 'point' ? 'point' : 'series';

			// Color channel (categorical) support
			const colorField: string | null = enc.color ?? null;
			const colorDomain: string[] = colorField
				? Array.from(new Set((rows as any[]).map((r) => String((r as any)[colorField]))))
				: [];
			const categoricalCfg =
				opts.colors?.categorical && opts.colors.categorical.field === colorField
					? (opts.colors.categorical as any)
					: null;
			const categoricalMap: Record<string, string> = categoricalCfg?.map || {};
			const colorScale = scaleOrdinal<string, string>().domain(colorDomain).range(palette);
			function colorByValue(v: unknown, idx: number): string {
				const key = String(v);
				return categoricalMap[key] || colorScale(key) || palette[idx % palette.length];
			}

			// Allow coloring if explicit point mode OR interaction mouse mode (none)
			const canColorIndividually = colorMode === 'point' || interactionMode === 'none';

			function seriesColor(key: string, i: number) {
				return seriesOverrides[key] || paletteScale(key) || palette[i % palette.length];
			}

			function finalPointColor(
				seriesKey: string,
				idxInSeries: number,
				globalIdx: number,
				xVal: any
			) {
				const id = makeId(seriesKey, xVal);
				if (pointOverrides[id]) return pointOverrides[id];
				if (colorMode === 'point') return palette[globalIdx % palette.length];
				return seriesColor(seriesKey, idxInSeries);
			}

			function applyOverrideStroke(sel: any, seriesKey: string, xVal: any) {
				const id = makeId(seriesKey, xVal);
				if (pointOverrides[id]) sel.attr('stroke', '#222').attr('stroke-width', 1.5);
			}

			// Added: helper functions required by marks (were lost in refactor)
			function xPos(v: any, idx: number) {
				if (hasBand(x)) {
					const px = x(String(v));
					return (px ?? 0) + x.bandwidth() / 2;
				}
				if (xType === 'time') return x(toDate(v) ?? new Date());
				if (xType === 'number' || isBarH) return x(toNum(v) ?? 0);
				return idx;
			}
			function yPos(v: any) {
				if (hasBand(y)) {
					const py = y(String(v));
					return (py ?? 0) + y.bandwidth() / 2;
				}
				return y(toNum(v) ?? 0);
			}
			function inXDomain(v: any) {
				if (hasBand(x)) return (x.domain() as string[]).includes(String(v));
				if (xType === 'time') {
					const d = toDate(v);
					if (!d) return false;
					const [a, b] = x.domain() as [Date, Date];
					return d >= a && d <= b;
				}
				if (xType === 'number' || isBarH) {
					const n = toNum(v);
					if (n == null) return false;
					const [a, b] = x.domain() as [number, number];
					return n >= a && n <= b;
				}
				return true;
			}
			function inYDomain(v: any) {
				if (hasBand(y)) return (y.domain() as string[]).includes(String(v));
				const n = toNum(v);
				if (n == null) return false;
				const [a, b] = y.domain() as [number, number];
				return n >= a && n <= b;
			}

			// Marks
			if (mark === 'line') {
				const lw = clamp(Number(opts.line?.strokeWidth ?? 2), 0.5, 8);
				const curve = curveFrom(opts.line?.curve ?? 'linear');
				for (const [i, key] of seriesKeys.entries()) {
					let data = (rows as any[])
						.map((r, idx) => ({
							row: r,
							x: enc.x ? (r as any)[enc.x] : idx,
							y: yType === 'number' ? (toNum((r as any)[key]) as any) : String((r as any)[key])
						}))
						.filter((d) => inXDomain(d.x) && inYDomain(d.y));
					// sort by X so path draws left->right (prevents “spider web”)
					if (hasBand(x)) {
						const order = x.domain() as string[];
						data.sort((a, b) => order.indexOf(String(a.x)) - order.indexOf(String(b.x)));
					} else if (xType === 'time') {
						data.sort((a, b) => +toDate(a.x)! - +toDate(b.x)!);
					} else {
						data.sort((a, b) => toNum(a.x)! - toNum(b.x)!);
					}
					const ln = shapeLine<any>()
						.x((d, i) => xPos(d.x, i))
						.y((d) => yPos(d.y))
						.curve(curve);
					const path = gPlot
						.append('path')
						.attr('fill', 'none')
						.attr('stroke', seriesColor(key, i))
						.attr('stroke-width', lw)
						.attr('d', ln(data) ?? null);
					gPlot
						.append('g')
						.selectAll('circle')
						.data(data)
						.enter()
						.append('circle')
						.attr('cx', (d, i) => xPos(d.x, i))
						.attr('cy', (d) => yPos(d.y))
						.attr('r', 3)
						.attr('fill', (d) => {
							// If a point override exists, use it and make the point visible, otherwise keep series color but low opacity
							const id = makeId(key, d.x);
							if (pointOverrides[id]) return pointOverrides[id];
							if (colorField) return colorByValue((d as any).row[colorField], i);
							return seriesColor(key, i);
						})
						.attr('opacity', (d) => (pointOverrides[makeId(key, d.x)] ? 0.95 : 0.0))
						.on('pointerenter', (ev, d: any) =>
							showTip(`<b>${key}</b><br/>${String(enc.x)}: ${d.x}<br/>value: ${d.y}`, ev)
						)
						.on('pointermove', moveTip)
						.on('pointerleave', hideTip)
						.each(function (d) {
							applyOverrideStroke(select(this), key, d.x);
						});
				}
				drawLegend(seriesKeys, seriesColor);
			} else if (mark === 'scatter') {
				// Support size channel & richer tooltips
				const baseR = clamp(Number(opts.scatter?.radius ?? 3.5), 1, 12);
				let sizeScale: ((v: unknown) => number) | null = null;
				if (enc.size) {
					const vals = (rows as any[])
						.map((r) => toNum((r as any)[enc.size!]))
						.filter((n): n is number => n != null && isFinite(n));
					if (vals.length) {
						const mn = Math.min(...vals);
						const mx = Math.max(...vals);
						const customRange = Array.isArray(opts.scatter?.sizeRange)
							? (opts.scatter!.sizeRange as [number, number])
							: null;
						const rMin = customRange ? clamp(customRange[0], 1, 100) : baseR * 0.5;
						const rMax = customRange ? clamp(customRange[1], rMin + 0.1, 120) : baseR * 2.2;
						sizeScale = (v: unknown) => {
							const n = toNum(v);
							if (n == null || !isFinite(n) || mx === mn) return baseR;
							return rMin + ((n - mn) / (mx - mn)) * (rMax - rMin);
						};
					}
				}
				let globalIndex = 0;
				const tooltipCols: string[] =
					Array.isArray(enc.tooltip) && enc.tooltip.length ? enc.tooltip : [];
				for (const [i, key] of seriesKeys.entries()) {
					const pts = (rows as any[])
						.map((row, idx) => ({
							row,
							x: enc.x ? (row as any)[enc.x] : idx,
							y: yType === 'number' ? (toNum((row as any)[key]) as any) : String((row as any)[key])
						}))
						.filter((d) => inXDomain(d.x) && inYDomain(d.y));
					gPlot
						.append('g')
						.selectAll('circle')
						.data(pts)
						.enter()
						.append('circle')
						.attr('cx', (d, i2) => xPos(d.x, i2))
						.attr('cy', (d) => yPos(d.y))
						.attr('r', (d) => (sizeScale ? sizeScale((d.row as any)[enc.size!]) : baseR))
						.attr('fill', (d) => {
							const id = makeId(key, d.x);
							if (pointOverrides[id]) return pointOverrides[id];
							if (colorField) return colorByValue((d.row as any)[colorField], globalIndex++);
							const c = finalPointColor(key, i, globalIndex, d.x);
							globalIndex++;
							return c;
						})
						.each(function (d) {
							applyOverrideStroke(select(this), key, d.x);
						})
						.style('cursor', canColorIndividually ? 'pointer' : 'default')
						.on('click', (_ev, d: any) => {
							if (!canColorIndividually) return;
							dispatch('itemClick', {
								id: makeId(key, d.x),
								series: key,
								x: d.x,
								y: d.y
							});
						})
						.attr('opacity', 0.82)
						.on('pointerenter', (ev, d: any) => {
							let html = `<b>${key}</b><br/>${String(enc.x)}: ${d.x}<br/>value: ${d.y}`;
							if (enc.size) {
								const sv = (d.row as any)[enc.size];
								html += `<br/>${enc.size}: ${sv}`;
							}
							if (colorField) {
								const cv = (d.row as any)[colorField];
								html += `<br/>${colorField}: ${cv}`;
							}
							if (tooltipCols.length) {
								for (const col of tooltipCols) {
									if (col === enc.x || col === key || col === enc.size) continue;
									const v = (d.row as any)[col];
									html += `<br/>${col}: ${v}`;
								}
							}
							showTip(html, ev);
						})
						.on('pointermove', moveTip)
						.on('pointerleave', hideTip);
				}
				if (colorField) {
					drawLegend(colorDomain, (lab, i) => colorByValue(lab, i));
				} else if (colorMode === 'series') drawLegend(seriesKeys, seriesColor);
			} else if (mark === 'bar') {
				let globalBarIndex = 0;
				if (isBarH) {
					// Horizontal grouped bars
					const yBand = y as ScaleBand<string>;
					const categories = yBand.domain();
					const innerPad = clamp(Number(opts.bar?.innerPadding ?? 0.05), 0, 0.5);
					const inner = scaleBand<string>()
						.domain(seriesKeys)
						.range([0, yBand.bandwidth()])
						.padding(innerPad);
					for (const cat of categories) {
						const gcat = gPlot.append('g').attr('transform', `translate(0,${yBand(cat) ?? 0})`);
						for (const [i, k] of seriesKeys.entries()) {
							const r = (rows as any[]).find((row) => String(row[enc.x!]) === cat);
							const val = r ? toNum((r as any)[k]) : null;
							if (val == null) continue;
							const id = makeId(k, cat);
							let baseCol: string;
							if (pointOverrides[id]) baseCol = pointOverrides[id];
							else if (colorMode === 'point') baseCol = palette[globalBarIndex++ % palette.length];
							else baseCol = seriesColor(k, i);
							const rect = gcat
								.append('rect')
								.attr('y', inner(k) ?? 0)
								.attr('x', x(0))
								.attr('height', inner.bandwidth())
								.attr('width', Math.max(0, x(val) - x(0)))
								.attr('fill', baseCol)
								.style('cursor', canColorIndividually ? 'pointer' : 'default')
								.on('click', () => {
									if (!canColorIndividually) return;
									dispatch('itemClick', {
										id,
										series: k,
										x: cat,
										y: val
									});
								})
								.on('pointerenter', (ev) => showTip(`<b>${String(cat)}</b><br/>${k}: ${val}`, ev))
								.on('pointermove', moveTip)
								.on('pointerleave', hideTip);
							applyOverrideStroke(rect, k, cat);
						}
					}
				} else {
					// Vertical grouped bars
					const band = x as ScaleBand<string>;
					const categories = band.domain();
					const innerPad = clamp(Number(opts.bar?.innerPadding ?? 0.05), 0, 0.5);
					const inner = scaleBand<string>()
						.domain(seriesKeys)
						.range([0, band.bandwidth()])
						.padding(innerPad);
					for (const cat of categories) {
						const gcat = gPlot.append('g').attr('transform', `translate(${band(cat) ?? 0},0)`);
						for (const [i, k] of seriesKeys.entries()) {
							const r = (rows as any[]).find((row) => String(row[enc.x!]) === cat);
							const val = r ? toNum((r as any)[k]) : null;
							if (val == null) continue;
							const id = makeId(k, cat);
							let baseCol: string;
							if (pointOverrides[id]) baseCol = pointOverrides[id];
							else if (colorMode === 'point') baseCol = palette[globalBarIndex++ % palette.length];
							else baseCol = seriesColor(k, i);
							const rect = gcat
								.append('rect')
								.attr('x', inner(k) ?? 0)
								.attr('y', y(val))
								.attr('width', inner.bandwidth())
								.attr('height', ih - y(val))
								.attr('fill', baseCol)
								.style('cursor', canColorIndividually ? 'pointer' : 'default')
								.on('click', () => {
									if (!canColorIndividually) return;
									dispatch('itemClick', {
										id,
										series: k,
										x: cat,
										y: val
									});
								})
								.on('pointerenter', (ev) => showTip(`<b>${String(cat)}</b><br/>${k}: ${val}`, ev))
								.on('pointermove', moveTip)
								.on('pointerleave', hideTip);
							applyOverrideStroke(rect, k, cat);
						}
					}
				}
				if (colorField) {
					drawLegend(colorDomain, (lab, i) => colorByValue(lab, i));
				} else if (colorMode === 'series') drawLegend(seriesKeys, seriesColor);
			} else if (mark === 'area') {
				// Area chart: simple for one series; stacked for multiple
				const curve = curveFrom(opts.area?.curve ?? 'linear');
				// Prepare X points in order
				let xOrdered: any[] = [];
				if (hasBand(x)) {
					xOrdered = (x.domain() as string[]).slice();
				} else if (xType === 'time') {
					xOrdered = (rows as any[])
						.map((r) => (enc.x ? (r as any)[enc.x] : null))
						.filter((v) => v != null)
						.sort((a, b) => +toDate(a)! - +toDate(b)!);
				} else {
					xOrdered = (rows as any[])
						.map((r) => (enc.x ? (r as any)[enc.x] : null))
						.filter((v) => v != null)
						.sort((a, b) => toNum(a)! - toNum(b)!);
				}
				// Deduplicate
				xOrdered = Array.from(new Set(xOrdered));

				if (seriesKeys.length <= 1) {
					const key = seriesKeys[0] ?? (enc.y ? enc.y[0] : null);
					if (!key) return;
					const pts = xOrdered
						.map((vx, i) => {
							const row = (rows as any[]).find((r) => String((r as any)[enc.x!]) === String(vx));
							const yv = row ? toNum((row as any)[key]) : null;
							return { x: vx, y: yv ?? 0 };
						})
						.filter((d) => inXDomain(d.x));
					const area = shapeArea<any>()
						.x((d, i) => xPos(d.x, i))
						.y0(() => y(0))
						.y1((d) => yPos(d.y))
						.curve(curve);
					gPlot
						.append('path')
						.attr('fill', palette[0])
						.attr('opacity', 0.6)
						.attr('d', area(pts) ?? null);
					return;
				}

				// Stacked area: compute cumulative y per x across series order
				const stackData: { x: any; layers: { key: string; y0: number; y1: number }[] }[] =
					xOrdered.map((vx) => ({ x: vx, layers: [] }));
				for (const sd of stackData) {
					let acc = 0;
					for (const key of seriesKeys) {
						const row = (rows as any[]).find((r) => String((r as any)[enc.x!]) === String(sd.x));
						const val = row ? (toNum((row as any)[key]) ?? 0) : 0;
						sd.layers.push({ key, y0: acc, y1: acc + val });
						acc += val;
					}
				}
				for (const [i, key] of seriesKeys.entries()) {
					const pts = stackData
						.map((sd) => ({ x: sd.x, y0: sd.layers[i].y0, y1: sd.layers[i].y1 }))
						.filter((d) => inXDomain(d.x));
					const area = shapeArea<any>()
						.x((d, idx) => xPos(d.x, idx))
						.y0((d) => y(d.y0))
						.y1((d) => y(d.y1))
						.curve(curve);
					gPlot
						.append('path')
						.attr('fill', seriesOverrides[key] || palette[i % palette.length])
						.attr('opacity', 0.7)
						.attr('d', area(pts) ?? null);
				}
				if (colorMode === 'series') drawLegend(seriesKeys, seriesColor);
				return;
			} else if (mark === 'boxplot') {
				// Box plot: categorical X, single numeric Y
				const xField = enc.x!;
				const yField = enc.y && enc.y[0];
				if (!xField || !yField) {
					root
						.append('text')
						.attr('x', iw / 2)
						.attr('y', ih / 2)
						.attr('text-anchor', 'middle')
						.text('Select category (X) and one numeric value (Y)');
					return;
				}
				const categories = Array.from(
					new Set((rows as any[]).map((r) => String((r as any)[xField])))
				);
				const band = scaleBand<string>().domain(categories).range([0, iw]).padding(0.2);
				const grouped: Record<string, number[]> = {};
				for (const cat of categories) grouped[cat] = [];
				for (const r of rows as any[]) {
					const cat = String((r as any)[xField]);
					const n = toNum((r as any)[yField]);
					if (n != null && isFinite(n)) grouped[cat].push(n);
				}
				function quantiles(a: number[]) {
					const s = a.slice().sort((x, y) => x - y);
					const q1 = s[Math.floor((s.length - 1) * 0.25)];
					const q2 = s[Math.floor((s.length - 1) * 0.5)];
					const q3 = s[Math.floor((s.length - 1) * 0.75)];
					const iqr = q3 - q1;
					const lo = s.find((v) => v >= q1 - 1.5 * iqr) ?? s[0];
					const hi =
						s
							.slice()
							.reverse()
							.find((v) => v <= q3 + 1.5 * iqr) ?? s[s.length - 1];
					const outliers = s.filter((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
					return { q1, q2, q3, lo, hi, outliers };
				}
				const stats = categories.map((c) => ({ c, ...quantiles(grouped[c]) }));
				const yMin = Math.min(...stats.map((s) => s.lo));
				const yMax = Math.max(...stats.map((s) => s.hi));
				const yScale = scaleLinear().domain([yMin, yMax]).nice().range([ih, 0]);

				gx.call(axisBottom(band));
				gy.call(axisLeft(yScale).ticks(5));
				placeXLabel();
				placeYLabel();
				rotateTicks();

				const boxW = Math.max(6, band.bandwidth() * 0.6);
				const centerX = (c: string) => (band(c) ?? 0) + band.bandwidth() / 2;

				for (const [i, s] of stats.entries()) {
					const cx = centerX(s.c);
					const fill = palette[i % palette.length];
					// Whiskers
					root
						.append('line')
						.attr('x1', cx)
						.attr('x2', cx)
						.attr('y1', yScale(s.lo))
						.attr('y2', yScale(s.hi))
						.attr('stroke', '#333');
					root
						.append('line')
						.attr('x1', cx - boxW * 0.35)
						.attr('x2', cx + boxW * 0.35)
						.attr('y1', yScale(s.lo))
						.attr('y2', yScale(s.lo))
						.attr('stroke', '#333');
					root
						.append('line')
						.attr('x1', cx - boxW * 0.35)
						.attr('x2', cx + boxW * 0.35)
						.attr('y1', yScale(s.hi))
						.attr('y2', yScale(s.hi))
						.attr('stroke', '#333');
					// Box
					root
						.append('rect')
						.attr('x', cx - boxW / 2)
						.attr('y', yScale(s.q3))
						.attr('width', boxW)
						.attr('height', Math.max(1, yScale(s.q1) - yScale(s.q3)))
						.attr('fill', fill)
						.attr('opacity', 0.6)
						.attr('stroke', '#333');
					// Median
					root
						.append('line')
						.attr('x1', cx - boxW / 2)
						.attr('x2', cx + boxW / 2)
						.attr('y1', yScale(s.q2))
						.attr('y2', yScale(s.q2))
						.attr('stroke', '#111')
						.attr('stroke-width', 1.5);
					// Outliers
					for (const v of s.outliers) {
						root
							.append('circle')
							.attr('cx', cx)
							.attr('cy', yScale(v))
							.attr('r', 2.5)
							.attr('fill', fill)
							.attr('opacity', 0.8);
					}
				}
				return;
			} else if (mark === 'arc') {
				// Arc diagram: nodes along baseline at bottom; arcs connect source->target with thickness by value
				const srcField = enc.source;
				const tgtField = enc.target;
				const valField = enc.value;
				if (!srcField || !tgtField) {
					root
						.append('text')
						.attr('x', iw / 2)
						.attr('y', ih / 2)
						.attr('text-anchor', 'middle')
						.text('Select source and target fields');
					return;
				}
				const links = (rows as any[])
					.map((r) => ({
						s: String((r as any)[srcField]),
						t: String((r as any)[tgtField]),
						w: valField ? (toNum((r as any)[valField]) ?? 1) : 1
					}))
					.filter((d) => d.s != null && d.t != null && isFinite(d.w));
				const nodes = Array.from(new Set(links.flatMap((l) => [l.s, l.t])));
				const xb = scaleBand<string>().domain(nodes).range([0, iw]).padding(0.1);
				const baselineY = ih - 10;
				const wVals = links.map((l) => l.w);
				const wMin = Math.min(...wVals);
				const wMax = Math.max(...wVals);
				const strokeScale = (v: number) => {
					if (!isFinite(v) || wMax <= 0) return 1.5;
					const mn = Math.max(0, wMin);
					const mx = wMax;
					return 1.5 + ((v - mn) / (mx - mn || 1)) * 8; // 1.5..9.5 px
				};

				// Draw nodes and labels
				const gn = root.append('g');
				gn.selectAll('line')
					.data(nodes)
					.enter()
					.append('line')
					.attr('x1', (d) => (xb(d) ?? 0) + xb.bandwidth() / 2)
					.attr('x2', (d) => (xb(d) ?? 0) + xb.bandwidth() / 2)
					.attr('y1', baselineY)
					.attr('y2', baselineY + 6)
					.attr('stroke', '#555');
				gn.selectAll('text')
					.data(nodes)
					.enter()
					.append('text')
					.attr('x', (d) => (xb(d) ?? 0) + xb.bandwidth() / 2)
					.attr('y', baselineY + 18)
					.attr('text-anchor', 'middle')
					.attr('font-size', 11)
					.text((d) => d);

				// Draw arcs (quadratic Bezier)
				const gl = root.append('g').attr('fill', 'none');
				gl.selectAll('path')
					.data(links)
					.enter()
					.append('path')
					.attr('d', (d) => {
						const x1 = (xb(d.s) ?? 0) + xb.bandwidth() / 2;
						const x2 = (xb(d.t) ?? 0) + xb.bandwidth() / 2;
						const dx = Math.abs(x2 - x1);
						const h = Math.max(20, dx * 0.4);
						const cpx = (x1 + x2) / 2;
						const cpy = baselineY - h;
						return `M${x1},${baselineY} Q${cpx},${cpy} ${x2},${baselineY}`;
					})
					.attr('stroke', (d, i) => palette[i % palette.length])
					.attr('stroke-width', (d) => strokeScale(d.w))
					.attr('opacity', 0.8);
				return;
			} else if (mark === 'alluvial') {
				// Basic two-column alluvial (sankey-like) for Source -> Target using value as weight
				const srcField = enc.source;
				const tgtField = enc.target;
				const valField = enc.value;
				if (!srcField || !tgtField) {
					root
						.append('text')
						.attr('x', iw / 2)
						.attr('y', ih / 2)
						.attr('text-anchor', 'middle')
						.text('Select source and target fields');
					return;
				}
				// Aggregate values by pair
				const agg = new Map<string, number>();
				const srcSet = new Set<string>();
				const tgtSet = new Set<string>();
				for (const r of rows as any[]) {
					const s = String((r as any)[srcField]);
					const t = String(/**/ (r as any)[tgtField]);
					const w = valField ? (toNum((r as any)[valField]) ?? 1) : 1;
					if (!isFinite(w)) continue;
					srcSet.add(s);
					tgtSet.add(t);
					const key = `${s}\u0000${t}`;
					agg.set(key, (agg.get(key) ?? 0) + w);
				}
				const sources = Array.from(srcSet);
				const targets = Array.from(tgtSet);
				const links = Array.from(agg, ([k, v]) => {
					const [s, t] = k.split('\u0000');
					return { s, t, w: v };
				});
				const total = links.reduce((a, b) => a + b.w, 0) || 1;

				// Layout columns
				const colPad = 80;
				const xSrc = 0 + 10;
				const xTgt = iw - colPad;
				const nodePad = 8;
				const colWidth = 18;
				const heightAvail = ih - 20;

				function layoutColumn(nodes: string[], weights: Map<string, number>) {
					const sumW = Array.from(weights.values()).reduce((a, b) => a + b, 0) || 1;
					const k = (heightAvail - nodePad * (nodes.length - 1)) / sumW;
					let y = 10;
					const pos: Record<string, { y0: number; y1: number }> = {};
					for (const n of nodes) {
						const h = (weights.get(n) ?? 0) * k;
						pos[n] = { y0: y, y1: y + h };
						y += h + nodePad;
					}
					return { pos, k };
				}

				// Compute node weights
				const srcW = new Map<string, number>();
				const tgtW = new Map<string, number>();
				for (const { s, t, w } of links) {
					srcW.set(s, (srcW.get(s) ?? 0) + w);
					tgtW.set(t, (tgtW.get(t) ?? 0) + w);
				}
				const srcLayout = layoutColumn(sources, srcW);
				const tgtLayout = layoutColumn(targets, tgtW);

				// Draw nodes
				const gNodes = root.append('g');
				gNodes
					.selectAll('rect.src')
					.data(sources)
					.enter()
					.append('rect')
					.attr('class', 'src')
					.attr('x', xSrc)
					.attr('y', (d) => srcLayout.pos[d].y0)
					.attr('width', colWidth)
					.attr('height', (d) => Math.max(2, srcLayout.pos[d].y1 - srcLayout.pos[d].y0))
					.attr('fill', (d, i) => palette[i % palette.length])
					.attr('opacity', 0.85);
				gNodes
					.selectAll('rect.tgt')
					.data(targets)
					.enter()
					.append('rect')
					.attr('class', 'tgt')
					.attr('x', xTgt)
					.attr('y', (d) => tgtLayout.pos[d].y0)
					.attr('width', colWidth)
					.attr('height', (d) => Math.max(2, tgtLayout.pos[d].y1 - tgtLayout.pos[d].y0))
					.attr('fill', (d, i) => palette[i % palette.length])
					.attr('opacity', 0.85);
				// Labels
				gNodes
					.selectAll('text.src')
					.data(sources)
					.enter()
					.append('text')
					.attr('x', xSrc - 6)
					.attr('y', (d) => (srcLayout.pos[d].y0 + srcLayout.pos[d].y1) / 2)
					.attr('text-anchor', 'end')
					.attr('dominant-baseline', 'middle')
					.attr('font-size', 11)
					.text((d) => d);
				gNodes
					.selectAll('text.tgt')
					.data(targets)
					.enter()
					.append('text')
					.attr('x', xTgt + colWidth + 6)
					.attr('y', (d) => (tgtLayout.pos[d].y0 + tgtLayout.pos[d].y1) / 2)
					.attr('text-anchor', 'start')
					.attr('dominant-baseline', 'middle')
					.attr('font-size', 11)
					.text((d) => d);

				// Draw flows
				const gLinks = root.append('g').attr('fill', 'none').attr('stroke-opacity', 0.4);
				// Track offsets within each node
				const srcOffset = new Map<string, number>();
				const tgtOffset = new Map<string, number>();
				for (const s of sources) srcOffset.set(s, srcLayout.pos[s].y0);
				for (const t of targets) tgtOffset.set(t, tgtLayout.pos[t].y0);
				const xL = xSrc + colWidth;
				const xR = xTgt;
				const dx = xR - xL;
				const curvature = 0.5;
				const kSrc =
					(heightAvail - nodePad * (sources.length - 1)) /
					(Array.from(srcW.values()).reduce((a, b) => a + b, 0) || 1);
				const kTgt =
					(heightAvail - nodePad * (targets.length - 1)) /
					(Array.from(tgtW.values()).reduce((a, b) => a + b, 0) || 1);
				links.sort((a, b) => sources.indexOf(a.s) - sources.indexOf(b.s));
				for (const [i, link] of links.entries()) {
					const hL = link.w * kSrc;
					const hR = link.w * kTgt;
					const y0 = srcOffset.get(link.s)! + hL / 2;
					const y1 = tgtOffset.get(link.t)! + hR / 2;
					const c1x = xL + dx * curvature;
					const c2x = xR - dx * curvature;
					const path = `M${xL},${y0} C${c1x},${y0} ${c2x},${y1} ${xR},${y1}`;
					gLinks
						.append('path')
						.attr('d', path)
						.attr('stroke', palette[i % palette.length])
						.attr('stroke-width', Math.max(2, (hL + hR) / 2));
					srcOffset.set(link.s, srcOffset.get(link.s)! + hL);
					tgtOffset.set(link.t, tgtOffset.get(link.t)! + hR);
				}
				return;
			}

			// ===== Interaction modes =====
			if (interactionMode === 'zoom') {
				// Zoom/brush (supports band on either axis)
				{
					const resetXDom = baseXDom ? (baseXDom.slice() as any[]) : (x.domain() as any[]).slice();
					const resetYDom = hasBand(y)
						? (y.domain() as any[]).slice()
						: baseYDom
							? (baseYDom.slice() as any[])
							: (y.domain() as any[]).slice();
					function clampContinuousDom(
						proposed: [any, any],
						base: [any, any],
						type: 'time' | 'number'
					): [any, any] {
						let lo = +proposed[0];
						let hi = +proposed[1];
						if (lo > hi) [lo, hi] = [hi, lo];
						const span = Math.max(hi - lo, 1e-6);
						const b0 = +base[0];
						const b1 = +base[1];
						if (lo < b0) {
							lo = b0;
							hi = lo + span;
						}
						if (hi > b1) {
							hi = b1;
							lo = hi - span;
						}
						return type === 'time' ? [new Date(lo), new Date(hi)] : [lo, hi];
					}
					let brushing = false;
					let suppressNextClick = false;
					const gBrush = root.append('g').attr('class', 'brush');
					const br = brush()
						.extent([
							[0, 0],
							[iw, ih]
						])
						.on('start', () => {
							brushing = true;
						})
						.on('end', (ev: any) => {
							brushing = false;
							const sel = ev.selection as [[number, number], [number, number]] | null;
							if (!sel) return;
							const [[x0, y0], [x1, y1]] = sel;
							let newXDom: any[] | undefined;
							if (hasBand(x)) {
								const cats = (x as ScaleBand<string>).domain();
								newXDom = cats.filter((c) => {
									const cpx = (x(c) ?? 0) + x.bandwidth() / 2;
									return cpx >= x0 && cpx <= x1;
								});
								if (newXDom.length < 1) newXDom = undefined;
							} else if ((x as any).invert) {
								const raw: [any, any] = [(x as any).invert(x0), (x as any).invert(x1)];
								newXDom = baseXDom
									? clampContinuousDom(
											raw,
											baseXDom as [any, any],
											xType === 'time' ? 'time' : 'number'
										)
									: raw;
							}
							let newYDom: any[] | undefined;
							if (hasBand(y)) {
								const cats = (y as ScaleBand<string>).domain();
								newYDom = cats.filter((c) => {
									const cpy = (y(c) ?? 0) + y.bandwidth() / 2;
									return cpy >= y0 && cpy <= y1;
								});
								if (newYDom.length < 1) newYDom = undefined;
							} else {
								const yMin = Math.min(y0, y1);
								const yMax = Math.max(y0, y1);
								let dom: [number, number] = [(y as any).invert(yMax), (y as any).invert(yMin)];
								if (baseYDom) dom = clampContinuousDom(dom, baseYDom, 'number') as [number, number];
								newYDom = dom;
							}
							gBrush.call(br.move as any, null);
							suppressNextClick = true;
							draw(newXDom, newYDom as any);
						});
					gBrush.call(br as any);
					root.on('dblclick', () => {
						suppressNextClick = true;
						curXDomOverride = null;
						curYDomOverride = null;
						draw(resetXDom, resetYDom as any);
					});
					root.on('click', (ev: MouseEvent) => {
						if (suppressNextClick) {
							suppressNextClick = false;
							return;
						}
						if (brushing || ev.detail !== 1) return;
						const [px, py] = pointer(ev as any, root.node() as any);
						let newXDom: any[] | undefined;
						let newYDom: any[] | undefined;
						const factor = 2;
						if (!hasBand(x) && (x as any).invert) {
							const cx = (x as any).invert(px);
							const xd = (x as any).domain();
							const spanX: any = (+xd[1] as any) - (+xd[0] as any);
							const half = spanX / (2 * factor);
							let rawX: [any, any] = [new Date(+cx - +half), new Date(+cx + +half)] as any;
							if (xType === 'number' || isBarH) rawX = [(+cx - +half) as any, (+cx + +half) as any];
							newXDom = baseXDom
								? clampContinuousDom(
										rawX,
										baseXDom as [any, any],
										xType === 'time' ? 'time' : 'number'
									)
								: rawX;
						}
						if (hasBand(y)) {
							const cats = (y as ScaleBand<string>).domain();
							const idx = cats.findIndex(
								(c) => py >= (y(c) ?? -1) && py <= (y(c) ?? -1) + y.bandwidth()
							);
							if (idx >= 0) {
								const half = Math.max(1, Math.floor(cats.length / (2 * factor)));
								const start = Math.max(0, idx - half);
								newYDom = cats.slice(start, Math.min(cats.length, start + 2 * half));
							}
						} else {
							const cy = (y as any).invert(py);
							const yd = (y as any).domain();
							const spanY = yd[1] - yd[0];
							const halfY = spanY / (2 * factor);
							let rawY: [number, number] = [cy - halfY, cy + halfY];
							newYDom = baseYDom
								? (clampContinuousDom(rawY, baseYDom, 'number') as [number, number])
								: rawY;
						}
						draw(newXDom, newYDom as any);
					});
				}
			} else if (interactionMode === 'pan') {
				// Enhanced smooth pan: horizontal, vertical, diagonal with rAF batching
				const overlay = root
					.append('rect')
					.attr('class', 'pan-overlay')
					.attr('x', 0)
					.attr('y', 0)
					.attr('width', iw)
					.attr('height', ih)
					.attr('fill', 'transparent')
					.style('cursor', 'grab');

				let panStart: {
					px: number;
					py: number;
					xDomain: any[] | [any, any];
					yDomain: any[] | [any, any];
				} | null = null;

				function normalizedDomain(d: any[] | [any, any]) {
					return Array.isArray(d) ? d : [d[0], d[1]];
				}
				function clampContinuous(
					newLo: number,
					newHi: number,
					base: [number | Date, number | Date]
				): [number, number] {
					const b0 = +base[0];
					const b1 = +base[1];
					const span = newHi - newLo;
					if (newLo < b0) {
						newLo = b0;
						newHi = newLo + span;
					}
					if (newHi > b1) {
						newHi = b1;
						newLo = newHi - span;
					}
					return [newLo, newHi];
				}

				function blockSelect(e: Event) {
					e.preventDefault();
				}

				// Accumulators for fractional band shifts
				let accumDx = 0;
				let accumDy = 0;
				let panFrame: number | null = null;
				let latestDx = 0;
				let latestDy = 0;

				function schedulePanUpdate() {
					if (panFrame != null) return;
					panFrame = requestAnimationFrame(() => {
						panFrame = null;
						if (!panStart) return;

						let nextX: any[] | [any, any] | null = null;
						let nextY: any[] | [any, any] | null = null;

						// X axis
						if (hasBand(x)) {
							const full = (baseXDom as string[]) ?? (x.domain() as string[]);
							const visible = panStart.xDomain as string[];
							if (full.length && visible.length) {
								const bandW = x.bandwidth() || iw / visible.length;
								if (bandW > 0) {
									accumDx += -latestDx;
									const threshold = bandW * 0.25; // quarter band threshold for smoother steps
									let shift = 0;
									while (accumDx >= threshold) {
										shift++;
										accumDx -= bandW;
									}
									while (accumDx <= -threshold) {
										shift--;
										accumDx += bandW;
									}
									if (shift !== 0) {
										const firstIndex = full.indexOf(visible[0]);
										if (firstIndex !== -1) {
											let newStart = firstIndex + shift;
											if (newStart < 0) newStart = 0;
											if (newStart > full.length - visible.length)
												newStart = full.length - visible.length;
											const slice = full.slice(newStart, newStart + visible.length);
											if (JSON.stringify(slice) !== JSON.stringify(visible)) nextX = slice;
										}
									}
								}
							}
						} else if ((x as any).invert) {
							const orig = normalizedDomain(panStart.xDomain) as [any, any];
							const spanDomain = +orig[1] - +orig[0];
							if (spanDomain > 0) {
								const unitsPerPx = spanDomain / iw;
								let newLo = +orig[0] - latestDx * unitsPerPx;
								let newHi = +orig[1] - latestDx * unitsPerPx;
								if (baseXDom && baseXDom.length === 2)
									[newLo, newHi] = clampContinuous(newLo, newHi, baseXDom as [any, any]);
								nextX = xType === 'time' ? [new Date(newLo), new Date(newHi)] : [newLo, newHi];
							}
						}

						// Y axis
						if (hasBand(y)) {
							const full = isBarH
								? (categoriesDomain as string[])
								: yType === 'band'
									? (yCategoriesDomain as string[])
									: (y.domain() as string[]);
							const visible = panStart.yDomain as string[];
							if (full.length && visible.length) {
								const bandW = y.bandwidth() || ih / visible.length;
								if (bandW > 0) {
									accumDy += -latestDy;
									const threshold = bandW * 0.25;
									let shift = 0;
									while (accumDy >= threshold) {
										shift++;
										accumDy -= bandW;
									}
									while (accumDy <= -threshold) {
										shift--;
										accumDy += bandW;
									}
									if (shift !== 0) {
										const firstIndex = full.indexOf(visible[0]);
										if (firstIndex !== -1) {
											let newStart = firstIndex + shift;
											if (newStart < 0) newStart = 0;
											if (newStart > full.length - visible.length)
												newStart = full.length - visible.length;
											const slice = full.slice(newStart, newStart + visible.length);
											if (JSON.stringify(slice) !== JSON.stringify(visible)) nextY = slice;
										}
									}
								}
							}
						} else if ((y as any).invert) {
							const orig = normalizedDomain(panStart.yDomain) as [any, any];
							const spanDomain = +orig[1] - +orig[0];
							if (spanDomain > 0) {
								const unitsPerPx = spanDomain / ih;
								let newLo = +orig[0] + latestDy * unitsPerPx; // down drag -> move domain down
								let newHi = +orig[1] + latestDy * unitsPerPx;
								if (baseYDom)
									[newLo, newHi] = clampContinuous(newLo, newHi, baseYDom as [any, any]);
								nextY = [newLo, newHi];
							}
						}

						if (nextX || nextY) {
							draw(nextX ?? (x.domain() as any[]), nextY ?? (y.domain() as any[]));
						}
					});
				}

				overlay.on('pointerdown', (ev: PointerEvent) => {
					ev.preventDefault();
					const [px, py] = pointer(ev as any, overlay.node() as any);
					panStart = {
						px,
						py,
						xDomain: hasBand(x) ? (x.domain() as any[]) : (x.domain() as [any, any]),
						yDomain: hasBand(y) ? (y.domain() as any[]) : (y.domain() as [any, any])
					};
					accumDx = 0;
					accumDy = 0;
					latestDx = 0;
					latestDy = 0;
					overlay.style('cursor', 'grabbing');
					wrapEl?.classList.add('panning');
					document.documentElement.classList.add('global-noselect');
					document.addEventListener('selectstart', blockSelect, { capture: true });
					(window as any).addEventListener('pointermove', onMove, { passive: false });
					(window as any).addEventListener('pointerup', onUp, { once: true });
					(ev.target as HTMLElement).setPointerCapture(ev.pointerId);
				});

				function onMove(ev: PointerEvent) {
					if (!panStart) return;
					ev.preventDefault();
					const [mx, my] = pointer(ev as any, overlay.node() as any);
					latestDx = mx - panStart.px;
					latestDy = my - panStart.py;
					schedulePanUpdate();
				}

				function onUp() {
					panStart = null;
					overlay.style('cursor', 'grab');
					wrapEl?.classList.remove('panning');
					document.documentElement.classList.remove('global-noselect');
					document.removeEventListener('selectstart', blockSelect, { capture: true } as any);
					(window as any).removeEventListener('pointermove', onMove);
					if (panFrame != null) {
						cancelAnimationFrame(panFrame);
						panFrame = null;
					}
				}
			} else {
				// interactionMode === 'none' : no zoom / no pan => coloring & tooltips only
				root.style('cursor', 'default');
				// No extra handlers (ensures clicks reach marks)
			}
		}

		// Initial draw uses existing overrides if present
		draw(curXDomOverride ?? undefined, curYDomOverride ?? undefined);
	});
</script>

<div class="chart-wrap" bind:this={wrapEl}>
	<svg bind:this={svgEl} role="img" aria-label={spec.title ?? 'Chart'}></svg>
	<div class="tooltip" bind:this={tipEl}></div>
</div>

<style>
	.chart-wrap {
		position: relative;
		width: 100%;
		overflow: hidden; /* contain long tick labels */
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.tooltip {
		position: absolute;
		display: none;
		pointer-events: none;
		background: rgba(30, 41, 59, 0.95);
		color: #fff;
		font-size: 12px;
		padding: 6px 8px;
		border-radius: 6px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		max-width: 260px;
	}

	.chart-wrap {
		position: relative;
		width: 100%;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}
	.tooltip {
		position: absolute;
		display: none;
		pointer-events: none;
		background: rgba(30, 41, 59, 0.95);
		color: #fff;
		font-size: 12px;
		padding: 6px 8px;
		border-radius: 6px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		max-width: 260px;
	}
	:global(.pan-overlay) {
		touch-action: none;
	}
	:global(.chart-wrap.panning),
	:global(.chart-wrap.panning *) {
		user-select: none;
		-webkit-user-select: none;
	}

	:global(.global-noselect),
	:global(.global-noselect *) {
		user-select: none !important;
		-webkit-user-select: none !important;
	}
</style>
