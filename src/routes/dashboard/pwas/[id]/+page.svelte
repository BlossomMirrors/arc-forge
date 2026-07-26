<script lang="ts">
	import PwaForm from '../PwaForm.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let noDeveloperProfile = $derived(!data.isStaff && data.developerProfiles.length === 0);
</script>

<svelte:head>
	<title>{data.app.name} - Arc Forge</title>
</svelte:head>

<div class="space-y-6">
	<h2 class="text-lg font-semibold">{m.pwa_edit_heading()} {data.app.name}</h2>
	{#if data.app.status === 'REJECTED' && data.app.reviewNote}
		<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
			<p class="font-medium text-destructive">{m.pwa_status_rejected()}</p>
			<p class="text-muted-foreground">{data.app.reviewNote}</p>
		</div>
	{:else if data.app.status === 'PULLED'}
		<div class="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
			<p class="font-medium text-amber-600">{m.pwa_status_pulled()}</p>
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
		<form method="POST">
			<PwaForm
				values={data.app}
				translations={data.translations}
				submitLabel={m.pwa_save_changes()}
				isStaff={data.isStaff}
				developerProfiles={data.developerProfiles}
			/>
		</form>
	{/if}
</div>
