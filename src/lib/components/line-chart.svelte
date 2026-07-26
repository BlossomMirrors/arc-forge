<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	type Series = { name: string; color: string; values: number[] };

	let {
		series,
		labels,
		height = 160,
		area = false,
		showLegend = false
	}: {
		series: Series[];
		labels: string[];
		height?: number;
		area?: boolean;
		showLegend?: boolean;
	} = $props();

	const WIDTH = 600;
	const PAD_X = 4;
	const PAD_TOP = 10;
	const PAD_BOTTOM = 20;

	const maxValue = $derived(Math.max(1, ...series.flatMap((s) => s.values)));

	function pointsFor(values: number[]): [number, number][] {
		const n = values.length;
		const plotW = WIDTH - PAD_X * 2;
		const plotH = height - PAD_TOP - PAD_BOTTOM;
		return values.map((v, i) => {
			const x = n > 1 ? PAD_X + (i / (n - 1)) * plotW : PAD_X + plotW / 2;
			const y = PAD_TOP + plotH - (v / maxValue) * plotH;
			return [x, y];
		});
	}

	// Catmull-Rom-ish smoothing: cheap, self-contained, no charting dependency needed
	// for a curve that reads as "designed" rather than a jagged connect-the-dots line.
	function smoothPath(points: [number, number][]): string {
		if (points.length === 0) return '';
		if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
		let d = `M ${points[0][0]} ${points[0][1]}`;
		for (let i = 0; i < points.length - 1; i++) {
			const p0 = points[i === 0 ? i : i - 1];
			const p1 = points[i];
			const p2 = points[i + 1];
			const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
			const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
			const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
			const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
			const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
			d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
		}
		return d;
	}

	function areaPath(points: [number, number][]): string {
		const baseline = height - PAD_BOTTOM;
		const line = smoothPath(points);
		if (points.length === 0) return '';
		const [firstX] = points[0];
		const [lastX] = points[points.length - 1];
		return `${line} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`;
	}

	const paths = $derived(
		series.map((s) => ({
			...s,
			line: smoothPath(pointsFor(s.values)),
			fill: areaPath(pointsFor(s.values))
		}))
	);

	function formatLabel(iso: string): string {
		const d = new Date(`${iso}T00:00:00Z`);
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
	}

	const labelStep = $derived(Math.max(1, Math.ceil(labels.length / 6)));

	let pathEls: SVGPathElement[] = $state([]);
	let lengths: number[] = $state([]);
	let ready = $state(false);

	$effect(() => {
		// Runs after series/paths change (including on mount), measuring each path's
		// real length so the draw-in animation always covers its exact geometry.
		void paths;
		lengths = pathEls.map((el) => el?.getTotalLength() ?? 0);
		ready = false;
		requestAnimationFrame(() => {
			ready = true;
		});
	});

	const progress = Tween.of(() => (ready ? 1 : 0), { duration: 1100, easing: cubicOut });
	const fillOpacity = Tween.of(() => (ready ? 1 : 0), { duration: 900, easing: cubicOut });
</script>

<div class="w-full">
	<svg viewBox="0 0 {WIDTH} {height}" class="w-full overflow-visible" preserveAspectRatio="none">
		<line
			x1={PAD_X}
			y1={height - PAD_BOTTOM}
			x2={WIDTH - PAD_X}
			y2={height - PAD_BOTTOM}
			class="stroke-border"
			stroke-width="1"
		/>

		{#each paths as s, i (s.name)}
			{#if area}
				<path d={s.fill} fill={s.color} opacity={fillOpacity.current * 0.18} />
			{/if}
			<path
				bind:this={pathEls[i]}
				d={s.line}
				fill="none"
				stroke={s.color}
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-dasharray={lengths[i] || 1}
				stroke-dashoffset={(lengths[i] || 1) * (1 - progress.current)}
			/>
		{/each}

		{#each labels as l, i (i)}
			{#if i % labelStep === 0}
				<text
					x={labels.length > 1
						? PAD_X + (i / (labels.length - 1)) * (WIDTH - PAD_X * 2)
						: WIDTH / 2}
					y={height - 4}
					class="fill-muted-foreground"
					font-size="10"
					text-anchor="middle">{formatLabel(l)}</text
				>
			{/if}
		{/each}
	</svg>

	{#if showLegend}
		<div class="mt-2 flex flex-wrap gap-3">
			{#each series as s (s.name)}
				<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<span class="size-2 rounded-full" style="background-color: {s.color}"></span>
					{s.name}
				</span>
			{/each}
		</div>
	{/if}
</div>
