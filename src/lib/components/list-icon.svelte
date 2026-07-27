<script lang="ts">
	import { ListMusic } from '@lucide/svelte';
	import { parseIconValue } from '$lib/icon-value';
	import { getCuratedIcon } from '$lib/curated-icons';

	let {
		icon,
		size = 'size-10'
	}: {
		icon?: string | null;
		size?: string;
	} = $props();

	const parsed = $derived(parseIconValue(icon));
	const lucideIcon = $derived(parsed?.type === 'lucide' ? getCuratedIcon(parsed.name) : undefined);
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
	<div class="flex {size} shrink-0 items-center justify-center rounded bg-muted">
		<Icon class="size-1/2" style="color: {parsed.color}" />
	</div>
{:else}
	<div class="flex {size} shrink-0 items-center justify-center rounded bg-muted">
		<ListMusic class="size-4 text-muted-foreground" />
	</div>
{/if}
