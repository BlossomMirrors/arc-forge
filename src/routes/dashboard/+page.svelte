<script lang="ts">
	import {
		AppWindow,
		Package,
		Download,
		AlertTriangle,
		BadgeCheck,
		Building2,
		Plus
	} from '@lucide/svelte';
	import StatCard from '$lib/components/stat-card.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { AreaChart, LineChart } from 'layerchart';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	const hasSubmissions = $derived(
		data.mySubmissions.pwaTotal > 0 || data.mySubmissions.flatpakTotal > 0
	);
	const hasInstalls = $derived(data.myInstalls.some((d) => d.count > 0));

	function formatDay(day: unknown) {
		return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	const myInstallsConfig = {
		count: { label: m.dashboard_installs_heading(), color: 'var(--color-chart-1)' }
	} satisfies Chart.ChartConfig;

	const reviewThroughputConfig = {
		approved: { label: m.review_approve(), color: 'var(--color-chart-1)' },
		rejected: { label: m.review_reject(), color: 'var(--color-destructive)' }
	} satisfies Chart.ChartConfig;

	const siteInstallsConfig = {
		count: { label: m.dashboard_total_installs(), color: 'var(--color-chart-1)' }
	} satisfies Chart.ChartConfig;
</script>

<svelte:head>
	<title>Dashboard - Arc Forge</title>
</svelte:head>

<div class="space-y-10">
	<div>
		<h2 class="-mb-4 text-lg font-semibold">{m.nav_overview()}</h2>
	</div>

	<section class="space-y-4">
		<h3 class="text-sm font-semibold text-muted-foreground">
			{m.dashboard_my_submissions_heading()}
		</h3>

		{#if !hasSubmissions}
			<div class="rounded-lg border border-dashed border-border p-6 text-center">
				<p class="text-sm text-muted-foreground">{m.dashboard_no_submissions()}</p>
				<div class="mt-3 flex justify-center gap-2">
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href="/dashboard/pwas/new"
						class="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
					>
						<Plus class="size-4" />
						{m.pwas_new()}
					</a>
					<a
						href="/dashboard/flatpaks/new"
						class="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
					>
						<Plus class="size-4" />
						{m.flatpaks_new()}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</div>
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatCard
					label={m.dashboard_my_pwas()}
					value={data.mySubmissions.pwaTotal}
					icon={AppWindow}
					href="/dashboard/pwas"
				/>
				<StatCard
					label={m.dashboard_my_flatpaks()}
					value={data.mySubmissions.flatpakTotal}
					icon={Package}
					href="/dashboard/flatpaks"
					accent="text-chart-3"
				/>
			</div>

			{#if hasInstalls}
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.dashboard_installs_heading()}</Card.Title>
					</Card.Header>
					<Card.Content>
						<Chart.Container config={myInstallsConfig} class="aspect-auto h-40 w-full">
							<AreaChart
								data={data.myInstalls}
								x="day"
								series={[
									{
										key: 'count',
										label: myInstallsConfig.count.label,
										color: myInstallsConfig.count.color
									}
								]}
								props={{ xAxis: { format: formatDay, ticks: 5 } }}
							>
								{#snippet tooltip()}
									<Chart.Tooltip labelFormatter={formatDay} />
								{/snippet}
							</AreaChart>
						</Chart.Container>
					</Card.Content>
				</Card.Root>
			{/if}
		{/if}
	</section>

	{#if data.reviewQueue && data.reviewThroughput}
		<section class="space-y-4 border-t border-border pt-8">
			<h3 class="text-sm font-semibold text-muted-foreground">
				{m.dashboard_needs_review_heading()}
			</h3>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatCard
					label={m.dashboard_pending_pwas()}
					value={data.reviewQueue.pendingPwas}
					icon={AppWindow}
					href="/dashboard/review/pwas"
				/>
				<StatCard
					label={m.dashboard_pending_flatpaks()}
					value={data.reviewQueue.pendingFlatpaks}
					icon={Package}
					href="/dashboard/review/flatpaks"
					accent="text-chart-3"
				/>
				<StatCard
					label={m.dashboard_failed_flatpaks()}
					value={data.reviewQueue.failedFlatpaks}
					icon={AlertTriangle}
					href="/dashboard/review/flatpaks"
					accent="text-destructive"
				/>
				<StatCard
					label={m.dashboard_pending_verifications()}
					value={data.reviewQueue.pendingVerifications}
					icon={BadgeCheck}
					href="/dashboard/review/verifications"
					accent="text-chart-4"
				/>
			</div>

			<Card.Root>
				<Card.Header>
					<Card.Title>{m.dashboard_review_throughput_heading()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<Chart.Container config={reviewThroughputConfig} class="aspect-auto h-40 w-full">
						<LineChart
							data={data.reviewThroughput}
							x="day"
							legend
							series={[
								{
									key: 'approved',
									label: reviewThroughputConfig.approved.label,
									color: reviewThroughputConfig.approved.color
								},
								{
									key: 'rejected',
									label: reviewThroughputConfig.rejected.label,
									color: reviewThroughputConfig.rejected.color
								}
							]}
							props={{ xAxis: { format: formatDay, ticks: 5 } }}
						>
							{#snippet tooltip()}
								<Chart.Tooltip labelFormatter={formatDay} />
							{/snippet}
						</LineChart>
					</Chart.Container>
				</Card.Content>
			</Card.Root>
		</section>
	{/if}

	{#if data.siteStats && data.siteInstalls}
		<section class="space-y-4 border-t border-border pt-8">
			<h3 class="text-sm font-semibold text-muted-foreground">
				{m.dashboard_platform_overview_heading()}
			</h3>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<StatCard
					label={m.dashboard_total_pwas()}
					value={data.siteStats.pwaCount}
					icon={AppWindow}
				/>
				<StatCard
					label={m.dashboard_total_flatpaks()}
					value={data.siteStats.flatpakCount}
					icon={Package}
					accent="text-chart-3"
				/>
				<StatCard
					label={m.dashboard_developer_profiles()}
					value={data.siteStats.developerProfileCount}
					icon={Building2}
					accent="text-chart-4"
					href="/dashboard/verified-developers"
				/>
				<StatCard
					label={m.dashboard_total_installs()}
					value={data.siteStats.totalInstalls}
					icon={Download}
					accent="text-chart-5"
				/>
			</div>

			<Card.Root>
				<Card.Header>
					<Card.Title>{m.dashboard_site_installs_heading()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<Chart.Container config={siteInstallsConfig} class="aspect-auto h-40 w-full">
						<AreaChart
							data={data.siteInstalls}
							x="day"
							series={[
								{
									key: 'count',
									label: siteInstallsConfig.count.label,
									color: siteInstallsConfig.count.color
								}
							]}
							props={{ xAxis: { format: formatDay, ticks: 5 } }}
						>
							{#snippet tooltip()}
								<Chart.Tooltip labelFormatter={formatDay} />
							{/snippet}
						</AreaChart>
					</Chart.Container>
				</Card.Content>
			</Card.Root>
		</section>
	{/if}
</div>
