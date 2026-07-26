<script lang="ts">
	import { enhance } from '$app/forms';
	import { Copy, Check } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();

	let copied = $state(false);
	let repairing = $state(false);

	async function copyPublicKey() {
		if (!data.sshPublicKey) return;
		await navigator.clipboard.writeText(data.sshPublicKey);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head>
	<title>Infra Settings - Arc Forge</title>
</svelte:head>

<div class="max-w-2xl space-y-8">
	<div>
		<h2 class="text-lg font-semibold">{m.infra_heading()}</h2>
		<p class="text-sm text-muted-foreground">{m.infra_hint()}</p>
	</div>

	{#if form?.error}
		<p class="text-sm text-destructive">{form.error}</p>
	{/if}

	<div class="space-y-3 rounded-lg border border-border p-4">
		<h3 class="text-sm font-semibold">{m.infra_ssh_heading()}</h3>
		{#if data.sshPublicKey}
			<div class="flex gap-2">
				<code
					class="flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-xs whitespace-nowrap"
					>{data.sshPublicKey}</code
				>
				<Button type="button" variant="ghost" size="icon" onclick={copyPublicKey}>
					{#if copied}<Check class="size-4" />{:else}<Copy class="size-4" />{/if}
				</Button>
			</div>
			<p class="text-xs text-muted-foreground">{m.infra_ssh_authorize_hint()}</p>
		{:else}
			<p class="text-sm text-muted-foreground">{m.infra_ssh_none()}</p>
		{/if}
		<form
			method="POST"
			action="?/generateSshKey"
			use:enhance={({ cancel }) => {
				const msg = data.sshPublicKey
					? m.infra_ssh_regenerate_confirm()
					: m.infra_ssh_generate_confirm();
				if (!confirm(msg)) cancel();
			}}
		>
			<Button type="submit" variant={data.sshPublicKey ? 'ghost' : 'default'} size="sm">
				{data.sshPublicKey ? m.infra_ssh_regenerate() : m.infra_ssh_generate()}
			</Button>
		</form>
	</div>

	<div class="space-y-3 rounded-lg border border-border p-4">
		<h3 class="text-sm font-semibold">{m.infra_gpg_heading()}</h3>
		<p class="text-sm text-muted-foreground">
			{data.hasGpgPassphrase ? m.infra_gpg_set() : m.infra_gpg_none()}
		</p>
		<form method="POST" action="?/setGpgPassphrase" use:enhance class="flex gap-2">
			<Input
				type="password"
				name="passphrase"
				placeholder={m.infra_gpg_placeholder()}
				class="flex-1"
				required
			/>
			<Button type="submit" size="sm">{m.infra_gpg_save()}</Button>
		</form>
	</div>

	<div class="space-y-3 rounded-lg border border-border p-4">
		<h3 class="text-sm font-semibold">{m.infra_remote_heading()}</h3>
		<form method="POST" action="?/updateRemote" use:enhance class="space-y-3">
			<label class="block space-y-1.5">
				<span class="text-sm font-medium">{m.infra_remote_host()}</span>
				<Input name="remoteHost" value={data.remoteHost} required />
			</label>
			<label class="block space-y-1.5">
				<span class="text-sm font-medium">{m.infra_remote_user()}</span>
				<Input name="remoteUser" value={data.remoteUser} required />
			</label>
			<label class="block space-y-1.5">
				<span class="text-sm font-medium">{m.infra_remote_path()}</span>
				<Input name="remoteRepoPath" value={data.remoteRepoPath} required />
			</label>
			<Button type="submit" size="sm">{m.infra_remote_save()}</Button>
		</form>
	</div>

	<div class="space-y-3 rounded-lg border border-border p-4">
		<h3 class="text-sm font-semibold">{m.infra_repair_heading()}</h3>
		<p class="text-sm text-muted-foreground">{m.infra_repair_hint()}</p>
		<form
			method="POST"
			action="?/repairAppstreamAction"
			use:enhance={({ cancel }) => {
				if (!confirm(m.infra_repair_confirm())) {
					cancel();
					return;
				}
				repairing = true;
				return async ({ update }) => {
					repairing = false;
					await update();
				};
			}}
		>
			<Button type="submit" variant="ghost" size="sm" disabled={repairing}>
				{repairing ? m.infra_repair_running() : m.infra_repair_run()}
			</Button>
		</form>
		{#if form?.log}
			<pre
				class="max-h-64 overflow-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">{form.log}</pre>
		{/if}
	</div>
</div>
