<script lang="ts">
	import { enhance } from '$app/forms';
	import { BadgeCheck } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import SearchInput from '$lib/components/search-input.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let search = $state('');
	const filteredProfiles = $derived(
		data.profiles.filter((profile) => {
			const q = search.trim().toLowerCase();
			if (!q) return true;
			return profile.name.toLowerCase().includes(q);
		})
	);
</script>

<svelte:head>
	<title>{m.devprofiles_heading()} - Arc Forge</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h2 class="text-lg font-semibold">{m.devprofiles_heading()}</h2>
		<p class="text-sm text-muted-foreground">{m.devprofiles_hint()}</p>
	</div>

	{#if data.profiles.length > 0}
		<SearchInput bind:value={search} placeholder={m.search_placeholder()} />
	{/if}

	{#if data.profiles.length === 0}
		<p class="text-sm text-muted-foreground">{m.devprofile_empty()}</p>
	{:else if filteredProfiles.length === 0}
		<p class="text-sm text-muted-foreground">{m.search_no_results()}</p>
	{:else}
		<ul class="divide-y divide-border rounded-lg border border-border">
			{#each filteredProfiles as profile (profile.id)}
				<li class="flex items-center justify-between gap-3 px-4 py-3">
					<div class="min-w-0">
						<div class="flex items-center gap-2">
							<p class="truncate text-sm font-medium">{profile.name}</p>
							{#if profile.verified}
								<span
									class="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600"
								>
									<BadgeCheck class="size-3" />
									{m.devprofiles_verified()}
								</span>
							{/if}
						</div>
						<p class="text-xs text-muted-foreground">
							{m.devprofiles_members({ n: profile._count.members })} ·
							{m.devprofiles_submissions({
								n: profile._count.pwaApps + profile._count.flatpakApps
							})}
							{#if profile.verified && profile.verifiedBy}
								· {m.devprofiles_verified_by({ name: profile.verifiedBy.name })}
							{/if}
						</p>
					</div>
					<form method="POST" action="?/setVerified" use:enhance>
						<input type="hidden" name="id" value={profile.id} />
						<input type="hidden" name="verified" value={(!profile.verified).toString()} />
						<Button type="submit" variant={profile.verified ? 'ghost' : 'default'} size="sm">
							{profile.verified ? m.devprofiles_revoke() : m.devprofiles_verify()}
						</Button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</div>
