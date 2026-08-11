<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { LogOut } from '@lucide/svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	let repairing = $state(false);
	let aborting = $state(false);
	// The `form` prop is shared across every action on this page - track which
	// card's submit populated it so each only renders its own result/log.
	let lastAction = $state<'repair' | 'abort' | null>(null);

	// svelte-ignore state_referenced_locally
	let noPassphrase = $state(data.gpgPassphraseIsEmpty);

	onMount(() => {
		setTimeout(() => {
			noPassphrase = data.gpgPassphraseIsEmpty;
		}, 100);
	});

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
			<h3 class="text-sm font-semibold">{m.infra_repo_file_heading()}</h3>
			<p class="text-sm text-muted-foreground">{m.infra_repo_file_hint()}</p>
			<form method="POST" action="?/setFlatpakRepoMetadata" use:enhance class="space-y-3">
				<div class="space-y-1">
					<label class="text-xs text-muted-foreground" for="flatpakRepoTitle">
						{m.infra_repo_file_title()}
					</label>
					<Input
						id="flatpakRepoTitle"
						name="flatpakRepoTitle"
						value={data.flatpakRepoTitle}
						placeholder={m.infra_repo_file_title_placeholder()}
					/>
				</div>
				<div class="space-y-1">
					<label class="text-xs text-muted-foreground" for="flatpakRepoHomepage">
						{m.infra_repo_file_homepage()}
					</label>
					<Input
						id="flatpakRepoHomepage"
						name="flatpakRepoHomepage"
						value={data.flatpakRepoHomepage}
						placeholder={m.infra_repo_file_homepage_placeholder()}
					/>
				</div>
				<div class="space-y-1">
					<label class="text-xs text-muted-foreground" for="flatpakRepoComment">
						{m.infra_repo_file_comment()}
					</label>
					<Input
						id="flatpakRepoComment"
						name="flatpakRepoComment"
						value={data.flatpakRepoComment}
						placeholder={m.infra_repo_file_comment_placeholder()}
					/>
				</div>
				<div class="space-y-1">
					<label class="text-xs text-muted-foreground" for="flatpakRepoDescription">
						{m.infra_repo_file_description()}
					</label>
					<Input
						id="flatpakRepoDescription"
						name="flatpakRepoDescription"
						value={data.flatpakRepoDescription}
						placeholder={m.infra_repo_file_description_placeholder()}
					/>
				</div>
				<div class="space-y-1">
					<label class="text-xs text-muted-foreground" for="flatpakRepoIconUrl">
						{m.infra_repo_file_icon_url()}
					</label>
					<Input
						id="flatpakRepoIconUrl"
						name="flatpakRepoIconUrl"
						value={data.flatpakRepoIconUrl}
						placeholder={m.infra_repo_file_icon_url_placeholder()}
					/>
				</div>
				<Button type="submit" size="sm">{m.infra_repo_file_save()}</Button>
			</form>
		</div>

		<div class="space-y-3 rounded-lg border border-border p-4">
			<h3 class="text-sm font-semibold">{m.infra_gpg_key_heading()}</h3>
			<p class="text-sm text-muted-foreground">
				{data.hasGpgPrivateKey ? m.infra_gpg_key_set() : m.infra_gpg_key_none()}
			</p>
			<form
				method="POST"
				action="?/setGpgPrivateKey"
				use:enhance={({ cancel }) => {
					if (data.hasGpgPrivateKey && !confirm(m.infra_gpg_key_replace_confirm())) {
						cancel();
					}
				}}
				class="space-y-2"
			>
				<textarea
					name="privateKey"
					rows={6}
					placeholder={m.infra_gpg_key_placeholder()}
					class="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-sm placeholder:text-muted-foreground"
					required
				></textarea>
				<Button type="submit" size="sm">{m.infra_gpg_key_save()}</Button>
			</form>
		</div>

		<div class="space-y-3 rounded-lg border border-border p-4">
			<h3 class="text-sm font-semibold">{m.infra_gpg_heading()}</h3>
			<p class="text-sm text-muted-foreground">
				{#if !data.hasGpgPassphrase}
					{m.infra_gpg_none()}
				{:else if data.gpgPassphraseIsEmpty}
					{m.infra_gpg_set_empty()}
				{:else}
					{m.infra_gpg_set()}
				{/if}
			</p>
			<form method="POST" action="?/setGpgPassphrase" use:enhance class="space-y-2">
				<div class="flex gap-2">
					<Input
						type="password"
						name="passphrase"
						placeholder={m.infra_gpg_placeholder()}
						class="flex-1"
						disabled={noPassphrase}
						required={!noPassphrase}
					/>
					<Button type="submit" size="sm">{m.infra_gpg_save()}</Button>
				</div>
				<label class="flex items-center gap-2 text-sm text-muted-foreground">
					<input type="checkbox" name="noPassphrase" bind:checked={noPassphrase} />
					{m.infra_gpg_no_passphrase()}
				</label>
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
