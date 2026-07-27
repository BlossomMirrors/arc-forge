<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Trash2, Copy, Check } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import ListIcon from '$lib/components/list-icon.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();

	let copiedId = $state('');

	function apiUrl(ref: string): string {
		return `${page.url.origin}/api/lists/${ref}`;
	}

	async function copyUrl(id: string, ref: string) {
		await navigator.clipboard.writeText(apiUrl(ref));
		copiedId = id;
		setTimeout(() => {
			if (copiedId === id) copiedId = '';
		}, 1500);
	}
</script>

<svelte:head>
	<title>{m.lists_heading()} - Arc Forge</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h2 class="text-lg font-semibold">{m.lists_heading()}</h2>
		<p class="text-sm text-muted-foreground">{m.lists_hint()}</p>
	</div>

	{#if form?.error}
		<p class="text-sm text-destructive">{form.error}</p>
	{/if}

	<form method="POST" action="?/create" use:enhance class="flex gap-2">
		<Input name="name" placeholder={m.lists_name_placeholder()} class="flex-1" required />
		<Button type="submit">{m.lists_create()}</Button>
	</form>

	{#if data.lists.length === 0}
		<p class="text-sm text-muted-foreground">{m.lists_empty()}</p>
	{:else}
		<ul class="divide-y divide-border rounded-lg border border-border">
			{#each data.lists as list (list.id)}
				<li class="flex items-center gap-3 px-4 py-3">
					<ListIcon icon={list.icon} name={list.name} />
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">{list.name}</p>
						<p class="text-xs text-muted-foreground">
							{m.lists_item_count({ n: list._count.items })}
							{#if list.slug}
								<code class="ml-1 text-muted-foreground">/{list.slug}</code>
							{/if}
						</p>
					</div>
					<button
						type="button"
						class="shrink-0 text-muted-foreground hover:text-foreground"
						title={m.lists_copy_url()}
						onclick={() => copyUrl(list.id, list.slug || list.id)}
					>
						{#if copiedId === list.id}
							<Check class="size-4 text-green-600" />
						{:else}
							<Copy class="size-4" />
						{/if}
					</button>
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href="/dashboard/lists/{list.id}"
						class={buttonVariants({ variant: 'ghost', size: 'sm' })}
					>
						{m.lists_edit()}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="id" value={list.id} />
						<Button
							type="submit"
							variant="ghost"
							size="icon"
							class="text-muted-foreground hover:text-destructive"
							title={m.lists_delete()}
						>
							<Trash2 class="size-4" />
						</Button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</div>
