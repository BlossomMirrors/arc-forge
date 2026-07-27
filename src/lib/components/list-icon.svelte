<script lang="ts">
	import { ListMusic } from '@lucide/svelte';
	import { parseIconValue, avatarColors } from '$lib/icon-value';
	import { getCuratedIcon } from '$lib/curated-icons';

	let {
		icon,
		name = '',
		size = 'size-10'
	}: {
		icon?: string | null;
		name?: string;
		size?: string;
	} = $props();

	const parsed = $derived(parseIconValue(icon));
	const lucideIcon = $derived(parsed?.type === 'lucide' ? getCuratedIcon(parsed.name) : undefined);
	const colors = $derived(avatarColors(name));
	const letter = $derived(name.trim().charAt(0).toUpperCase());
</script>

{#if parsed?.type === 'image'}
	<img src={parsed.url} alt="" class="{size} shrink-0 rounded object-cover" />
{:else if parsed?.type === 'emoji'}
	<div
		class="flex {size} shrink-0 items-center justify-center rounded bg-muted text-xl leading-none"
	>
		{parsed.emoji}
	</div>
{:else if parsed?.type === 'lucide' && lucideIcon}
	{@const Icon = lucideIcon}
	<div
		class="flex {size} shrink-0 items-center justify-center rounded"
		style="background-color: color-mix(in srgb, {parsed.color} 20%, white)"
	>
		<Icon class="size-1/2" style="color: {parsed.color}" />
	</div>
{:else if letter}
	<div
		class="flex {size} shrink-0 items-center justify-center rounded {colors.bg} {colors.fg} text-sm font-semibold"
	>
		{letter}
	</div>
{:else}
	<div class="flex {size} shrink-0 items-center justify-center rounded bg-muted">
		<ListMusic class="size-4 text-muted-foreground" />
	</div>
{/if}
