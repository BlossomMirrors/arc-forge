<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import CreateRunnerDialog from './CreateRunnerDialog.svelte';
	import InstallCommand from './InstallCommand.svelte';
	import RunnerRow from './RunnerRow.svelte';

	let { data, form } = $props();

	let dismissed = $state<string | null>(null);
	const issued = $derived(form && 'issued' in form ? form.issued : null);

	onMount(() => {
		const timer = setInterval(() => invalidateAll(), 30_000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head>
	<title>{m.nav_runners()} - Arc Forge</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h2 class="text-lg font-semibold">{m.nav_runners()}</h2>
			<p class="text-sm text-muted-foreground">{m.runners_hint()}</p>
			<p class="text-xs text-muted-foreground">
				{m.runners_latest_version({ version: data.latestVersion ?? m.runners_version_unknown() })}
			</p>
		</div>
		<CreateRunnerDialog />
	</div>

	{#if issued && dismissed !== issued.command}
		<InstallCommand
			name={issued.name}
			command={issued.command}
			ondismiss={() => (dismissed = issued.command)}
		/>
	{/if}

	{#if data.runners.length === 0}
		<p class="text-sm text-muted-foreground">{m.runners_empty()}</p>
	{:else}
		<ul class="divide-y divide-border rounded-lg border border-border">
			{#each data.runners as runner (runner.id)}
				<RunnerRow {runner} latestVersion={data.latestVersion} />
			{/each}
		</ul>
	{/if}
</div>
