<script lang="ts">
	import { enhance } from '$app/forms';
	import { Check, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import Pagination from '$lib/components/pagination.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let notes: Record<string, string> = $state({});

	function reasonLabel(reason: string): string {
		switch (reason) {
			case 'MALWARE_SECURITY':
				return m.report_reason_malware();
			case 'IMPERSONATION':
				return m.report_reason_impersonation();
			case 'INAPPROPRIATE_CONTENT':
				return m.report_reason_inappropriate();
			case 'BROKEN':
				return m.report_reason_broken();
			default:
				return m.report_reason_other();
		}
	}

	function statusBadge(status: string): { label: string; class: string } {
		return status === 'ACTIONED'
			? { label: m.review_reports_status_actioned(), class: 'bg-green-500/10 text-green-600' }
			: { label: m.review_reports_status_dismissed(), class: 'bg-muted text-muted-foreground' };
	}
</script>

<svelte:head>
	<title>{m.review_reports_heading()} - Arc Forge</title>
</svelte:head>

<div class="space-y-8">
	<div>
		<h2 class="text-lg font-semibold">{m.review_reports_heading()}</h2>
		<p class="text-sm text-muted-foreground">{m.review_reports_hint()}</p>
	</div>

	{#if data.pending.length === 0}
		<p class="text-sm text-muted-foreground">{m.review_reports_empty()}</p>
	{:else}
		<ul class="space-y-4">
			{#each data.pending as report (report.id)}
				<li class="rounded-lg border border-border p-4">
					<div class="flex items-start gap-3">
						{#if report.target?.iconUrl}
							<img
								src={report.target.iconUrl}
								alt={report.target.name}
								class="size-12 shrink-0 rounded"
								onerror={(e) => (e.currentTarget.src = '/default.svg')}
							/>
						{/if}
						<div class="min-w-0 flex-1 space-y-1">
							<div class="flex items-baseline gap-2">
								<p class="font-medium">{report.target?.name ?? m.review_reports_target_gone()}</p>
								<span
									class="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600"
								>
									{reasonLabel(report.reason)}
								</span>
							</div>
							{#if report.details}
								<p class="text-sm text-muted-foreground">{report.details}</p>
							{/if}
							{#if report.reporterEmail}
								<p class="text-xs text-muted-foreground">
									{m.review_reports_reporter_email()}: {report.reporterEmail}
								</p>
							{/if}
							{#if report.target}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={report.target.href} class="text-xs underline"
									>{m.review_reports_view_target()}</a
								>
							{/if}
						</div>
					</div>

					<div class="mt-4 flex items-center gap-2">
						{#if report.target && report.targetType !== 'LIST'}
							<form method="POST" action="?/takeAction" use:enhance>
								<input type="hidden" name="id" value={report.id} />
								<input type="hidden" name="note" value={notes[report.id] ?? ''} />
								<Button type="submit" variant="destructive" size="sm">
									<Check class="size-4" />
									{report.targetType === 'DEVELOPER_PROFILE'
										? m.review_reports_suspend()
										: m.review_reports_take_action()}
								</Button>
							</form>
						{:else if report.target}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={report.target.href} class={buttonVariants({ variant: 'ghost', size: 'sm' })}>
								{m.review_reports_go_to_list()}
							</a>
						{/if}
						<input
							type="text"
							placeholder={m.review_note_placeholder()}
							class="h-8 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
							bind:value={notes[report.id]}
						/>
						<form method="POST" action="?/dismiss" use:enhance>
							<input type="hidden" name="id" value={report.id} />
							<input type="hidden" name="note" value={notes[report.id] ?? ''} />
							<Button type="submit" variant="ghost" size="sm">
								<X class="size-4" />
								{m.review_reports_dismiss()}
							</Button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
		<Pagination page={data.page} totalPages={data.totalPages} param="page" />
	{/if}

	{#if data.recentlyReviewed.length > 0}
		<div class="space-y-3">
			<h3 class="text-sm font-semibold text-muted-foreground">{m.review_recent_heading()}</h3>
			<ul class="divide-y divide-border rounded-lg border border-border">
				{#each data.recentlyReviewed as report (report.id)}
					{@const badge = statusBadge(report.status)}
					<li class="flex items-center justify-between px-4 py-2.5 text-sm">
						<div>
							<span class="font-medium"
								>{report.target?.name ?? m.review_reports_target_gone()}</span
							>
							<span class="ml-2 text-xs text-muted-foreground">{reasonLabel(report.reason)}</span>
							{#if report.reviewNote}
								<p class="text-xs text-muted-foreground italic">"{report.reviewNote}"</p>
							{/if}
						</div>
						<div class="flex items-center gap-3">
							<span class="text-xs text-muted-foreground">
								{report.reviewedBy?.name ?? m.review_unknown_submitter()}
							</span>
							<span class="rounded-full px-2 py-0.5 text-xs font-medium {badge.class}">
								{badge.label}
							</span>
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
