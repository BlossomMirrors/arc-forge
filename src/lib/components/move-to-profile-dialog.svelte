<script lang="ts">
	import { enhance } from '$app/forms';
	import { FolderInput, Loader2 } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';

	let {
		id,
		itemName,
		currentDeveloperProfileId,
		eligibleProfiles,
		action
	}: {
		id: string;
		itemName: string;
		currentDeveloperProfileId: string | null;
		eligibleProfiles: { id: string; name: string }[];
		action: string;
	} = $props();

	const destinations = $derived(eligibleProfiles.filter((p) => p.id !== currentDeveloperProfileId));

	let open = $state(false);
	let submitting = $state(false);
	let selected = $state('');
</script>

{#if destinations.length > 0}
	<Dialog.Root bind:open onOpenChange={(next) => next && (selected = destinations[0].id)}>
		<Dialog.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
			<FolderInput class="size-4" />
		</Dialog.Trigger>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>{m.move_dialog_heading()}</Dialog.Title>
				<Dialog.Description>{m.move_dialog_hint({ name: itemName })}</Dialog.Description>
			</Dialog.Header>

			<form
				method="POST"
				{action}
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						open = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<input type="hidden" name="id" value={id} />

				<select
					bind:value={selected}
					name="developerProfileId"
					class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
				>
					{#each destinations as profile (profile.id)}
						<option value={profile.id}>{profile.name}</option>
					{/each}
				</select>

				<Dialog.Footer>
					<Dialog.Close type="button" class={buttonVariants({ variant: 'ghost' })}
						>{m.form_cancel()}</Dialog.Close
					>
					<Button type="submit" disabled={!selected || submitting}>
						{#if submitting}
							<Loader2 class="size-4 animate-spin" />
						{:else}
							<FolderInput class="size-4" />
						{/if}
						{m.move_dialog_submit()}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
