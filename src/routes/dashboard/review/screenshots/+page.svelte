<script lang="ts">
	import { enhance } from '$app/forms';
	import { Check, X } from '@lucide/svelte';
	import Pagination from '$lib/components/pagination.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let screenshotNotes: Record<string, string> = $state({});
</script>

<svelte:head>
	<title>Review Screenshots - Arc Forge</title>
</svelte:head>

<div class="space-y-4">
	<div>
		<h2 class="text-lg font-semibold">{m.review_screenshots_heading()}</h2>
		<p class="text-sm text-muted-foreground">{m.review_screenshots_hint()}</p>
	</div>

	{#if data.pendingScreenshots.length === 0}
		<p class="text-sm text-muted-foreground">{m.review_empty()}</p>
	{:else}
		<ul class="space-y-4">
			{#each data.pendingScreenshots as submission (submission.id)}
				<li class="rounded-lg border border-border p-4">
					<div class="flex items-start gap-3">
						<img
							src={submission.url}
							alt={submission.fileName}
							class="h-20 w-32 shrink-0 rounded border border-border object-cover"
						/>
						<div class="min-w-0 flex-1 space-y-1">
							<p class="truncate text-sm font-medium">{submission.fileName}</p>
							<p class="text-xs text-muted-foreground">
								{m.review_submitted_by()}
								{submission.submittedBy?.name ?? m.review_unknown_submitter()}
								{#if submission.submittedBy?.email}
									&lt;{submission.submittedBy.email}&gt;
								{/if}
							</p>
						</div>
					</div>

					<div class="mt-4 flex items-center gap-2">
						<form method="POST" action="?/approveScreenshot" use:enhance>
							<input type="hidden" name="id" value={submission.id} />
							<Button type="submit" size="sm">
								<Check class="size-4" />
								{m.review_approve()}
							</Button>
						</form>
						<input
							type="text"
							placeholder={m.review_note_placeholder()}
							class="h-8 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
							bind:value={screenshotNotes[submission.id]}
						/>
						<form method="POST" action="?/rejectScreenshot" use:enhance>
							<input type="hidden" name="id" value={submission.id} />
							<input type="hidden" name="note" value={screenshotNotes[submission.id] ?? ''} />
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
