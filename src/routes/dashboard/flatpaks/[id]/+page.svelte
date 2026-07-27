<script lang="ts">
	import { enhance } from '$app/forms';
	import FlatpakForm from '../FlatpakForm.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();

	let noDeveloperProfile = $derived(!data.isStaff && data.developerProfiles.length === 0);
	let processing = $state(false);
</script>

<svelte:head>
	<title>{data.app.name} - Arc Forge</title>
</svelte:head>

<div class="space-y-6">
	<h2 class="text-lg font-semibold">{m.flatpak_edit_heading()} {data.app.name}</h2>
	{#if form?.error}
		<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
			<p class="font-medium text-destructive">{m.submission_error()}</p>
			{#if 'log' in form && form.log}
				<pre
					class="mt-2 max-h-64 overflow-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">{form.log}</pre>
			{/if}
		</div>
	{/if}
	{#if data.app.status === 'REJECTED' && data.app.reviewNote}
		<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
			<p class="font-medium text-destructive">{m.flatpak_status_rejected()}</p>
			<p class="text-muted-foreground">{data.app.reviewNote}</p>
		</div>
	{/if}
	{#if data.app.status === 'FAILED' && data.app.buildLog}
		<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
			<p class="font-medium text-destructive">{m.flatpak_status_failed()}</p>
			<pre
				class="mt-2 max-h-64 overflow-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">{data
					.app.buildLog}</pre>
		</div>
	{:else if data.app.status === 'PULLED'}
		<div class="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
			<p class="font-medium text-amber-600">{m.flatpak_status_pulled()}</p>
			{#if data.app.reviewNote}
				<p class="text-muted-foreground">{data.app.reviewNote}</p>
			{/if}
		</div>
	{/if}
	{#if noDeveloperProfile}
		<p class="text-sm text-muted-foreground">
			{m.form_no_developer_profile()}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="/dashboard/developer-profile" class="text-primary underline"
				>{m.form_create_developer_profile()}</a
			>
		</p>
	{:else}
		<form
			method="POST"
			use:enhance={() => {
				processing = true;
				return async ({ update }) => {
					await update();
					processing = false;
				};
			}}
		>
			<FlatpakForm
				values={data.app}
				submitLabel={m.flatpak_save_changes()}
				isStaff={data.isStaff}
				developerProfiles={data.developerProfiles}
				hasGithubAccount={data.hasGithubAccount}
				{processing}
			/>
		</form>
	{/if}
</div>
