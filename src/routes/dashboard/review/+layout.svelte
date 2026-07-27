<script lang="ts">
	import { AppWindow, Package, BadgeCheck, Image } from '@lucide/svelte';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';

	let { children } = $props();

	const tabs = [
		{ href: '/dashboard/review/pwas', label: m.review_heading(), icon: AppWindow },
		{ href: '/dashboard/review/flatpaks', label: m.review_flatpaks_heading(), icon: Package },
		{
			href: '/dashboard/review/verifications',
			label: m.review_verifications_heading(),
			icon: BadgeCheck
		},
		{ href: '/dashboard/review/screenshots', label: m.review_screenshots_heading(), icon: Image }
	];
</script>

<div class="space-y-8">
	<nav class="flex gap-1 border-b border-border">
		{#each tabs as tab (tab.href)}
			{@const active = page.url.pathname.startsWith(tab.href)}
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={tab.href}
				class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors {active
					? 'border-primary font-medium text-primary'
					: 'border-transparent text-muted-foreground hover:text-foreground'}"
			>
				<tab.icon class="size-4" />
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
</div>
