<script lang="ts">
	import { enhance } from '$app/forms';
	import { Check, X, FileText, ExternalLink } from '@lucide/svelte';
	import SearchInput from '$lib/components/search-input.svelte';
	import Pagination from '$lib/components/pagination.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let verificationNotes: Record<string, string> = $state({});

	let search = $state('');
	const query = $derived(search.trim().toLowerCase());

	const filteredPendingVerifications = $derived(
		data.pendingVerifications.filter((req) => {
			if (!query) return true;
			return (
				req.developerProfile.name.toLowerCase().includes(query) ||
				req.dunsNumber.toLowerCase().includes(query)
			);
		})
	);
</script>

<svelte:head>
	<title>Review Developer Verifications - Arc Forge</title>
</svelte:head>

<div class="space-y-4">
	<div>
		<h2 class="text-lg font-semibold">{m.review_verifications_heading()}</h2>
		<p class="text-sm text-muted-foreground">{m.review_verifications_hint()}</p>
	</div>

	<SearchInput bind:value={search} placeholder={m.search_placeholder()} />

	{#if data.pendingVerifications.length === 0}
		<p class="text-sm text-muted-foreground">{m.review_empty()}</p>
	{:else if filteredPendingVerifications.length === 0}
		<p class="text-sm text-muted-foreground">{m.search_no_results()}</p>
	{:else}
		<ul class="space-y-4">
			{#each filteredPendingVerifications as req (req.id)}
				<li class="rounded-lg border border-border p-4">
					<div class="space-y-1">
						<p class="font-medium">{req.developerProfile.name}</p>
						<p class="text-xs text-muted-foreground">
							{m.review_submitted_by()}
							{req.requestedBy?.name ?? m.review_unknown_submitter()}
							{#if req.requestedBy?.email}
								&lt;{req.requestedBy.email}&gt;
							{/if}
						</p>
						<p class="text-xs text-muted-foreground">
							{m.devprofile_verify_duns()}: {req.dunsNumber}
						</p>
						<div class="flex flex-wrap gap-2">
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href="https://www.dnb.com/de-de/upik-en.html"
								target="_blank"
								rel="noreferrer"
								class="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
							>
								<ExternalLink class="size-3" />
								{m.review_verifications_lookup_duns()}
							</a>
							{#each req.documentUrls as url (url)}
								<a
									href={url}
									target="_blank"
									rel="noreferrer"
									class="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
								>
									<FileText class="size-3" />
									{m.review_verifications_document()}
								</a>
							{/each}
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						</div>
					</div>

					<div class="mt-4 flex items-center gap-2">
						<form method="POST" action="?/approveVerification" use:enhance>
							<input type="hidden" name="id" value={req.id} />
							<Button type="submit" size="sm">
								<Check class="size-4" />
								{m.review_approve()}
							</Button>
						</form>
						<input
							type="text"
							placeholder={m.review_note_placeholder()}
							class="h-8 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
							bind:value={verificationNotes[req.id]}
						/>
						<form method="POST" action="?/rejectVerification" use:enhance>
							<input type="hidden" name="id" value={req.id} />
							<input type="hidden" name="note" value={verificationNotes[req.id] ?? ''} />
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
</div>
