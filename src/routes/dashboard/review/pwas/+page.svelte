<script lang="ts">
	import { enhance } from '$app/forms';
	import { Check, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import SearchInput from '$lib/components/search-input.svelte';
	import Pagination from '$lib/components/pagination.svelte';
	import PullConfirmDialog from '$lib/components/pull-confirm-dialog.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let notes: Record<string, string> = $state({});

	let search = $state('');
	const query = $derived(search.trim().toLowerCase());

	function matchesApp(
		app: { name: string; appid: string; developerName: string },
		q: string
	): boolean {
		if (!q) return true;
		return (
			app.name.toLowerCase().includes(q) ||
			app.appid.toLowerCase().includes(q) ||
			app.developerName.toLowerCase().includes(q)
		);
	}

	const filteredPending = $derived(data.pending.filter((app) => matchesApp(app, query)));
	const filteredRecentlyReviewed = $derived(
		data.recentlyReviewed.filter((app) => matchesApp(app, query))
	);

	function pwaBadge(status: string): { label: string; class: string } {
		switch (status) {
			case 'APPROVED':
				return { label: m.pwa_status_approved(), class: 'bg-green-500/10 text-green-600' };
			case 'PULLED':
				return { label: m.pwa_status_pulled(), class: 'bg-amber-500/10 text-amber-600' };
			default:
				return { label: m.pwa_status_rejected(), class: 'bg-destructive/10 text-destructive' };
		}
	}
</script>

<svelte:head>
	<title>Review PWAs - Arc Forge</title>
</svelte:head>

<div class="space-y-8">
	<div>
		<h2 class="text-lg font-semibold">{m.review_heading()}</h2>
		<p class="text-sm text-muted-foreground">{m.review_hint()}</p>
	</div>

	<SearchInput bind:value={search} placeholder={m.search_placeholder()} />

	{#if data.pending.length === 0}
		<p class="text-sm text-muted-foreground">{m.review_empty()}</p>
	{:else if filteredPending.length === 0}
		<p class="text-sm text-muted-foreground">{m.search_no_results()}</p>
	{:else}
		<ul class="space-y-4">
			{#each filteredPending as app (app.id)}
				<li class="rounded-lg border border-border p-4">
					<div class="flex items-start gap-3">
						<img src={app.iconUrl} alt={app.name} class="size-12 shrink-0 rounded" />
						<div class="min-w-0 flex-1 space-y-1">
							<div class="flex items-baseline gap-2">
								<p class="font-medium">{app.name}</p>
								<code class="text-xs text-muted-foreground">{app.appid}</code>
							</div>
							<p class="text-sm text-muted-foreground">{app.summary}</p>
							<p class="text-xs text-muted-foreground">
								{m.review_submitted_by()}
								{app.submittedBy?.name ?? m.review_unknown_submitter()}
								{#if app.submittedBy?.email}
									&lt;{app.submittedBy.email}&gt;
								{/if}
							</p>
							<div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
								<span>{m.form_developer_name()}: {app.developerName}</span>
								<span>{m.form_content_rating()}: {app.contentRating}</span>
								<a href={app.url} target="_blank" rel="noreferrer" class="underline">{app.url}</a>
							</div>
						</div>
					</div>

					<div class="mt-4 flex items-center gap-2">
						<form method="POST" action="?/approve" use:enhance>
							<input type="hidden" name="id" value={app.id} />
							<Button type="submit" size="sm">
								<Check class="size-4" />
								{m.review_approve()}
							</Button>
						</form>
						<input
							type="text"
							placeholder={m.review_note_placeholder()}
							class="h-8 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
							bind:value={notes[app.id]}
						/>
						<form method="POST" action="?/reject" use:enhance>
							<input type="hidden" name="id" value={app.id} />
							<input type="hidden" name="note" value={notes[app.id] ?? ''} />
							<Button type="submit" variant="destructive" size="sm">
								<X class="size-4" />
								{m.review_reject()}
							</Button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
		<Pagination page={data.page} totalPages={data.totalPages} param="page" />
	{/if}

	{#if filteredRecentlyReviewed.length > 0}
		<div class="space-y-3">
			<h3 class="text-sm font-semibold text-muted-foreground">{m.review_recent_heading()}</h3>
			<ul class="divide-y divide-border rounded-lg border border-border">
				{#each filteredRecentlyReviewed as app (app.id)}
					{@const badge = pwaBadge(app.status)}
					<li class="flex items-center justify-between px-4 py-2.5 text-sm">
						<div>
							<span class="font-medium">{app.name}</span>
							<span class="ml-2 text-xs text-muted-foreground">{app.appid}</span>
							{#if app.reviewNote}
								<p class="text-xs text-muted-foreground italic">"{app.reviewNote}"</p>
							{/if}
						</div>
						<div class="flex items-center gap-3">
							<span class="text-xs text-muted-foreground">
								{app.reviewedBy?.name ?? m.review_unknown_submitter()}
							</span>
							<span class="rounded-full px-2 py-0.5 text-xs font-medium {badge.class}">
								{badge.label}
							</span>
							{#if app.status === 'APPROVED'}
								<PullConfirmDialog
									id={app.id}
									appName={app.name}
									appid={app.appid}
									action="?/pullPwa"
								/>
							{:else if app.status === 'PULLED'}
								<form method="POST" action="?/approve" use:enhance>
									<input type="hidden" name="id" value={app.id} />
									<Button type="submit" variant="ghost" size="sm">
										<Check class="size-4" />
										{m.review_republish()}
									</Button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
			<Pagination
				page={data.reviewedPage}
				totalPages={data.reviewedTotalPages}
				param="reviewedPage"
			/>
		</div>
	{/if}
</div>
