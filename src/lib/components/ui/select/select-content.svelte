<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 6,
		children,
		...restProps
	}: SelectPrimitive.ContentProps = $props();
</script>

<!--
	Blossom dropdown popup — mirrors the BlossomUI kstyle menu/combobox popup:
	a translucent, blurred backdrop (60% opacity + 12px blur), a hairline frame,
	and inset padding so highlighted items float clear of the popup edges.
-->
<SelectPrimitive.Portal>
	<SelectPrimitive.Content
		bind:ref
		{sideOffset}
		data-slot="select-content"
		class={cn(
			"relative z-50 max-h-[--bits-select-content-available-height] min-w-[--bits-select-anchor-width] origin-[--bits-select-content-transform-origin] overflow-y-auto rounded-[var(--radius-menu)] border border-black/10 bg-popover/60 p-1.5 text-popover-foreground shadow-lg ring-1 ring-black/5 backdrop-blur-md backdrop-saturate-150 dark:border-white/10 dark:ring-white/5 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
			className
		)}
		{...restProps}
	>
		<SelectPrimitive.Viewport class="flex flex-col gap-0.5">
			{@render children?.()}
		</SelectPrimitive.Viewport>
	</SelectPrimitive.Content>
</SelectPrimitive.Portal>
