<script lang="ts">
	import { enhance } from '$app/forms';
	import { IconBan, IconKey, IconPencil, IconTrash } from '@tabler/icons-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as m from '$lib/paraglide/messages';
	import ConfirmAction from './ConfirmAction.svelte';
	import type { PageData } from './$types';

	type Runner = PageData['runners'][number];

	let { runner, latestVersion }: { runner: Runner; latestVersion: string | null } = $props();

	let editing = $state(false);
	let name = $state('');

	const outdated = $derived(
		!!latestVersion && !!runner.version && runner.version !== latestVersion
	);
	const status = $derived(
		runner.revoked
			? { label: m.runners_revoked(), dot: 'bg-destructive' }
			: runner.online
				? { label: m.runners_online(), dot: 'bg-green-500' }
				: { label: m.runners_offline(), dot: 'bg-muted-foreground/40' }
	);
	const details = $derived(
		[runner.hostname, runner.os, runner.arch, runner.version && `v${runner.version}`, runner.lastIp]
			.filter(Boolean)
			.join(' · ')
	);

	function startEditing() {
		name = runner.name;
		editing = true;
	}
</script>

<li class="space-y-2 px-4 py-3">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="flex min-w-0 items-center gap-2.5">
			<span class="size-2.5 shrink-0 rounded-full {status.dot}" title={status.label}></span>
			{#if editing}
				<form
					method="POST"
					action="?/rename"
					class="flex items-center gap-2"
					use:enhance={() =>
						async ({ update }) => {
							editing = false;
							await update();
						}}
				>
					<input type="hidden" name="id" value={runner.id} />
					<Input name="name" bind:value={name} maxlength={80} class="h-8 w-48" required />
					<Button type="submit" size="sm" disabled={!name.trim()}>{m.runners_save()}</Button>
					<Button type="button" variant="ghost" size="sm" onclick={() => (editing = false)}
						>{m.form_cancel()}</Button
					>
				</form>
			{:else}
				<span class="truncate font-medium">{runner.name}</span>
				<span class="text-xs text-muted-foreground">{status.label}</span>
				{#if outdated}
					<span class="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600"
						>{m.runners_outdated()}</span
					>
				{/if}
			{/if}
		</div>

		{#if !editing}
			<div class="flex flex-wrap items-center gap-1">
				<Button variant="ghost" size="sm" onclick={startEditing}>
					<IconPencil class="size-4" />
					{m.runners_rename()}
				</Button>
				<ConfirmAction
					id={runner.id}
					action="?/regenerate"
					label={m.runners_regenerate()}
					title={m.runners_regenerate()}
					description={m.runners_regenerate_confirm({ name: runner.name })}
					icon={IconKey}
				/>
				{#if !runner.revoked}
					<ConfirmAction
						id={runner.id}
						action="?/revoke"
						label={m.runners_revoke()}
						title={m.runners_revoke()}
						description={m.runners_revoke_confirm({ name: runner.name })}
						icon={IconBan}
						destructive
					/>
				{/if}
				<ConfirmAction
					id={runner.id}
					action="?/delete"
					label={m.runners_delete()}
					title={m.runners_delete()}
					description={m.runners_delete_confirm({ name: runner.name })}
					icon={IconTrash}
					destructive
				/>
			</div>
		{/if}
	</div>

	<div class="flex flex-wrap gap-x-4 gap-y-1 pl-5 text-xs text-muted-foreground">
		{#if details}<span>{details}</span>{/if}
		<span>
			{runner.lastSeenAt
				? m.runners_last_seen({ time: new Date(runner.lastSeenAt).toLocaleString() })
				: m.runners_never_seen()}
		</span>
		{#if runner.concurrency}<span>{m.runners_workers({ count: runner.concurrency })}</span>{/if}
		<span>{m.runners_jobs({ count: runner.runningJobs })}</span>
		{#if runner.tokenHint}<span class="font-mono">frt_…{runner.tokenHint}</span>{/if}
	</div>
</li>
