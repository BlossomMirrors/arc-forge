<script lang="ts">
	import PwaForm from '../PwaForm.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let noDeveloperProfile = $derived(!data.isStaff && data.developerProfiles.length === 0);
</script>

<svelte:head>
	<title>New PWA - Arc Forge</title>
</svelte:head>

<div class="space-y-6">
	<h2 class="text-lg font-semibold">{m.pwa_new_heading()}</h2>
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
				submitLabel={m.pwa_create()}
				isStaff={data.isStaff}
				developerProfiles={data.developerProfiles}
			/>
		</form>
	{/if}
</div>
