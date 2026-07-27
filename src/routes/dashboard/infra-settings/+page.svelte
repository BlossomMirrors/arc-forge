<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Copy, Check, LogOut } from '@lucide/svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();

	let copied = $state(false);
	let repairing = $state(false);
	let aborting = $state(false);
	// The `form` prop is shared across every action on this page - track which
	// card's submit populated it so each only renders its own result/log.
	let lastAction = $state<'repair' | 'abort' | null>(null);

	async function copyPublicKey() {
		if (!data.sshPublicKey) return;
		await navigator.clipboard.writeText(data.sshPublicKey);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	let codeSent = $state(false);
	let sending = $state(false);
	let verifying = $state(false);
	let signingOut = $state(false);

	const requestCodeEnhance: SubmitFunction = () => {
		sending = true;
		return async ({ result, update }) => {
			sending = false;
			if (result.type === 'success') codeSent = true;
			await update();
		};
	};

	const verifyCodeEnhance: SubmitFunction = () => {
		verifying = true;
		return async ({ update }) => {
			verifying = false;
			await update();
		};
	};

	const signOutEnhance: SubmitFunction = () => {
		signingOut = true;
		return async ({ update }) => {
			signingOut = false;
			await update();
		};
	};

	let remainingSeconds = $state(0);
	$effect(() => {
		if (!data.verified) return;
		const expiresAt = new Date(data.accessExpiresAt).getTime();
		const tick = () => {
			remainingSeconds = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
			if (remainingSeconds <= 0) invalidateAll();
		};
		tick();
		const interval = setInterval(tick, 1000);
		return () => clearInterval(interval);
	});

	function formatRemaining(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<svelte:head>
	<title>Infra Settings - Arc Forge</title>
</svelte:head>

{#if !data.verified}
	<div class="max-w-md space-y-4">
		<div>
			<h2 class="text-lg font-semibold">{m.infra_heading()}</h2>
			<p class="text-sm text-muted-foreground">{m.infra_access_hint()}</p>
		</div>

		{#if form?.error}
			<p class="text-sm text-destructive">{form.error}</p>
		{/if}

		{#if !codeSent}
			<form method="POST" action="?/requestAccessCode" use:enhance={requestCodeEnhance}>
				<Button type="submit" disabled={sending}>
					{sending ? m.infra_access_sending() : m.infra_access_send_code()}
				</Button>
			</form>
		{:else}
			<form
				method="POST"
				action="?/verifyAccessCode"
				use:enhance={verifyCodeEnhance}
				class="flex gap-2"
			>
				<Input
					name="code"
					inputmode="numeric"
					maxlength={6}
					placeholder={m.infra_access_code_placeholder()}
					class="flex-1"
					required
				/>
				<Button type="submit" disabled={verifying}>
					{verifying ? m.infra_access_verifying() : m.infra_access_verify()}
				</Button>
			</form>
			<form method="POST" action="?/requestAccessCode" use:enhance={requestCodeEnhance}>
				<Button type="submit" variant="ghost" size="sm" disabled={sending}>
					{m.infra_access_resend()}
				</Button>
			</form>
		{/if}
	</div>
{:else}
	<div class="max-w-2xl space-y-8">
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 class="text-lg font-semibold">{m.infra_heading()}</h2>
				<p class="text-sm text-muted-foreground">{m.infra_hint()}</p>
			</div>
			<div class="flex shrink-0 items-center gap-3">
				<span class="text-xs text-muted-foreground">
					{m.infra_access_expires_in({ time: formatRemaining(remainingSeconds) })}
				</span>
				<form method="POST" action="?/signOutAccess" use:enhance={signOutEnhance}>
					<Button type="submit" variant="ghost" size="sm" disabled={signingOut}>
						<LogOut class="size-4" />
						{m.infra_access_sign_out()}
					</Button>
				</form>
			</div>
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
				<label class="block space-y-1.5">
					<span class="text-sm font-medium">{m.infra_build_work_dir()}</span>
					<Input
						name="buildWorkDir"
						value={data.buildWorkDir}
						placeholder={m.infra_build_work_dir_placeholder()}
					/>
					<span class="text-xs text-muted-foreground">{m.infra_build_work_dir_hint()}</span>
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
					lastAction = 'repair';
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
			{#if lastAction === 'repair' && form?.log}
				<pre
					class="max-h-64 overflow-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">{form.log}</pre>
			{/if}
		</div>

		<div class="space-y-3 rounded-lg border border-destructive/30 p-4">
			<h3 class="text-sm font-semibold">{m.infra_abort_processing_heading()}</h3>
			<p class="text-sm text-muted-foreground">{m.infra_abort_processing_hint()}</p>
			<form
				method="POST"
				action="?/abortProcessingBuildsAction"
				use:enhance={({ cancel }) => {
					if (!confirm(m.infra_abort_processing_confirm())) {
						cancel();
						return;
					}
					lastAction = 'abort';
					aborting = true;
					return async ({ update }) => {
						aborting = false;
						await update();
					};
				}}
			>
				<Button type="submit" variant="destructive" size="sm" disabled={aborting}>
					{aborting ? m.infra_abort_processing_running() : m.infra_abort_processing_run()}
				</Button>
			</form>
			{#if lastAction === 'abort' && form && 'count' in form && form.count !== undefined}
				<p class="text-sm text-muted-foreground">
					{m.infra_abort_processing_result({ count: form.count })}
				</p>
			{/if}
			{#if lastAction === 'abort' && form?.log}
				<pre
					class="max-h-64 overflow-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">{form.log}</pre>
			{/if}
		</div>
	</div>
{/if}
