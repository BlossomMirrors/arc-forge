<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		Check,
		X,
		RotateCw,
		ArrowDownCircle,
		Loader2,
		FileText,
		ExternalLink,
		Download,
		AlertTriangle
	} from '@lucide/svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import SearchInput from '$lib/components/search-input.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let notes: Record<string, string> = $state({});
	let flatpakNotes: Record<string, string> = $state({});
	let verificationNotes: Record<string, string> = $state({});
	let screenshotNotes: Record<string, string> = $state({});
	const pullingIds = new SvelteSet<string>();

	let search = $state('');
	let flatpakSearch = $state('');
	const query = $derived(search.trim().toLowerCase());
	const flatpakQuery = $derived(flatpakSearch.trim().toLowerCase());

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
	const filteredPendingFlatpaks = $derived(
		data.pendingFlatpaks.filter((app) => matchesApp(app, flatpakQuery))
	);
	const filteredRecentFlatpaks = $derived(
		data.recentFlatpaks.filter((app) => matchesApp(app, flatpakQuery))
	);
	const filteredPendingVerifications = $derived(
		data.pendingVerifications.filter((req) => {
			if (!query) return true;
			return (
				req.developerProfile.name.toLowerCase().includes(query) ||
				req.dunsNumber.toLowerCase().includes(query)
			);
		})
	);

	function pullEnhance(id: string) {
		pullingIds.add(id);
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			pullingIds.delete(id);
		};
	}

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

	function flatpakBadge(status: string): { label: string; class: string } {
		switch (status) {
			case 'APPROVED':
				return { label: m.flatpak_status_approved(), class: 'bg-green-500/10 text-green-600' };
			case 'REJECTED':
				return { label: m.flatpak_status_rejected(), class: 'bg-destructive/10 text-destructive' };
			case 'FAILED':
				return { label: m.flatpak_status_failed(), class: 'bg-destructive/10 text-destructive' };
			case 'PROCESSING':
				return { label: m.flatpak_status_processing(), class: 'bg-blue-500/10 text-blue-600' };
			case 'PULLED':
				return { label: m.flatpak_status_pulled(), class: 'bg-amber-500/10 text-amber-600' };
			default:
				return { label: m.flatpak_status_pending(), class: 'bg-amber-500/10 text-amber-600' };
		}
	}
</script>

<svelte:head>
	<title>Review - Arc Forge</title>
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
								<input
									type="text"
									placeholder={m.review_note_placeholder()}
									class="h-8 w-40 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
									bind:value={notes[app.id]}
								/>
								<form method="POST" action="?/pullPwa" use:enhance={() => pullEnhance(app.id)}>
									<input type="hidden" name="id" value={app.id} />
									<input type="hidden" name="note" value={notes[app.id] ?? ''} />
									<Button type="submit" variant="ghost" size="sm" disabled={pullingIds.has(app.id)}>
										{#if pullingIds.has(app.id)}
											<Loader2 class="size-4 animate-spin" />
										{:else}
											<ArrowDownCircle class="size-4" />
										{/if}
										{m.review_pull()}
									</Button>
								</form>
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
		</div>
	{/if}

	<div class="space-y-4 border-t border-border pt-8">
		<div>
			<h2 class="text-lg font-semibold">{m.review_flatpaks_heading()}</h2>
			<p class="text-sm text-muted-foreground">{m.review_flatpaks_hint()}</p>
		</div>

		<div
			class="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400"
		>
			<AlertTriangle class="mt-0.5 size-4 shrink-0" />
			<p>{m.review_flatpaks_vm_warning()}</p>
		</div>

		<SearchInput bind:value={flatpakSearch} placeholder={m.search_placeholder()} />

		{#if data.pendingFlatpaks.length === 0}
			<p class="text-sm text-muted-foreground">{m.review_empty()}</p>
		{:else if filteredPendingFlatpaks.length === 0}
			<p class="text-sm text-muted-foreground">{m.search_no_results()}</p>
		{:else}
			<ul class="space-y-4">
				{#each filteredPendingFlatpaks as app (app.id)}
					{@const badge = flatpakBadge(app.status)}
					<li class="rounded-lg border border-border p-4">
						<div class="flex items-start gap-3">
							{#if app.iconUrl}
								<img src={app.iconUrl} alt={app.name} class="size-12 shrink-0 rounded" />
							{:else}
								<div class="size-12 shrink-0 rounded bg-muted"></div>
							{/if}
							<div class="min-w-0 flex-1 space-y-1">
								<div class="flex items-baseline gap-2">
									<p class="font-medium">{app.name}</p>
									<code class="text-xs text-muted-foreground">{app.appid}</code>
									<span class="rounded-full px-2 py-0.5 text-xs font-medium {badge.class}">
										{badge.label}
									</span>
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
									{#if app.sourceType === 'GIT'}
										<span>{m.form_source_git()}: {app.gitUrl} ({app.gitBranch})</span>
									{:else}
										<span>{m.form_bundle()}: {app.bundleFileName}</span>
									{/if}
								</div>
								{#if app.status === 'FAILED' && app.buildLog}
									<pre
										class="mt-2 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">{app.buildLog}</pre>
								{/if}
							</div>
						</div>

						{#if app.status === 'PENDING'}
							<div class="mt-4 flex items-center gap-2">
								{#if app.sourceType === 'BUNDLE' && app.bundleUrl}
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										href={app.bundleUrl}
										download={app.bundleFileName}
										target="_blank"
										rel="noreferrer"
										class={buttonVariants({ variant: 'ghost', size: 'sm' })}
									>
										<Download class="size-4" />
										{m.review_download_bundle()}
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								{/if}
								<form method="POST" action="?/approveFlatpak" use:enhance>
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
									bind:value={flatpakNotes[app.id]}
								/>
								<form method="POST" action="?/rejectFlatpak" use:enhance>
									<input type="hidden" name="id" value={app.id} />
									<input type="hidden" name="note" value={flatpakNotes[app.id] ?? ''} />
									<Button type="submit" variant="destructive" size="sm">
										<X class="size-4" />
										{m.review_reject()}
									</Button>
								</form>
							</div>
						{:else if app.status === 'FAILED'}
							<div class="mt-4">
								<form method="POST" action="?/retryFlatpak" use:enhance>
									<input type="hidden" name="id" value={app.id} />
									<Button type="submit" size="sm" variant="ghost">
										<RotateCw class="size-4" />
										{m.review_retry()}
									</Button>
								</form>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if filteredRecentFlatpaks.length > 0}
			<div class="space-y-3">
				<h3 class="text-sm font-semibold text-muted-foreground">{m.review_recent_heading()}</h3>
				<ul class="divide-y divide-border rounded-lg border border-border">
					{#each filteredRecentFlatpaks as app (app.id)}
						{@const badge = flatpakBadge(app.status)}
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
									<input
										type="text"
										placeholder={m.review_note_placeholder()}
										class="h-8 w-40 rounded-md border border-input bg-background px-2.5 text-xs outline-none focus:ring-2 focus:ring-ring"
										bind:value={flatpakNotes[app.id]}
									/>
									<form
										method="POST"
										action="?/pullFlatpak"
										use:enhance={() => pullEnhance(app.id)}
									>
										<input type="hidden" name="id" value={app.id} />
										<input type="hidden" name="note" value={flatpakNotes[app.id] ?? ''} />
										<Button
											type="submit"
											variant="ghost"
											size="sm"
											disabled={pullingIds.has(app.id)}
										>
											{#if pullingIds.has(app.id)}
												<Loader2 class="size-4 animate-spin" />
											{:else}
												<ArrowDownCircle class="size-4" />
											{/if}
											{m.review_pull()}
										</Button>
									</form>
								{:else if app.status === 'PULLED'}
									<form method="POST" action="?/approveFlatpak" use:enhance>
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
			</div>
		{/if}
	</div>

	<div class="space-y-4 border-t border-border pt-8">
		<div>
			<h2 class="text-lg font-semibold">{m.review_verifications_heading()}</h2>
			<p class="text-sm text-muted-foreground">{m.review_verifications_hint()}</p>
		</div>

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
		{/if}
	</div>

	<div class="space-y-4 border-t border-border pt-8">
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
		{/if}
	</div>
</div>
