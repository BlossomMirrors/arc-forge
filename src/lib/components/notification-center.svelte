<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import { Bell, X } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';

	type Notification = {
		id: string;
		title: string;
		body: string | null;
		link: string | null;
		read: boolean;
		createdAt: Date;
	};

	let { notifications, unreadCount }: { notifications: Notification[]; unreadCount: number } =
		$props();

	let items = $state<Notification[]>([]);
	let count = $state(0);
	let dropdownOpen = $state(false);

	// Re-synced whenever the dashboard layout's server load reruns (e.g. on
	// navigation) - separate from the polling refresh below, which covers the time
	// spent sitting on one page between navigations.
	$effect(() => {
		items = notifications;
		count = unreadCount;
	});

	// No push/SSE mechanism exists here, so polling is the refresh cadence: pick up
	// new notifications (a review approving your submission, etc.) without requiring
	// a navigation. Only runs while the dropdown isn't open, so an in-progress read
	// doesn't get silently reordered/pruned out from under the user.
	$effect(() => {
		const interval = setInterval(async () => {
			if (dropdownOpen) return;
			const res = await fetch('/api/notifications');
			if (!res.ok) return;
			const data = await res.json();
			items = data.notifications;
			count = data.unreadCount;
		}, 30000);
		return () => clearInterval(interval);
	});

	async function markRead(id: string) {
		items = items.map((n) => (n.id === id ? { ...n, read: true } : n));
		count = items.filter((n) => !n.read).length;
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
	}

	async function markAllRead() {
		items = items.map((n) => ({ ...n, read: true }));
		count = 0;
		await fetch('/api/notifications', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});
	}

	async function deleteOne(id: string) {
		const wasUnread = items.find((n) => n.id === id)?.read === false;
		items = items.filter((n) => n.id !== id);
		if (wasUnread) count = Math.max(0, count - 1);
		await fetch('/api/notifications', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
	}

	async function deleteAll() {
		if (!confirm(m.notifications_delete_all_confirm())) return;
		items = [];
		count = 0;
		await fetch('/api/notifications', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ all: true })
		});
	}

	function relativeTime(date: Date): string {
		const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
		if (mins < 1) return m.notifications_time_now();
		if (mins < 60) return m.notifications_time_minutes({ n: mins });
		const hours = Math.round(mins / 60);
		if (hours < 24) return m.notifications_time_hours({ n: hours });
		return m.notifications_time_days({ n: Math.round(hours / 24) });
	}

	function open(n: Notification) {
		if (!n.read) markRead(n.id);
		dropdownOpen = false;
		// n.link is a dynamic runtime value (a notification's stored target), not a static route id
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		if (n.link) goto(n.link);
	}
</script>

<DropdownMenu.Root bind:open={dropdownOpen}>
	<DropdownMenu.Trigger
		class="relative flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted focus-visible:outline-none"
		aria-label={m.notifications_heading()}
	>
		<Bell class="size-4" />
		{#if count > 0}
			<span class="absolute top-1.5 right-1.5 size-2 rounded-full bg-destructive"></span>
		{/if}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content
		class="z-50 max-h-96 w-80 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-lg"
		align="start"
		sideOffset={8}
	>
		<div class="flex items-center justify-between px-3 py-2">
			<p class="text-sm font-medium">{m.notifications_heading()}</p>
			<div class="flex items-center gap-3">
				{#if count > 0}
					<button
						type="button"
						class="text-xs text-muted-foreground hover:text-foreground"
						onclick={markAllRead}
					>
						{m.notifications_mark_all_read()}
					</button>
				{/if}
				{#if items.length > 0}
					<button
						type="button"
						class="text-xs text-muted-foreground hover:text-destructive"
						onclick={deleteAll}
					>
						{m.notifications_delete_all()}
					</button>
				{/if}
			</div>
		</div>
		<DropdownMenu.Separator class="my-1 h-px bg-border" />
		{#if items.length === 0}
			<p class="px-3 py-4 text-center text-sm text-muted-foreground">{m.notifications_empty()}</p>
		{:else}
			{#each items as n (n.id)}
				<div
					class="group flex items-start gap-1 rounded-md px-1 py-1 text-sm {n.read
						? ''
						: 'bg-primary/5'}"
				>
					<button
						type="button"
						class="min-w-0 flex-1 rounded-md px-2 py-1 text-left hover:bg-muted"
						onclick={() => open(n)}
					>
						<div class="flex items-center justify-between gap-2">
							<span class={n.read ? 'text-muted-foreground' : 'font-medium'}>{n.title}</span>
							<span class="shrink-0 text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span
							>
						</div>
						{#if n.body}
							<p class="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
						{/if}
					</button>
					<button
						type="button"
						class="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
						aria-label={m.notifications_delete()}
						onclick={() => deleteOne(n.id)}
					>
						<X class="size-3.5" />
					</button>
				</div>
			{/each}
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
