<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { Check, X } from '@lucide/svelte';
	import { Spring } from 'svelte/motion';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	const TRACK_WIDTH = 40;
	const TRACK_PAD = 4;
	const THUMB_SIZE = 16;
	const THUMB_BOTTOM_MARGIN = 2;
	const THUMB_RIGHT_MARGIN = 1;
	const TRACK_HEIGHT = THUMB_SIZE + TRACK_PAD * 2 + THUMB_BOTTOM_MARGIN;
	const TRACK_TOTAL_WIDTH = TRACK_WIDTH + THUMB_RIGHT_MARGIN;
	const TRAVEL = TRACK_WIDTH - THUMB_SIZE - TRACK_PAD * 2;

	let {
		checked = $bindable(false),
		onCheckedChange,
		disabled,
		class: className,
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> = $props();

	// A physical spring, not an eased transition, so the thumb genuinely overshoots
	// its resting position by a touch before settling, rather than slowing into
	// place or ringing back and forth. Svelte's spring isn't a normalized
	// damping-ratio model, these particular values were picked by numerically
	// simulating tick_spring's actual integrator, favoring a fast, near-invisible
	// settle-back over a larger peak overshoot, so it reads as one clean snap.
	const x = new Spring(checked ? TRAVEL : 0, { stiffness: 7, damping: 0.4 });
	$effect(() => {
		x.target = checked ? TRAVEL : 0;
	});
</script>

<SwitchPrimitive.Root
	bind:checked
	{onCheckedChange}
	{disabled}
	class={cn(
		'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-300 ease-in-out disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted',
		className
	)}
	style="width:{TRACK_TOTAL_WIDTH}px;height:{TRACK_HEIGHT}px;"
	{...restProps}
>
	<SwitchPrimitive.Thumb
		class="absolute flex items-center justify-center rounded-full bg-white shadow-sm"
		style="width:{THUMB_SIZE}px;height:{THUMB_SIZE}px;left:{TRACK_PAD}px;top:{TRACK_PAD}px;transform:translateX({x.current}px);"
	>
		<Check
			class="absolute size-3 text-primary transition-all duration-200 ease-in-out {checked
				? 'scale-100 opacity-100'
				: 'scale-50 opacity-0'}"
			strokeWidth={3}
		/>
		<X
			class="absolute size-3 text-neutral-500 transition-all duration-200 ease-in-out {checked
				? 'scale-50 opacity-0'
				: 'scale-100 opacity-100'}"
		/>
	</SwitchPrimitive.Thumb>
</SwitchPrimitive.Root>
