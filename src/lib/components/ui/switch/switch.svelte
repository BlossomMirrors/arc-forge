<script lang="ts">
	import { Switch as SwitchPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		class: className,
		...restProps
	}: SwitchPrimitive.RootProps = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	class={cn(
		"group inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-button shadow-[inset_0_0_0_1px_var(--border)] outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[var(--primary-200)] data-[state=checked]:shadow-[inset_0_0_0_1px_var(--primary-200)]",
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		class="pointer-events-none flex size-[14px] items-center justify-center rounded-full bg-background transition-transform duration-200 ease-[cubic-bezier(0.5,1.45,0.5,1)] data-[state=checked]:translate-x-[14px] dark:bg-foreground"
	>
		<svg
			viewBox="0 0 16 16"
			fill="currentColor"
			class="size-[9px] text-neutral-400 group-data-[state=checked]:hidden"
		>
			<polygon points="1.87,4.13 11.87,14.13 14.13,11.87 4.13,1.87" />
			<polygon points="11.87,1.87 1.87,11.87 4.13,14.13 14.13,4.13" />
		</svg>
		<svg
			viewBox="0 0 16 16"
			fill="currentColor"
			class="hidden size-[9px] text-[var(--primary-200)] group-data-[state=checked]:block"
		>
			<polygon points="1.50,9.68 5.20,13.48 7.20,11.52 3.50,7.72" />
			<polygon points="7.33,13.33 14.63,3.33 12.37,1.67 5.07,11.67" />
			<circle cx="6.2" cy="12.5" r="1.4" />
		</svg>
	</SwitchPrimitive.Thumb>
</SwitchPrimitive.Root>
