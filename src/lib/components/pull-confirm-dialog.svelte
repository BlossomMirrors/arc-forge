<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowDownCircle, Loader2 } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import ConfirmAppidInput from '$lib/components/confirm-appid-input.svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		id,
		appName,
		appid,
		action
	}: {
		id: string;
		appName: string;
		appid: string;
		action: string;
	} = $props();

	let open = $state(false);
	let note = $state('');
	let confirmText = $state('');
	let submitting = $state(false);
	const confirmed = $derived(confirmText.trim() === appid);

	function reset() {
		note = '';
		confirmText = '';
	}
</script>

<Dialog.Root bind:open onOpenChange={(next) => !next && reset()}>
	<Dialog.Trigger class={buttonVariants({ variant: 'ghost', size: 'sm' })}>
		<ArrowDownCircle class="size-4" />
		{m.review_pull()}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.review_pull_dialog_heading()}</Dialog.Title>
			<Dialog.Description>{m.review_pull_dialog_hint({ name: appName })}</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			{action}
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					open = false;
					reset();
					await update();
				};
			}}
			class="space-y-4"
		>
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="note" value={note} />

			<label class="block space-y-1.5">
				<span class="text-sm font-medium">{m.review_pull_reason_placeholder()}</span>
				<textarea
					bind:value={note}
					rows="2"
					class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
				></textarea>
			</label>

			<ConfirmAppidInput {appid} bind:value={confirmText} />

			<Dialog.Footer>
				<Dialog.Close type="button" class={buttonVariants({ variant: 'ghost' })}
					>{m.form_cancel()}</Dialog.Close
				>
				<Button type="submit" variant="destructive" disabled={!confirmed || submitting}>
					{#if submitting}
						<Loader2 class="size-4 animate-spin" />
					{:else}
						<ArrowDownCircle class="size-4" />
					{/if}
					{m.review_pull()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
