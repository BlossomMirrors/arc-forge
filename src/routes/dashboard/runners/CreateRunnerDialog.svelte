<script lang="ts">
	import { enhance } from '$app/forms';
	import { IconLoader2, IconPlus } from '@tabler/icons-svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as m from '$lib/paraglide/messages';

	let open = $state(false);
	let name = $state('');
	let submitting = $state(false);
</script>

<Dialog.Root bind:open onOpenChange={(next) => !next && (name = '')}>
	<Dialog.Trigger class={buttonVariants({ size: 'sm' })}>
		<IconPlus class="size-4" />
		{m.runners_new()}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.runners_new()}</Dialog.Title>
			<Dialog.Description>{m.runners_create_hint()}</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					open = false;
					name = '';
					await update();
				};
			}}
			class="space-y-4"
		>
			<label class="block space-y-1.5">
				<span class="text-sm font-medium">{m.runners_name()}</span>
				<Input name="name" bind:value={name} placeholder="build01" maxlength={80} required />
			</label>

			<Dialog.Footer>
				<Dialog.Close type="button" class={buttonVariants({ variant: 'ghost' })}
					>{m.form_cancel()}</Dialog.Close
				>
				<Button type="submit" disabled={!name.trim() || submitting}>
					{#if submitting}
						<IconLoader2 class="size-4 animate-spin" />
					{/if}
					{m.runners_create()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
