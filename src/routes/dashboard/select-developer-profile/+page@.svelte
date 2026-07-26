<script lang="ts">
	import { enhance } from '$app/forms';
	import { Building2 } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>{m.selectprofile_heading()} - Arc Forge</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
	<div
		class="w-full max-w-sm space-y-6 rounded-lg border border-border bg-background p-6 shadow-lg"
	>
		<div class="flex items-center gap-2">
			<img src="/arc.png" alt="Arc Forge" class="size-8" />
			<span class="font-semibold">Arc Forge</span>
		</div>

		<h1 class="text-lg font-semibold">{m.selectprofile_heading()}</h1>

		{#if form?.error}
			<p class="text-sm text-destructive">{form.error}</p>
		{/if}

		<ul class="-mx-2 space-y-1">
			{#each data.developerProfiles as profile (profile.id)}
				<li>
					<form method="POST" action="?/select" use:enhance>
						<input type="hidden" name="developerProfileId" value={profile.id} />
						<button
							type="submit"
							class="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted"
						>
							{#if profile.logo}
								<img src={profile.logo} alt="" class="size-8 shrink-0 rounded-full object-cover" />
							{:else}
								<span
									class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
								>
									<Building2 class="size-4" />
								</span>
							{/if}
							<span class="font-medium">{profile.name}</span>
						</button>
					</form>
				</li>
			{/each}
		</ul>
	</div>
</div>
