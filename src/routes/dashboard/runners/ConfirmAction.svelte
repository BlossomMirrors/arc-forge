<script lang="ts">
	import type { Icon as TablerIcon } from '@tabler/icons-svelte';
	import { enhance } from '$app/forms';
	import { IconLoader2 } from '@tabler/icons-svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';

	let {
		id,
		action,
		label,
		title,
		description,
		icon: Icon,
		destructive = false
	}: {
		id: string;
		action: string;
		label: string;
		title: string;
		description: string;
		icon: TablerIcon;
		destructive?: boolean;
	} = $props();

	let open = $state(false);
	let submitting = $state(false);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger
		class="{buttonVariants({ variant: 'ghost', size: 'sm' })} {destructive
			? 'text-destructive hover:text-destructive'
			: ''}"
	>
		<Icon class="size-4" />
		{label}
	</Dialog.Trigger>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
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
		>
			<input type="hidden" name="id" value={id} />
			<Dialog.Footer>
				<Dialog.Close type="button" class={buttonVariants({ variant: 'ghost' })}
					>{m.form_cancel()}</Dialog.Close
				>
				<Button
					type="submit"
					variant={destructive ? 'destructive' : 'default'}
					disabled={submitting}
				>
					{#if submitting}
						<IconLoader2 class="size-4 animate-spin" />
					{/if}
					{m.runners_confirm()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
