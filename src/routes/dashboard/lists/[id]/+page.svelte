<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Search, Plus, Trash2, Copy, Check, Wand2 } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import IconPicker from '$lib/components/icon-picker.svelte';
	import * as m from '$lib/paraglide/messages';
	import { slugify } from '$lib/slug';
	import { untrack } from 'svelte';

	let { data, form } = $props();

	let icon = $state(untrack(() => data.list.icon ?? ''));
	let name = $state(untrack(() => data.list.name));
	let slug = $state(untrack(() => data.list.slug ?? ''));
	let copied = $state(false);
	let query = $state('');
	let searching = $state(false);
	let results = $state<{ ref: string; name: string; summary: string; iconUrl: string | null }[]>(
		[]
	);
	let searchTimeout: ReturnType<typeof setTimeout>;

	const existingRefs = $derived(new Set(data.list.items.map((item) => item.appRef)));
	const apiUrl = $derived(`${page.url.origin}/api/lists/${slug || data.list.id}`);

	function generateSlug() {
		slug = slugify(name);
	}

	function onQueryInput() {
		clearTimeout(searchTimeout);
		if (!query.trim()) {
			results = [];
			return;
		}
		searchTimeout = setTimeout(async () => {
			searching = true;
			try {
				const res = await fetch(`/api/search-apps?q=${encodeURIComponent(query)}`);
				const data = await res.json();
				results = data.results ?? [];
			} finally {
				searching = false;
			}
		}, 300);
	}

	async function copyUrl() {
		await navigator.clipboard.writeText(apiUrl);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<svelte:head>
	<title>{data.list.name} - Arc Forge</title>
</svelte:head>

<div class="max-w-2xl space-y-8">
	<div>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/dashboard/lists" class="text-sm text-muted-foreground hover:underline"
			>{m.lists_back()}</a
		>
		<h2 class="mt-1 text-lg font-semibold">{data.list.name}</h2>
	</div>

	<div class="flex items-center gap-2 rounded-lg border border-border p-3">
		<code class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{apiUrl}</code>
		<button
			type="button"
			class="shrink-0 text-muted-foreground hover:text-foreground"
			onclick={copyUrl}
		>
			{#if copied}
				<Check class="size-4 text-green-600" />
			{:else}
				<Copy class="size-4" />
			{/if}
		</button>
	</div>

	{#if form?.error}
		<p class="text-sm text-destructive">{form.error}</p>
	{/if}

	<form
		method="POST"
		action="?/update"
		use:enhance={() => {
			return async ({ update }) => {
				await update({ reset: false });
			};
		}}
		class="space-y-3 rounded-lg border border-border p-4"
	>
		<h3 class="text-sm font-semibold text-muted-foreground">{m.lists_details_heading()}</h3>
		<input type="hidden" name="icon" value={icon} />
		<label class="block space-y-1.5">
			<span class="text-sm font-medium">{m.lists_name_placeholder()}</span>
			<Input name="name" bind:value={name} required />
		</label>
		<label class="block space-y-1.5">
			<span class="text-sm font-medium">{m.lists_slug_label()}</span>
			<div class="flex gap-2">
				<Input
					name="slug"
					bind:value={slug}
					placeholder={m.lists_slug_placeholder()}
					class="flex-1 font-mono"
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onclick={generateSlug}
					title={m.lists_slug_generate()}
				>
					<Wand2 class="size-4" />
				</Button>
			</div>
			<p class="text-xs text-muted-foreground">{m.lists_slug_hint()}</p>
		</label>
		<label class="block space-y-1.5">
			<span class="text-sm font-medium">{m.lists_description()}</span>
			<textarea
				name="description"
				rows="3"
				class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
				>{data.list.description ?? ''}</textarea
			>
		</label>
		<label class="block space-y-1.5">
			<span class="text-sm font-medium">{m.lists_icon_label()}</span>
			<IconPicker bind:value={icon} {name} />
		</label>
		<Button type="submit" size="sm">{m.lists_save()}</Button>
	</form>

	<div class="space-y-3">
		<h3 class="text-sm font-semibold text-muted-foreground">{m.lists_add_apps_heading()}</h3>
		<div class="relative">
			<Search
				class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:value={query}
				oninput={onQueryInput}
				placeholder={m.lists_search_placeholder()}
				class="pl-8"
			/>
		</div>

		{#if searching}
			<p class="text-sm text-muted-foreground">{m.search_placeholder()}</p>
		{:else if results.length > 0}
			<ul class="divide-y divide-border rounded-lg border border-border">
				{#each results as result (result.ref)}
					<li class="flex items-center gap-3 px-4 py-2.5">
						<img
							src={result.iconUrl || '/default.svg'}
							alt=""
							class="size-8 shrink-0 rounded object-cover"
							onerror={(e) => (e.currentTarget.src = '/default.svg')}
						/>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{result.name}</p>
							<p class="truncate text-xs text-muted-foreground">{result.summary}</p>
						</div>
						{#if existingRefs.has(result.ref)}
							<span class="shrink-0 text-xs text-muted-foreground">{m.lists_added()}</span>
						{:else}
							<form method="POST" action="?/addItem" use:enhance>
								<input type="hidden" name="ref" value={result.ref} />
								<input type="hidden" name="name" value={result.name} />
								<input type="hidden" name="iconUrl" value={result.iconUrl ?? ''} />
								<Button type="submit" variant="ghost" size="icon" title={m.lists_add()}>
									<Plus class="size-4" />
								</Button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="space-y-3">
		<h3 class="text-sm font-semibold text-muted-foreground">
			{m.lists_item_count({ n: data.list.items.length })}
		</h3>
		{#if data.list.items.length === 0}
			<p class="text-sm text-muted-foreground">{m.lists_no_items()}</p>
		{:else}
			<ul class="divide-y divide-border rounded-lg border border-border">
				{#each data.list.items as item (item.id)}
					<li class="flex items-center gap-3 px-4 py-2.5">
						<img
							src={item.iconUrl || '/default.svg'}
							alt=""
							class="size-8 shrink-0 rounded object-cover"
							onerror={(e) => (e.currentTarget.src = '/default.svg')}
						/>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{item.name}</p>
							<code class="text-xs text-muted-foreground">{item.appRef}</code>
						</div>
						<form method="POST" action="?/removeItem" use:enhance>
							<input type="hidden" name="itemId" value={item.id} />
							<Button
								type="submit"
								variant="ghost"
								size="icon"
								class="text-muted-foreground hover:text-destructive"
								title={m.lists_remove()}
							>
								<Trash2 class="size-4" />
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
