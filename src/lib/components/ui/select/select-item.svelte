<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import { IconCheck } from '@tabler/icons-svelte';
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		value,
		label,
		children: childrenProp,
		...restProps
	}: SelectPrimitive.ItemProps = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	{value}
	{label}
	data-slot="select-item"
	class={cn(
		"relative flex w-full cursor-default items-center gap-2 rounded-[var(--radius-menu)] py-1.5 pr-8 pl-2.5 text-sm outline-none select-none transition-colors duration-100 data-highlighted:bg-primary data-highlighted:text-primary-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
		className
	)}
	{...restProps}
>
	{#snippet children({ selected, highlighted })}
		<span class="absolute right-2.5 flex size-3.5 items-center justify-center">
			{#if selected}
				<IconCheck class="size-4" />
			{/if}
		</span>
		{#if childrenProp}
			{@render childrenProp({ selected, highlighted })}
		{:else}
			{label}
		{/if}
	{/snippet}
</SelectPrimitive.Item>
