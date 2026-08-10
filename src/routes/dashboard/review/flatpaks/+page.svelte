<script lang="ts">
	import { enhance } from '$app/forms';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Check, RotateCw, AlertTriangle } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import SearchInput from '$lib/components/search-input.svelte';
	import Pagination from '$lib/components/pagination.svelte';
	import PullConfirmDialog from '$lib/components/pull-confirm-dialog.svelte';
	import FlatpakReviewWizard from '$lib/components/flatpak-review-wizard.svelte';
	import FlatpakBuildHistory from '$lib/components/flatpak-build-history.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	type Section = 'reviews' | 'processing' | 'reviewed' | 'failed';
	const sections: Section[] = ['reviews', 'processing', 'reviewed', 'failed'];
	let section = $state<Section>(
		sections.find((s) => s === page.url.searchParams.get('section')) ?? 'reviews'
	);

	function setSection(next: Section) {
		section = next;
		const url = new URL(page.url);
		if (next === 'reviews') url.searchParams.delete('section');
		else url.searchParams.set('section', next);
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		replaceState(url, {});
	}

	let flatpakSearch = $state('');
	const flatpakQuery = $derived(flatpakSearch.trim().toLowerCase());

	let processingSearch = $state('');
	const processingQuery = $derived(processingSearch.trim().toLowerCase());

	let reviewedSearch = $state('');
	const reviewedQuery = $derived(reviewedSearch.trim().toLowerCase());

	let failedSearch = $state('');
	const failedQuery = $derived(failedSearch.trim().toLowerCase());

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

	const filteredPendingFlatpaks = $derived(
		data.pendingFlatpaks.filter((app) => matchesApp(app, flatpakQuery))
	);
	const filteredProcessingFlatpaks = $derived(
		data.processingFlatpaks.filter((app) => matchesApp(app, processingQuery))
	);
	const filteredRecentFlatpaks = $derived(
		data.recentFlatpaks.filter((app) => matchesApp(app, reviewedQuery))
	);
	const filteredFailedFlatpaks = $derived(
		data.failedFlatpaks.filter((app) => matchesApp(app, failedQuery))
	);

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
	<title>Review Flatpaks - Arc Forge</title>
</svelte:head>

<div class="space-y-4">
	<div>
		<h2 class="text-lg font-semibold">{m.review_flatpaks_heading()}</h2>
		<p class="text-sm text-muted-foreground">{m.review_flatpaks_hint()}</p>
	</div>

	<div class="flex gap-1 border-b border-border">
		<button
			type="button"
			onclick={() => setSection('reviews')}
			class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors {section ===
			'reviews'
				? 'border-primary font-medium text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			{m.review_flatpaks_tab_reviews()}
		</button>
		<button
			type="button"
			onclick={() => setSection('processing')}
			class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors {section ===
			'processing'
				? 'border-primary font-medium text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			{m.review_flatpaks_tab_processing()}
			{#if data.processingCount > 0}
				<span class="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-600">
					{data.processingCount}
				</span>
			{/if}
		</button>
		<button
			type="button"
			onclick={() => setSection('reviewed')}
			class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors {section ===
			'reviewed'
				? 'border-primary font-medium text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			{m.review_flatpaks_tab_reviewed()}
		</button>
		<button
			type="button"
			onclick={() => setSection('failed')}
			class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors {section ===
			'failed'
				? 'border-primary font-medium text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			{m.review_flatpaks_tab_failed()}
			{#if data.failedCount > 0}
				<span class="rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
					{data.failedCount}
				</span>
			{/if}
		</button>
	</div>

	{#if section === 'reviews'}
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
							<img
								src={app.iconUrl || '/default.svg'}
								alt={app.name}
								class="size-12 shrink-0 rounded"
								onerror={(e) => (e.currentTarget.src = '/default.svg')}
							/>
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
							</div>
						</div>

						<div class="mt-4">
							<FlatpakReviewWizard {app} />
						</div>
					</li>
				{/each}
			</ul>
			<Pagination page={data.page} totalPages={data.totalPages} param="page" />
		{/if}
	{:else if section === 'processing'}
		<SearchInput bind:value={processingSearch} placeholder={m.search_placeholder()} />

		{#if data.processingFlatpaks.length === 0}
			<p class="text-sm text-muted-foreground">{m.review_empty()}</p>
		{:else if filteredProcessingFlatpaks.length === 0}
			<p class="text-sm text-muted-foreground">{m.search_no_results()}</p>
		{:else}
			<ul class="space-y-4">
				{#each filteredProcessingFlatpaks as app (app.id)}
					{@const badge = flatpakBadge(app.status)}
					<li class="rounded-lg border border-border p-4">
						<div class="flex items-start gap-3">
							<img
								src={app.iconUrl || '/default.svg'}
								alt={app.name}
								class="size-12 shrink-0 rounded"
								onerror={(e) => (e.currentTarget.src = '/default.svg')}
							/>
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
							</div>
						</div>
						<div class="mt-4">
							<FlatpakBuildHistory flatpakAppId={app.id} />
						</div>
					</li>
				{/each}
			</ul>
			<Pagination
				page={data.processingPage}
				totalPages={data.processingTotalPages}
				param="processingPage"
			/>
		{/if}
	{:else if section === 'reviewed'}
		<SearchInput bind:value={reviewedSearch} placeholder={m.search_placeholder()} />

		{#if data.recentFlatpaks.length === 0}
			<p class="text-sm text-muted-foreground">{m.review_empty()}</p>
		{:else if filteredRecentFlatpaks.length === 0}
			<p class="text-sm text-muted-foreground">{m.search_no_results()}</p>
		{:else}
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
								<form method="POST" action="?/retryFlatpak" use:enhance>
									<input type="hidden" name="id" value={app.id} />
									<Button type="submit" variant="ghost" size="sm">
										<RotateCw class="size-4" />
										{m.review_rebuild()}
									</Button>
								</form>
								<PullConfirmDialog
									id={app.id}
									appName={app.name}
									appid={app.appid}
									action="?/pullFlatpak"
								/>
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
			<Pagination
				page={data.reviewedPage}
				totalPages={data.reviewedTotalPages}
				param="reviewedPage"
			/>
		{/if}
	{:else}
		<SearchInput bind:value={failedSearch} placeholder={m.search_placeholder()} />

		{#if data.failedFlatpaks.length === 0}
			<p class="text-sm text-muted-foreground">{m.review_empty()}</p>
		{:else if filteredFailedFlatpaks.length === 0}
			<p class="text-sm text-muted-foreground">{m.search_no_results()}</p>
		{:else}
			<ul class="space-y-4">
				{#each filteredFailedFlatpaks as app (app.id)}
					{@const badge = flatpakBadge(app.status)}
					<li class="rounded-lg border border-border p-4">
						<div class="flex items-start gap-3">
							<img
								src={app.iconUrl || '/default.svg'}
								alt={app.name}
								class="size-12 shrink-0 rounded"
								onerror={(e) => (e.currentTarget.src = '/default.svg')}
							/>
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
							</div>
						</div>

						<div class="mt-4">
							<FlatpakBuildHistory flatpakAppId={app.id} />
						</div>

						<div class="mt-4">
							<form method="POST" action="?/retryFlatpak" use:enhance>
								<input type="hidden" name="id" value={app.id} />
								<Button type="submit" size="sm" variant="ghost">
									<RotateCw class="size-4" />
									{m.review_retry()}
								</Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
			<Pagination page={data.failedPage} totalPages={data.failedTotalPages} param="failedPage" />
		{/if}
	{/if}
</div>
