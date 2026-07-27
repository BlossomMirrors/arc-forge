<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronRight, ChevronDown } from '@lucide/svelte';
	import FlatpakBuildLogViewer from './flatpak-build-log-viewer.svelte';
	import * as m from '$lib/paraglide/messages';

	type BuildStatus = 'PROCESSING' | 'SUCCESS' | 'FAILED';
	type BuildSummary = {
		id: string;
		status: BuildStatus;
		gitCommit: string | null;
		triggeredBy: string | null;
		// Date when loaded eagerly via +page.server.ts (devalue preserves Date),
		// string when fetched from the JSON API endpoint - new Date() handles both.
		startedAt: string | Date;
		finishedAt: string | Date | null;
	};

	let {
		flatpakAppId,
		initialBuilds = null
	}: { flatpakAppId: string; initialBuilds?: BuildSummary[] | null } = $props();

	let builds = $state<BuildSummary[]>(initialBuilds ?? []);
	let loading = $state(initialBuilds === null);
	let expandedId = $state<string | null>(null);
	let expandedLog = $state<{ log: string; status: BuildStatus } | null>(null);

	onMount(async () => {
		if (initialBuilds !== null) return;
		await load();
	});

	async function load() {
		loading = true;
		try {
			const res = await fetch(`/api/flatpaks/${flatpakAppId}/builds`);
			if (res.ok) {
				const data = await res.json();
				builds = data.builds;
			}
		} finally {
			loading = false;
		}
	}

	async function toggle(build: BuildSummary) {
		if (expandedId === build.id) {
			expandedId = null;
			expandedLog = null;
			return;
		}
		expandedId = build.id;
		expandedLog = null;
		const res = await fetch(`/api/flatpak-builds/${build.id}`);
		if (res.ok) {
			const data = await res.json();
			expandedLog = { log: data.log, status: data.status };
		}
	}

	function statusBadge(status: BuildStatus): { label: string; class: string } {
		switch (status) {
			case 'SUCCESS':
				return { label: m.flatpak_build_status_success(), class: 'bg-green-500/10 text-green-600' };
			case 'FAILED':
				return {
					label: m.flatpak_build_status_failed(),
					class: 'bg-destructive/10 text-destructive'
				};
			default:
				return {
					label: m.flatpak_build_status_processing(),
					class: 'bg-blue-500/10 text-blue-600'
				};
		}
	}
</script>

<div class="space-y-2">
	<p class="text-sm font-medium">{m.flatpak_build_history_heading()}</p>
	{#if loading}
		<p class="text-xs text-muted-foreground">{m.flatpak_build_loading()}</p>
	{:else if builds.length === 0}
		<p class="text-xs text-muted-foreground">{m.flatpak_build_history_empty()}</p>
	{:else}
		<ul class="space-y-1">
			{#each builds as build (build.id)}
				{@const badge = statusBadge(build.status)}
				<li class="rounded border border-border">
					<button
						type="button"
						class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/50"
						onclick={() => toggle(build)}
					>
						{#if expandedId === build.id}
							<ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
						{:else}
							<ChevronRight class="size-3.5 shrink-0 text-muted-foreground" />
						{/if}
						<span class="shrink-0 rounded-full px-2 py-0.5 font-medium {badge.class}">
							{badge.label}
						</span>
						<span class="text-muted-foreground">{new Date(build.startedAt).toLocaleString()}</span>
						{#if build.triggeredBy}
							<span class="text-muted-foreground">· {build.triggeredBy}</span>
						{/if}
						{#if build.gitCommit}
							<code class="text-muted-foreground">· {build.gitCommit.slice(0, 8)}</code>
						{/if}
					</button>
					{#if expandedId === build.id}
						<div class="border-t border-border p-2">
							{#if expandedLog}
								<FlatpakBuildLogViewer
									buildId={build.id}
									log={expandedLog.log}
									status={expandedLog.status}
								/>
							{:else}
								<p class="text-xs text-muted-foreground">{m.flatpak_build_loading()}</p>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
