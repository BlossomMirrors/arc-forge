<script lang="ts">
	import { page as currentPage } from '$app/state';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';

	let {
		page,
		totalPages,
		param = 'page'
	}: { page: number; totalPages: number; param?: string } = $props();

	function hrefFor(target: number): string {
		const url = new URL(currentPage.url);
		if (target <= 1) url.searchParams.delete(param);
		else url.searchParams.set(param, String(target));
		return `${url.pathname}?${url.searchParams.toString()}`;
	}
</script>

{#if totalPages > 1}
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<div class="flex items-center justify-between gap-3">
		<a
			href={hrefFor(page - 1)}
			class="{buttonVariants({ variant: 'ghost', size: 'sm' })} border border-input {page <= 1
				? 'pointer-events-none opacity-50'
				: ''}"
		>
			<ChevronLeft class="size-4" />
			{m.pagination_previous()}
		</a>
		<span class="text-xs text-muted-foreground">
			{m.pagination_page_of({ page, total: totalPages })}
		</span>
		<a
			href={hrefFor(page + 1)}
			class="{buttonVariants({ variant: 'ghost', size: 'sm' })} border border-input {page >=
			totalPages
				? 'pointer-events-none opacity-50'
				: ''}"
		>
			{m.pagination_next()}
			<ChevronRight class="size-4" />
		</a>
	</div>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
