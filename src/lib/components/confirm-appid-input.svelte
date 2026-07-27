<script lang="ts">
	import { Copy, Check } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as m from '$lib/paraglide/messages';

	let {
		appid,
		value = $bindable('')
	}: {
		appid: string;
		value?: string;
	} = $props();

	let copied = $state(false);

	async function copyAppid() {
		await navigator.clipboard.writeText(appid);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="space-y-1.5">
	<span class="text-sm font-medium">{m.review_confirm_appid_label({ appid })}</span>
	<div class="flex gap-2">
		<code
			class="flex-1 content-center overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-xs whitespace-nowrap"
			>{appid}</code
		>
		<Button
			type="button"
			variant="ghost"
			size="icon"
			onclick={copyAppid}
			aria-label={m.review_copy_appid()}
		>
			{#if copied}<Check class="size-4" />{:else}<Copy class="size-4" />{/if}
		</Button>
	</div>
	<Input bind:value placeholder={appid} autocomplete="off" autocorrect="off" spellcheck="false" />
</div>
