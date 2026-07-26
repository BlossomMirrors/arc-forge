<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import type { Component } from 'svelte';

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

{#snippet content()}
	<div class="flex items-center gap-3">
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
	</div>
{/snippet}

{#if href}
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		{href}
		class="block rounded-lg border border-border bg-background p-4 transition-colors hover:bg-muted/50"
	>
		{@render content()}
	</a>
{:else}
	<div class="rounded-lg border border-border bg-background p-4">
		{@render content()}
	</div>
{/if}
