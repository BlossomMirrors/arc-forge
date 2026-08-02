<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import type { Component } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils.js';

	let {
		label,
		value,
		icon,
		href,
		accent = 'text-primary'
	}: {
		label: string;
		value: number;
		icon?: Component<{ class?: string }>;
		href?: string;
		accent?: string;
	} = $props();

	const tween = Tween.of(() => value, { duration: 800, easing: cubicOut });
</script>

<Card.Root size="sm" class={cn('relative', href && 'transition-colors hover:bg-muted/50')}>
	<Card.Content class="flex items-center gap-3">
		{#if icon}
			{@const Icon = icon}
			<span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted {accent}">
				<Icon class="size-4" />
			</span>
		{/if}
		<div class="min-w-0">
			<p class="text-2xl font-semibold tabular-nums">{Math.round(tween.current)}</p>
			<p class="truncate text-xs text-muted-foreground">{label}</p>
		</div>
	</Card.Content>

	{#if href}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a {href} class="absolute inset-0" aria-label={label}></a>
	{/if}
</Card.Root>
