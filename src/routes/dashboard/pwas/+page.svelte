<script lang="ts">
	import { enhance } from '$app/forms';
	import { Trash2, Pencil, Plus } from '@lucide/svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import SearchInput from '$lib/components/search-input.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let search = $state('');
	const filteredApps = $derived(
		data.apps.filter((app) => {
			const q = search.trim().toLowerCase();
			if (!q) return true;
			return (
				app.name.toLowerCase().includes(q) ||
				app.appid.toLowerCase().includes(q) ||
				app.developerName.toLowerCase().includes(q)
			);
		})
	);

	function statusBadge(status: string): { label: string; class: string } {
		switch (status) {
			case 'APPROVED':
				return { label: m.pwa_status_approved(), class: 'bg-green-500/10 text-green-600' };
			case 'REJECTED':
				return { label: m.pwa_status_rejected(), class: 'bg-destructive/10 text-destructive' };
			case 'PULLED':
				return { label: m.pwa_status_pulled(), class: 'bg-amber-500/10 text-amber-600' };
			default:
				return { label: m.pwa_status_pending(), class: 'bg-amber-500/10 text-amber-600' };
		}
	}
</script>

<svelte:head>
	<title>PWAs - Arc Forge</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">
				{data.isStaff ? m.pwas_heading() : m.pwas_heading_mine()}
			</h2>
			<p class="text-sm text-muted-foreground">
				{m.pwas_served_public()}
				<code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">/api/pwas</code>.
			</p>
		</div>
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a href="/dashboard/pwas/new" class={buttonVariants()}>
			<Plus class="size-4" />
			{m.pwas_new()}
		</a>
	</div>

	<SearchInput bind:value={search} placeholder={m.search_placeholder()} />

	{#if data.apps.length === 0}
		<p class="text-sm text-muted-foreground">{m.pwas_empty()}</p>
	{:else if filteredApps.length === 0}
		<p class="text-sm text-muted-foreground">{m.search_no_results()}</p>
	{:else}
		<ul class="divide-y divide-border rounded-lg border border-border">
			{#each filteredApps as app (app.id)}
				{@const badge = statusBadge(app.status)}
				<li class="flex items-center justify-between px-4 py-3">
					<div class="flex items-center gap-3">
						<img src={app.iconUrl} alt={app.name} class="size-8 rounded" />
						<div>
							<p class="text-sm font-medium">{app.name}</p>
							<p class="text-xs text-muted-foreground">{app.appid}</p>
						</div>
						<span class="rounded-full px-2 py-0.5 text-xs font-medium {badge.class}">
							{badge.label}
						</span>
					</div>
					<div class="flex items-center gap-1">
						<a
							href="/dashboard/pwas/{app.id}"
							class={buttonVariants({ variant: 'ghost', size: 'icon' })}
						>
							<Pencil class="size-4" />
						</a>
						<form method="POST" action="?/delete" id="delete-form-{app.id}" use:enhance>
							<input type="hidden" name="id" value={app.id} />
							<Button
								type="submit"
								variant="ghost"
								size="icon"
								class="text-muted-foreground hover:text-destructive"
								onclick={(e) => {
									e.preventDefault?.();
									e.stopPropagation?.();
									if (confirm(m.pwas_delete_confirm())) {
										const form = document.getElementById(
											`delete-form-${app.id}`
										) as HTMLFormElement | null;
										form?.submit();
									}
								}}
							>
								<Trash2 class="size-4" />
							</Button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
