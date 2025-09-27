<script lang="ts">
	import { select, pointer } from 'd3-selection';
	import { scaleLinear, scaleBand, scaleUtc, scaleOrdinal, type ScaleBand } from 'd3-scale';
	import { axisBottom, axisLeft } from 'd3-axis';
	import { extent, max, rollups, sum, bin } from 'd3-array';
	import {
		line as shapeLine,
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
		height = 500
	} = $props<{
		spec: ChartSpec;
		rows: Record<string, unknown>[];
		width?: number;
		height?: number;
	}>();

	let svgEl = $state<SVGSVGElement | null>(null);
	let wrapEl = $state<HTMLDivElement | null>(null);
	let tipEl = $state<HTMLDivElement | null>(null);

	// Keep the original (full) domains for double‑click reset
	let baseXDom: any[] | null = null;
	let baseYDom: [number, number] | null = null;

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

	$effect(() => {
		if (!svgEl) return;

		// Reset base domains whenever spec/rows/size change and we redraw
		baseXDom = null;
		baseYDom = null;

		const svg = select(svgEl);
		function draw(xDom?: any[], yDom?: any[]) {
			svg.selectAll('*').remove();

			const opts = (spec.options ?? {}) as any;

			// rotations and margins
			const xRot: 0 | 45 | 90 = normRot(opts.axis?.xTickRotate ?? 0);
			const yRot: 0 | 45 | 90 = normRot(opts.axis?.yTickRotate ?? 0);
			const extraBottom = xRot === 90 ? 90 : xRot === 45 ? 44 : 18;
			const extraLeft = yRot === 90 ? 72 : yRot === 45 ? 32 : 0;

			const margin = { top: 28, right: 16, bottom: 40 + extraBottom, left: 56 + extraLeft };
			const iw = Math.max(10, width - margin.left - margin.right);
			const ih = Math.max(10, height - margin.top - margin.bottom);

			svg.attr('width', width).attr('height', height);
			const root = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

			const mark = spec.mark;
			const enc = spec.encoding ?? {};
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

			function placeXLabel() {
				if (!xLabel) return;
				root
					.append('text')
					.attr('x', iw / 2)
					.attr('y', ih + 36)
					.attr('text-anchor', 'middle')
					.attr('fill', '#333')
					.text(xLabel);
			}
			function placeYLabel() {
				if (!yLabel) return;
				root
					.append('text')
					.attr('transform', 'rotate(-90)')
					.attr('x', -ih / 2)
					.attr('y', -44)
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

			// Legend helper
			function drawLegend(labels: string[]) {
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
					.attr('fill', (_d, i) => palette[i % palette.length])
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

			// Require X/Y
			if (!enc.x || !enc.y || !enc.y.length) {
				root
					.append('text')
					.attr('x', iw / 2)
					.attr('y', ih / 2)
					.attr('text-anchor', 'middle')
					.text('Select X and Y columns');
				return;
			}

			// Build scales
			const xVals = (rows as any[]).map((r) => r[enc.x!]);
			let xType: 'band' | 'number' | 'time';
			if (xVals.every(isDateish)) xType = 'time';
			else if (xVals.every(isNum)) xType = 'number';
			else xType = 'band';

			let x: any;
			if (mark === 'bar') {
				const domain = Array.from(new Set(xVals.map((v) => String(v))));
				if (!baseXDom) baseXDom = domain.slice();
				x = scaleBand<string>()
					.domain(xDom?.length ? (xDom as string[]) : domain)
					.range([0, iw])
					.padding(clamp(Number(opts.bar?.padding ?? 0.2), 0, 0.5));
				// no .nice() for band
			} else if (xType === 'time') {
				const dates = xVals.map(toDate) as Date[];
				const dom = extent(dates) as [Date, Date];
				if (!baseXDom) baseXDom = dom.slice() as any[];
				x = scaleUtc()
					.domain((xDom?.length ? (xDom as Date[]) : dom) as [Date, Date])
					.range([0, iw]);
				if (!xDom?.length) x.nice(); // don't nice when zoomed
			} else if (xType === 'number') {
				const nums = xVals.map(toNum) as number[];
				const dom = extent(nums) as [number, number];
				if (!baseXDom) baseXDom = dom.slice() as any[];
				x = scaleLinear()
					.domain((xDom?.length ? (xDom as number[]) : dom) as [number, number])
					.range([0, iw]);
				if (!xDom?.length) x.nice(); // don't nice when zoomed
			} else {
				const domain = Array.from(new Set(xVals.map((v) => String(v))));
				if (!baseXDom) baseXDom = domain.slice();
				x = scaleBand<string>()
					.domain(xDom?.length ? (xDom as string[]) : domain)
					.range([0, iw])
					.padding(0.1);
			}

			const seriesKeys: string[] = enc.y!;
			const paletteScale = scaleOrdinal<string, string>().domain(seriesKeys).range(palette);

			// Y scale (numeric)
			const allYValues: number[] = [];
			for (const key of seriesKeys)
				for (const r of rows as any[]) {
					const v = toNum(r[key]);
					if (v != null) allYValues.push(v);
				}
			const yDomDefault: [number, number] = [0, max(allYValues) ?? 0];
			if (!baseYDom) baseYDom = yDomDefault.slice() as [number, number];
			const y = scaleLinear()
				.domain(yDom?.length ? (yDom as [number, number]) : yDomDefault)
				.range([ih, 0]);
			if (!yDom?.length) y.nice(); // don't nice when zoomed

			// Axes
			gx.call(hasBand(x) ? axisBottom(x) : axisBottom(x).ticks(6));
			gy.call(axisLeft(y).ticks(5));
			placeXLabel();
			placeYLabel();
			rotateTicks();

			function seriesColor(key: string, i: number) {
				return seriesOverrides[key] || paletteScale(key) || palette[i % palette.length];
			}

			// Helpers
			function xPos(v: any, idx: number) {
				if (hasBand(x)) {
					const px = x(String(v));
					return (px ?? 0) + x.bandwidth() / 2;
				}
				if (xType === 'time') return x(toDate(v) ?? new Date());
				if (xType === 'number') return x(toNum(v) ?? 0);
				return idx;
			}
			function inXDomain(v: any) {
				if (hasBand(x)) return (x.domain() as string[]).includes(String(v));
				if (xType === 'time') {
					const d = toDate(v);
					if (!d) return false;
					const [a, b] = x.domain() as [Date, Date];
					return d >= a && d <= b;
				}
				if (xType === 'number') {
					const n = toNum(v);
					if (n == null) return false;
					const [a, b] = x.domain() as [number, number];
					return n >= a && n <= b;
				}
				return true;
			}
			function inYDomain(n: number | null) {
				if (n == null) return false;
				const [a, b] = y.domain() as [number, number];
				return n >= a && n <= b;
			}

			// Marks
			if (mark === 'line') {
				const lw = clamp(Number(opts.line?.strokeWidth ?? 2), 0.5, 8);
				const curve = curveFrom(opts.line?.curve ?? 'linear');
				for (const [i, key] of seriesKeys.entries()) {
					const data = (rows as any[])
						.map((r, idx) => ({ x: enc.x ? (r as any)[enc.x] : idx, y: toNum((r as any)[key]) }))
						.filter((d) => inXDomain(d.x) && inYDomain(d.y)) as { x: any; y: number }[];
					const ln = shapeLine<{ x: any; y: number }>()
						.x((d, i) => xPos(d.x, i))
						.y((d) => y(d.y))
						.curve(curve);
					gPlot
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
						.attr('cy', (d) => y(d.y))
						.attr('r', 3)
						.attr('fill', seriesColor(key, i))
						.attr('opacity', 0.0)
						.on('pointerenter', (ev, d: any) =>
							showTip(`<b>${key}</b><br/>${String(enc.x)}: ${d.x}<br/>value: ${d.y}`, ev)
						)
						.on('pointermove', moveTip)
						.on('pointerleave', hideTip);
				}
				drawLegend(seriesKeys);
			} else if (mark === 'scatter') {
				const r = clamp(Number(opts.scatter?.radius ?? 3.5), 1, 12);
				for (const [i, key] of seriesKeys.entries()) {
					const pts = (rows as any[])
						.map((row, idx) => ({
							x: enc.x ? (row as any)[enc.x] : idx,
							y: toNum((row as any)[key])
						}))
						.filter((d) => inXDomain(d.x) && inYDomain(d.y)) as { x: any; y: number }[];
					gPlot
						.append('g')
						.selectAll('circle')
						.data(pts)
						.enter()
						.append('circle')
						.attr('cx', (d, i) => xPos(d.x, i))
						.attr('cy', (d) => y(d.y))
						.attr('r', r)
						.attr('fill', seriesColor(key, i))
						.attr('opacity', 0.85)
						.on('pointerenter', (ev, d: any) =>
							showTip(`<b>${key}</b><br/>${String(enc.x)}: ${d.x}<br/>value: ${d.y}`, ev)
						)
						.on('pointermove', moveTip)
						.on('pointerleave', hideTip);
				}
				drawLegend(seriesKeys);
			} else if (mark === 'bar') {
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
						const val = r ? (toNum((r as any)[k]) ?? 0) : 0;
						gcat
							.append('rect')
							.attr('x', inner(k) ?? 0)
							.attr('y', y(val))
							.attr('width', inner.bandwidth())
							.attr('height', ih - y(val))
							.attr('fill', seriesColor(k, i))
							.on('pointerenter', (ev) => showTip(`<b>${String(cat)}</b><br/>${k}: ${val}`, ev))
							.on('pointermove', moveTip)
							.on('pointerleave', hideTip);
					}
				}
				drawLegend(seriesKeys);
			}

			// Zoom/brush (for non-pie, non-histogram)
			{
				// Reset domains are always the original full domains computed once above
				const resetXDom = baseXDom
					? baseXDom.slice()
					: hasBand(x)
						? (x.domain() as any[]).slice()
						: (x.domain() as any[]).slice();
				const resetYDom = baseYDom
					? (baseYDom.slice() as [number, number])
					: ((y.domain() as [number, number]).slice() as [number, number]);

				// Helper: clamp a continuous domain to the base domain
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
						if (!sel) return; // cleared
						const [[x0, y0], [x1, y1]] = sel;

						let newXDom: any[] | undefined;
						if (hasBand(x)) {
							const cats = (x as ScaleBand<string>).domain();
							newXDom = cats.filter((c) => {
								const cpx = (x(c) ?? 0) + x.bandwidth() / 2;
								return cpx >= x0 && cpx <= x1;
							});
							if (newXDom.length < 1) newXDom = undefined;
						} else if (x.invert) {
							const raw: [any, any] = [x.invert(x0), x.invert(x1)];
							newXDom = baseXDom
								? clampContinuousDom(raw, baseXDom as [any, any], xType as 'time' | 'number')
								: raw;
						}

						const yMin = Math.min(y0, y1);
						const yMax = Math.max(y0, y1);
						let newYDom: [number, number] = [y.invert(yMax), y.invert(yMin)];
						if (baseYDom)
							newYDom = clampContinuousDom(newYDom, baseYDom, 'number') as [number, number];

						gBrush.call(br.move as any, null);
						suppressNextClick = true;
						draw(newXDom, newYDom);
					});
				gBrush.call(br as any);

				// Double-click: reset to original full domains
				root.on('dblclick', () => {
					suppressNextClick = true;
					draw(resetXDom, resetYDom);
				});

				// Single click: zoom in (kept, but clamped to base domains)
				root.on('click', (ev: MouseEvent) => {
					if (suppressNextClick) {
						suppressNextClick = false;
						return;
					}
					if (brushing) return;
					if (ev.detail !== 1) return;

					const [px, py] = pointer(ev as any, root.node() as any);
					let newXDom: any[] | undefined;
					let newYDom: [number, number] | undefined;

					const factor = 2; // zoom-in by 2x
					if (!hasBand(x) && x.invert) {
						const cx = x.invert(px);
						const xd = x.domain();
						const spanX: any = (+xd[1] as any) - (+xd[0] as any);
						const half = spanX / (2 * factor);
						let rawX: [any, any] = [new Date(+cx - +half), new Date(+cx + +half)] as any;
						if (xType === 'number') rawX = [(+cx - +half) as any, (+cx + +half) as any];
						newXDom = baseXDom
							? clampContinuousDom(rawX, baseXDom as [any, any], xType as 'time' | 'number')
							: rawX;
					}
					{
						const cy = y.invert(py);
						const yd = y.domain();
						const spanY = yd[1] - yd[0];
						const halfY = spanY / (2 * factor);
						let rawY: [number, number] = [cy - halfY, cy + halfY];
						newYDom = baseYDom
							? (clampContinuousDom(rawY, baseYDom, 'number') as [number, number])
							: rawY;
					}
					draw(newXDom, newYDom);
				});
			}
		}
		draw(); // initial render
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
</style>
