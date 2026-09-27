<script lang="ts">
	import { IconCheck, IconCopy, IconTerminal2 } from '@tabler/icons-svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';

	let { name, command, ondismiss }: { name: string; command: string; ondismiss: () => void } =
		$props();

	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(command);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
	<div class="flex items-center gap-2">
		<IconTerminal2 class="size-4 text-primary" />
		<h3 class="text-sm font-semibold">{m.runners_install_heading({ name })}</h3>
	</div>
	<p class="text-sm text-muted-foreground">{m.runners_install_hint()}</p>
	<div class="flex items-start gap-2">
		<code
			class="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap"
			>{command}</code
		>
		<Button variant="ghost" size="sm" onclick={copy}>
			{#if copied}
				<IconCheck class="size-4" />
				{m.runners_copied()}
			{:else}
				<IconCopy class="size-4" />
				{m.runners_copy()}
			{/if}
		</Button>
	</div>
	<div class="flex justify-end">
		<Button variant="ghost" size="sm" onclick={ondismiss}>{m.runners_dismiss()}</Button>
	</div>
</div>
