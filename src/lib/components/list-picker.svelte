<script lang="ts">
	import { Search, X } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import ListIcon from '$lib/components/list-icon.svelte';
	import * as m from '$lib/paraglide/messages';
	import { untrack } from 'svelte';

	type ListSummary = {
		id: string;
		slug: string | null;
		name: string;
		icon: string | null;
		_count: { items: number };
	};

	let {
		value = $bindable(''),
		initial = null,
		onchange
	}: {
		value: string;
		initial?: ListSummary | null;
		onchange?: () => void;
	} = $props();

	let selected = $state<ListSummary | null>(untrack(() => initial));
	let query = $state('');
	let results = $state<ListSummary[]>([]);
	let searching = $state(false);
	let searchTimeout: ReturnType<typeof setTimeout>;

	function onQueryInput() {
		clearTimeout(searchTimeout);
		if (!query.trim()) {
			results = [];
			return;
		}
		searchTimeout = setTimeout(async () => {
			searching = true;
			try {
				const res = await fetch(`/dashboard/frontpage/search-lists?q=${encodeURIComponent(query)}`);
				const data = await res.json();
				results = data.results ?? [];
			} finally {
				searching = false;
			}
		}, 300);
	}

	function pick(list: ListSummary) {
		selected = list;
		value = list.slug || list.id;
		query = '';
		results = [];
		onchange?.();
	}

	function clear() {
		selected = null;
		value = '';
		onchange?.();
	}
</script>

{#if selected}
	<div class="flex items-center gap-2 rounded-md border border-input px-2.5 py-1.5 text-sm">
		<ListIcon icon={selected.icon} name={selected.name} size="size-5" />
		<span class="flex-1 truncate">{selected.name} ({selected._count.items})</span>
		<button type="button" onclick={clear} class="text-muted-foreground hover:text-destructive">
			<X class="size-3.5" />
		</button>
	</div>
{:else}
	<div class="relative">
		<Search
			class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
		/>
		<Input
			bind:value={query}
			oninput={onQueryInput}
			placeholder={m.frontpage_choose_list()}
			class="h-8 pl-7 text-sm"
		/>
	</div>
	{#if searching}
		<p class="mt-1 text-xs text-muted-foreground">{m.search_placeholder()}</p>
	{:else if query.trim() && results.length === 0}
		<p class="mt-1 text-xs text-muted-foreground">{m.frontpage_no_results()}</p>
	{:else if results.length > 0}
		<ul class="mt-1 max-h-40 overflow-y-auto rounded-md border border-border">
			{#each results as list (list.id)}
				<li>
					<button
						type="button"
						class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
						onclick={() => pick(list)}
					>
						<ListIcon icon={list.icon} name={list.name} size="size-5" />
						<span class="min-w-0 flex-1 truncate">{list.name}</span>
						<span class="shrink-0 text-xs text-muted-foreground">{list._count.items}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
