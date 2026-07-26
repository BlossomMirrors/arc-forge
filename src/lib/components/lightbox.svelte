<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { SvelteMap } from 'svelte/reactivity';
	import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	const MIN_ZOOM = 1;
	const MAX_ZOOM = 4;
	const ZOOM_STEP = 0.5;

	let {
		images,
		open = $bindable(false),
		index = $bindable(0)
	}: { images: string[]; open?: boolean; index?: number } = $props();

	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let gesturing = $state(false);
	let stageEl = $state<HTMLDivElement | null>(null);
	let naturalW = $state(1);
	let naturalH = $state(1);
	const hasMultiple = $derived(images.length > 1);

	const pointers = new SvelteMap<number, { x: number; y: number }>();
	let gestureStartZoom = 1;
	let gestureStartPan = { x: 0, y: 0 };
	let gestureStartDist = 0;
	let gestureStartMid = { x: 0, y: 0 };
	let wheelTimeout: ReturnType<typeof setTimeout> | undefined;

	function resetZoom() {
		zoom = 1;
		panX = 0;
		panY = 0;
		pointers.clear();
		gesturing = false;
		clearTimeout(wheelTimeout);
	}

	function onImageLoad(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		naturalW = img.naturalWidth || 1;
		naturalH = img.naturalHeight || 1;
	}

	function prev() {
		index = (index - 1 + images.length) % images.length;
		resetZoom();
	}

	function next() {
		index = (index + 1) % images.length;
		resetZoom();
	}

	// Clamps panning so the (possibly letterboxed) image can't be dragged past its own edges
	function clampPan(x: number, y: number, atZoom: number) {
		if (!stageEl) return { x: 0, y: 0 };
		const stageW = stageEl.clientWidth;
		const stageH = stageEl.clientHeight;
		const widthConstrained = naturalW / naturalH > stageW / stageH;
		const contentW = widthConstrained ? stageW : (stageH * naturalW) / naturalH;
		const contentH = widthConstrained ? (stageW * naturalH) / naturalW : stageH;
		const maxX = Math.max(0, (contentW * atZoom - stageW) / 2);
		const maxY = Math.max(0, (contentH * atZoom - stageH) / 2);
		return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
	}

	function zoomTo(next: number) {
		zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
		({ x: panX, y: panY } = clampPan(panX, panY, zoom));
	}

	function zoomIn() {
		zoomTo(zoom + ZOOM_STEP);
	}

	function zoomOut() {
		zoomTo(zoom - ZOOM_STEP);
	}

	function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
		return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
	}

	function pointerDist(a: { x: number; y: number }, b: { x: number; y: number }) {
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	// Zooms around the cursor position so the point under it stays put, like Discord's lightbox
	function onWheel(e: WheelEvent) {
		if (!stageEl) return;
		e.preventDefault();

		gesturing = true;
		clearTimeout(wheelTimeout);
		wheelTimeout = setTimeout(() => (gesturing = false), 150);

		const rect = stageEl.getBoundingClientRect();
		const cx = e.clientX - rect.left - rect.width / 2;
		const cy = e.clientY - rect.top - rect.height / 2;
		const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-e.deltaY * 0.001)));
		const pointX = (cx - panX) / zoom;
		const pointY = (cy - panY) / zoom;

		zoom = newZoom;
		({ x: panX, y: panY } = clampPan(cx - pointX * newZoom, cy - pointY * newZoom, zoom));
	}

	// Re-baselines the active gesture so switching between one and two fingers doesn't jump
	function beginGesture() {
		gestureStartZoom = zoom;
		gestureStartPan = { x: panX, y: panY };
		const pts = [...pointers.values()];
		if (pts.length === 2) {
			gestureStartDist = pointerDist(pts[0], pts[1]);
			gestureStartMid = midpoint(pts[0], pts[1]);
		} else if (pts.length === 1) {
			gestureStartMid = pts[0];
		}
	}

	function onStagePointerDown(e: PointerEvent) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		gesturing = true;
		beginGesture();
	}

	function onStagePointerMove(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		const pts = [...pointers.values()];

		if (pts.length === 2) {
			const scale = pointerDist(pts[0], pts[1]) / gestureStartDist;
			const mid = midpoint(pts[0], pts[1]);
			zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, gestureStartZoom * scale));
			({ x: panX, y: panY } = clampPan(
				gestureStartPan.x + (mid.x - gestureStartMid.x),
				gestureStartPan.y + (mid.y - gestureStartMid.y),
				zoom
			));
		} else if (pts.length === 1 && zoom > MIN_ZOOM) {
			const p = pts[0];
			({ x: panX, y: panY } = clampPan(
				gestureStartPan.x + (p.x - gestureStartMid.x),
				gestureStartPan.y + (p.y - gestureStartMid.y),
				zoom
			));
		}
	}

	function endPointer(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size === 0) {
			gesturing = false;
		} else {
			beginGesture();
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'ArrowLeft') prev();
		else if (e.key === 'ArrowRight') next();
	}
</script>

<svelte:window {onkeydown} />

<Dialog.Root bind:open onOpenChange={(o) => !o && resetZoom()}>
	<Dialog.Content
		class="h-[88vh] w-[95vw] max-w-6xl border-none bg-transparent p-0 shadow-none sm:max-w-6xl"
		hideClose
	>
		{#if images[index]}
			<Dialog.Title class="sr-only"
				>{m.lightbox_title({ n: index + 1, total: images.length })}</Dialog.Title
			>
			<div class="relative h-full w-full">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					bind:this={stageEl}
					class="h-full w-full touch-none overflow-hidden rounded-2xl bg-black/80"
					onpointerdown={onStagePointerDown}
					onpointermove={onStagePointerMove}
					onpointerup={endPointer}
					onpointercancel={endPointer}
					onwheel={onWheel}
				>
					<img
						src={images[index]}
						alt=""
						draggable="false"
						onload={onImageLoad}
						class="h-full w-full touch-none object-contain select-none"
						style="transform: translate({panX}px, {panY}px) scale({zoom}); transition: {gesturing
							? 'none'
							: 'transform 150ms ease-out'}; cursor: {zoom > MIN_ZOOM
							? pointers.size > 0
								? 'grabbing'
								: 'grab'
							: 'default'}"
					/>
				</div>

				<Dialog.Close
					class="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-background text-foreground shadow-lg"
					aria-label={m.lightbox_close()}
				>
					<X class="size-4" />
				</Dialog.Close>

				<div class="absolute top-3 left-3 flex items-center gap-1.5">
					<button
						type="button"
						class="flex h-9 w-9 items-center justify-center rounded-full bg-background text-foreground shadow-lg disabled:opacity-40"
						onclick={zoomOut}
						disabled={zoom <= MIN_ZOOM}
						aria-label={m.lightbox_zoom_out()}
					>
						<ZoomOut class="size-4" />
					</button>
					<button
						type="button"
						class="flex h-9 w-9 items-center justify-center rounded-full bg-background text-foreground shadow-lg disabled:opacity-40"
						onclick={zoomIn}
						disabled={zoom >= MAX_ZOOM}
						aria-label={m.lightbox_zoom_in()}
					>
						<ZoomIn class="size-4" />
					</button>
				</div>

				{#if hasMultiple}
					<button
						type="button"
						class="absolute top-1/2 left-3 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-lg backdrop-blur"
						onclick={prev}
						aria-label={m.lightbox_prev()}
					>
						<ChevronLeft class="size-5" />
					</button>
					<button
						type="button"
						class="absolute top-1/2 right-3 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-lg backdrop-blur"
						onclick={next}
						aria-label={m.lightbox_next()}
					>
						<ChevronRight class="size-5" />
					</button>
				{/if}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
