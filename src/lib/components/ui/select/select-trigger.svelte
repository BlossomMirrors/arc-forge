<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import { IconChevronDown } from '@tabler/icons-svelte';
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		size = "default",
		children,
		...restProps
	}: SelectPrimitive.TriggerProps & { size?: "sm" | "default" } = $props();
</script>

<SelectPrimitive.Trigger
	bind:ref
	data-slot="select-trigger"
	data-size={size}
	class={cn(
		"flex w-fit items-center justify-between gap-2 rounded-[var(--radius-button)] border border-input bg-button px-3 text-sm whitespace-nowrap outline-none transition-[background-color,color] duration-150 select-none hover:bg-button-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<IconChevronDown class="size-4 opacity-60" />
</SelectPrimitive.Trigger>
