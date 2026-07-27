<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		Search,
		ChevronsUp,
		ChevronsDown,
		Maximize2,
		Minimize2,
		Download,
		Radio
	} from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';

	let {
		buildId,
		log: initialLog,
		status: initialStatus
	}: {
		buildId: string;
		log: string;
		status: 'PROCESSING' | 'SUCCESS' | 'FAILED';
	} = $props();

	let log = $state(initialLog);
	let status = $state(initialStatus);
	let search = $state('');
	let expanded = $state(false);
	let container = $state<HTMLPreElement | undefined>();
	let userScrolledUp = $state(false);

	const lines = $derived(log.split('\n'));
	const filteredLines = $derived(
		search.trim()
			? lines.filter((line) => line.toLowerCase().includes(search.trim().toLowerCase()))
			: lines
	);

	let pollHandle: ReturnType<typeof setInterval> | undefined;

	function startPolling() {
		if (pollHandle || status !== 'PROCESSING') return;
		pollHandle = setInterval(async () => {
			try {
				const res = await fetch(`/api/flatpak-builds/${buildId}`);
				if (!res.ok) return;
				const data = await res.json();
				log = data.log;
				status = data.status;
				if (status !== 'PROCESSING' && pollHandle) {
					clearInterval(pollHandle);
					pollHandle = undefined;
				}
			} catch {
				// transient fetch failure, next tick retries
			}
		}, 4000);
	}

	$effect(() => {
		if (status === 'PROCESSING') startPolling();
	});

	onDestroy(() => {
		if (pollHandle) clearInterval(pollHandle);
	});

	$effect(() => {
		// The `log &&` re-reads log on every change so this effect re-runs then, not
		// just when container/userScrolledUp change.
		if (log && container && !userScrolledUp) {
			container.scrollTop = container.scrollHeight;
		}
	});

	function handleScroll() {
		if (!container) return;
		userScrolledUp = container.scrollTop + container.clientHeight < container.scrollHeight - 20;
	}

	function scrollToTop() {
		if (!container) return;
		container.scrollTop = 0;
		userScrolledUp = true;
	}

	function scrollToBottom() {
		if (!container) return;
		container.scrollTop = container.scrollHeight;
		userScrolledUp = false;
	}

	function downloadLog() {
		const blob = new Blob([log], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${buildId}.log`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div
	class={expanded
		? 'fixed inset-4 z-50 flex flex-col rounded-lg border border-border bg-background p-3 shadow-xl'
		: ''}
>
	<div class="mb-2 flex flex-wrap items-center gap-2">
		<div class="relative min-w-40 flex-1">
			<Search
				class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				type="search"
				bind:value={search}
				placeholder={m.flatpak_build_search_placeholder()}
				class="h-8 pl-7 text-xs"
			/>
		</div>
		{#if status === 'PROCESSING'}
			<span class="flex items-center gap-1 text-xs text-blue-600">
				<Radio class="size-3.5 animate-pulse" />
				{m.flatpak_build_live()}
			</span>
		{/if}
		<Button
			type="button"
			size="sm"
			variant="ghost"
			onclick={scrollToTop}
			title={m.flatpak_build_scroll_top()}
		>
			<ChevronsUp class="size-4" />
		</Button>
		<Button
			type="button"
			size="sm"
			variant="ghost"
			onclick={scrollToBottom}
			title={m.flatpak_build_scroll_bottom()}
		>
			<ChevronsDown class="size-4" />
		</Button>
		<Button
			type="button"
			size="sm"
			variant="ghost"
			onclick={downloadLog}
			title={m.flatpak_build_download_log()}
		>
			<Download class="size-4" />
		</Button>
		<Button
			type="button"
			size="sm"
			variant="ghost"
			onclick={() => (expanded = !expanded)}
			title={expanded ? m.flatpak_build_collapse() : m.flatpak_build_expand()}
		>
			{#if expanded}
				<Minimize2 class="size-4" />
			{:else}
				<Maximize2 class="size-4" />
			{/if}
		</Button>
	</div>

	<pre
		bind:this={container}
		onscroll={handleScroll}
		class="{expanded
			? 'flex-1'
			: 'max-h-64'} overflow-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">{filteredLines.join(
			'\n'
		)}</pre>
</div>

{#if expanded}
	<button
		type="button"
		class="fixed inset-0 z-40 bg-black/50"
		aria-label={m.flatpak_build_collapse()}
		onclick={() => (expanded = false)}
	></button>
{/if}
