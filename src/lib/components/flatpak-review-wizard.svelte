<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import {
		ShieldCheck,
		ExternalLink,
		Download,
		Copy,
		Check,
		CircleCheckBig,
		Loader2
	} from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import ConfirmAppidInput from '$lib/components/confirm-appid-input.svelte';
	import { sanitizeAppstreamDescription } from '$lib/client/sanitize-appstream-html';
	import * as m from '$lib/paraglide/messages';

	const VM_GUIDE_URL = 'https://help.blossomos.org/help/contributor/testing-in-a-vm';

	type PendingFlatpak = {
		id: string;
		appid: string;
		name: string;
		summary: string;
		description: string;
		iconUrl: string;
		homepageUrl: string;
		contentRating: string;
		developerName: string;
		sourceType: 'BUNDLE' | 'GIT';
		branch: string;
		bundleUrl: string | null;
		bundleFileName: string | null;
		bundleSize: number | null;
		gitUrl: string | null;
		gitBranch: string | null;
		gitManifestPath: string | null;
		submittedBy?: { name: string; email: string } | null;
	};

	let { app }: { app: PendingFlatpak } = $props();

	type Step = 'welcome' | 'metadata' | 'security' | 'source' | 'decision' | 'confirm' | 'finish';
	const STEPS: Step[] = [
		'welcome',
		'metadata',
		'security',
		'source',
		'decision',
		'confirm',
		'finish'
	];

	let open = $state(false);
	let step = $state<Step>('welcome');
	const stepIndex = $derived(STEPS.indexOf(step) + 1);

	let decision = $state<'publish' | 'deny' | null>(null);
	let note = $state('');
	let confirmText = $state('');
	let submitting = $state(false);
	let submitError = $state('');
	let commandsCopied = $state(false);

	const confirmed = $derived(confirmText.trim() === app.appid);
	const action = $derived(decision === 'deny' ? '?/rejectFlatpak' : '?/approveFlatpak');

	function reset() {
		step = 'welcome';
		decision = null;
		note = '';
		confirmText = '';
		submitError = '';
	}

	function back() {
		const i = STEPS.indexOf(step);
		if (i > 0) step = STEPS[i - 1];
	}

	function next() {
		const i = STEPS.indexOf(step);
		if (i < STEPS.length - 1) step = STEPS[i + 1];
	}

	function formatBytes(bytes: number | null): string {
		if (!bytes) return '';
		const units = ['B', 'KB', 'MB', 'GB'];
		let value = bytes;
		let unit = 0;
		while (value >= 1024 && unit < units.length - 1) {
			value /= 1024;
			unit++;
		}
		return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
	}

	const gitCommands = $derived(
		[
			`git clone --branch "${app.gitBranch}" --depth 1 "${app.gitUrl}" review-${app.appid}`,
			`cd review-${app.appid}`,
			`flatpak-builder --user --install --force-clean build-dir "${app.gitManifestPath}"`,
			`flatpak run ${app.appid}`
		].join('\n')
	);

	async function copyCommands(text: string) {
		await navigator.clipboard.writeText(text);
		commandsCopied = true;
		setTimeout(() => (commandsCopied = false), 2000);
	}

	const confirmEnhance: SubmitFunction = () => {
		submitting = true;
		submitError = '';
		return async ({ result }) => {
			submitting = false;
			if (result.type === 'failure') {
				submitError = (result.data?.error as string | undefined) ?? 'Something went wrong';
				return;
			}
			if (result.type === 'error') {
				submitError = result.error?.message ?? 'Something went wrong';
				return;
			}
			step = 'finish';
		};
	};

	function finish() {
		open = false;
		invalidateAll();
	}
</script>

<Dialog.Root bind:open onOpenChange={(isOpen) => !isOpen && reset()}>
	<Dialog.Trigger class={buttonVariants({ size: 'sm' })}>
		<ShieldCheck class="size-4" />
		{m.review_wizard_open()}
	</Dialog.Trigger>
	<Dialog.Content
		class="flex min-h-[28rem] flex-col sm:max-w-2xl"
		hideClose
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior="ignore"
	>
		{#if step !== 'finish'}
			<p class="text-xs text-muted-foreground">
				{m.review_wizard_step_of({ step: stepIndex, total: STEPS.length })}
			</p>
		{/if}

		{#if step === 'welcome'}
			<Dialog.Header>
				<Dialog.Title>{m.review_wizard_welcome_heading({ name: app.name })}</Dialog.Title>
				<Dialog.Description>{m.review_wizard_welcome_body()}</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer class="mt-auto">
				<Dialog.Close class={buttonVariants({ variant: 'ghost' })}>{m.form_cancel()}</Dialog.Close>
				<Button onclick={next}>{m.review_wizard_welcome_start()}</Button>
			</Dialog.Footer>
		{:else if step === 'metadata'}
			<Dialog.Header>
				<Dialog.Title>{m.review_wizard_metadata_heading()}</Dialog.Title>
				<Dialog.Description>{m.review_wizard_metadata_hint()}</Dialog.Description>
			</Dialog.Header>

			<div class="max-h-96 space-y-4 overflow-y-auto">
				<div class="flex items-start gap-3">
					<img
						src={app.iconUrl || '/default.svg'}
						alt={app.name}
						class="size-12 shrink-0 rounded"
						onerror={(e) => (e.currentTarget.src = '/default.svg')}
					/>
					<div class="min-w-0 flex-1 space-y-1">
						<div class="flex items-baseline gap-2">
							<p class="font-medium">{app.name}</p>
							<code class="text-xs text-muted-foreground">{app.appid}</code>
						</div>
						<p class="text-sm text-muted-foreground">{app.summary}</p>
					</div>
				</div>

				{#if app.description}
					<!-- eslint-disable svelte/no-at-html-tags -->
					<div class="prose prose-sm max-w-none text-sm text-muted-foreground">
						{@html sanitizeAppstreamDescription(app.description)}
					</div>
					<!-- eslint-enable svelte/no-at-html-tags -->
				{/if}

				<div class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
					<span
						>{m.review_submitted_by()} {app.submittedBy?.name ?? m.review_unknown_submitter()}</span
					>
					<span>{m.form_developer_name()}: {app.developerName}</span>
					<span>{m.form_content_rating()}: {app.contentRating}</span>
					<span>{m.review_wizard_metadata_branch()}: {app.branch}</span>
					{#if app.homepageUrl}
						<span class="col-span-2">
							{m.review_wizard_metadata_homepage()}:
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a href={app.homepageUrl} target="_blank" rel="noreferrer" class="underline"
								>{app.homepageUrl}</a
							>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						</span>
					{/if}
					{#if app.sourceType === 'GIT'}
						<span class="col-span-2">{m.form_source_git()}: {app.gitUrl} ({app.gitBranch})</span>
					{:else}
						<span class="col-span-2">
							{m.form_bundle()}: {app.bundleFileName} ({formatBytes(app.bundleSize)})
						</span>
					{/if}
				</div>
			</div>

			<Dialog.Footer class="mt-auto">
				<Button variant="ghost" onclick={back}>{m.review_wizard_back()}</Button>
				<Button onclick={next}>{m.review_wizard_continue()}</Button>
			</Dialog.Footer>
		{:else if step === 'security'}
			<Dialog.Header>
				<Dialog.Title>{m.review_wizard_security_heading()}</Dialog.Title>
				<Dialog.Description>{m.review_wizard_security_body()}</Dialog.Description>
			</Dialog.Header>

			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={VM_GUIDE_URL}
				target="_blank"
				rel="noreferrer"
				class={buttonVariants({ variant: 'ghost' })}
			>
				<ExternalLink class="size-4" />
				{m.review_wizard_security_guide_link()}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->

			<Dialog.Footer class="mt-auto">
				<Button variant="ghost" onclick={back}>{m.review_wizard_back()}</Button>
				<Button onclick={next}>{m.review_wizard_continue()}</Button>
			</Dialog.Footer>
		{:else if step === 'source'}
			{#if app.sourceType === 'GIT'}
				<Dialog.Header>
					<Dialog.Title>{m.review_wizard_git_heading()}</Dialog.Title>
					<Dialog.Description>{m.review_wizard_git_body()}</Dialog.Description>
				</Dialog.Header>

				<div class="space-y-2">
					<pre
						class="overflow-x-auto rounded bg-muted/50 p-2.5 font-mono text-xs whitespace-pre">{gitCommands}</pre>
					<Button variant="ghost" size="sm" onclick={() => copyCommands(gitCommands)}>
						{#if commandsCopied}<Check class="size-4" />{:else}<Copy class="size-4" />{/if}
						{m.review_wizard_copy_commands()}
					</Button>
				</div>
			{:else}
				<Dialog.Header>
					<Dialog.Title>{m.review_wizard_bundle_heading()}</Dialog.Title>
					<Dialog.Description>{m.review_wizard_bundle_body()}</Dialog.Description>
				</Dialog.Header>

				{#if app.bundleUrl}
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={app.bundleUrl}
						download={app.bundleFileName}
						target="_blank"
						rel="noreferrer"
						class={buttonVariants({ variant: 'ghost' })}
					>
						<Download class="size-4" />
						{m.review_download_bundle()}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
			{/if}

			<Dialog.Footer class="mt-auto">
				<Button variant="ghost" onclick={back}>{m.review_wizard_back()}</Button>
				<Button onclick={next}>{m.review_wizard_continue()}</Button>
			</Dialog.Footer>
		{:else if step === 'decision'}
			<Dialog.Header>
				<Dialog.Title>{m.review_wizard_decision_heading()}</Dialog.Title>
				<Dialog.Description>{m.review_wizard_decision_body()}</Dialog.Description>
			</Dialog.Header>

			<div class="flex gap-2">
				<Button
					variant={decision === 'publish' ? 'default' : 'ghost'}
					class="flex-1"
					onclick={() => (decision = 'publish')}
				>
					{m.review_wizard_decision_publish()}
				</Button>
				<Button
					variant={decision === 'deny' ? 'destructive' : 'ghost'}
					class="flex-1"
					onclick={() => (decision = 'deny')}
				>
					{m.review_wizard_decision_deny()}
				</Button>
			</div>

			{#if decision === 'deny'}
				<label class="block space-y-1.5">
					<span class="text-sm font-medium">{m.review_note_placeholder()}</span>
					<textarea
						bind:value={note}
						rows="2"
						class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
					></textarea>
				</label>
			{/if}

			<Dialog.Footer class="mt-auto">
				<Button variant="ghost" onclick={back}>{m.review_wizard_back()}</Button>
				<Button onclick={next} disabled={decision === null}>{m.review_wizard_continue()}</Button>
			</Dialog.Footer>
		{:else if step === 'confirm'}
			<Dialog.Header>
				<Dialog.Title>{m.review_wizard_confirm_heading()}</Dialog.Title>
				<Dialog.Description>
					{decision === 'deny'
						? m.review_wizard_confirm_deny_body({ name: app.name })
						: m.review_wizard_confirm_publish_body({ name: app.name })}
				</Dialog.Description>
			</Dialog.Header>

			<form
				method="POST"
				{action}
				use:enhance={confirmEnhance}
				class="flex flex-1 flex-col space-y-4"
			>
				<input type="hidden" name="id" value={app.id} />
				{#if decision === 'deny'}
					<input type="hidden" name="note" value={note} />
				{/if}

				<ConfirmAppidInput appid={app.appid} bind:value={confirmText} />

				{#if submitError}
					<p class="text-sm text-destructive">{submitError}</p>
				{/if}

				<Dialog.Footer class="mt-auto">
					<Button type="button" variant="ghost" onclick={back} disabled={submitting}>
						{m.review_wizard_back()}
					</Button>
					<Button
						type="submit"
						variant={decision === 'deny' ? 'destructive' : 'default'}
						disabled={!confirmed || submitting}
					>
						{#if submitting}
							<Loader2 class="size-4 animate-spin" />
						{/if}
						{decision === 'deny'
							? m.review_wizard_confirm_deny_button()
							: m.review_wizard_confirm_publish_button()}
					</Button>
				</Dialog.Footer>
			</form>
		{:else}
			<div class="flex flex-col items-center gap-3 py-6 text-center">
				<CircleCheckBig class="size-16 text-green-500" />
				<div>
					<p class="text-lg font-semibold">
						{decision === 'deny'
							? m.review_wizard_finish_denied_heading()
							: m.review_wizard_finish_published_heading()}
					</p>
					<p class="text-sm text-muted-foreground">
						{decision === 'deny'
							? m.review_wizard_finish_denied_body({ name: app.name })
							: m.review_wizard_finish_published_body({ name: app.name })}
					</p>
				</div>
			</div>
			<Dialog.Footer class="mt-auto">
				<Button onclick={finish}>{m.review_wizard_done()}</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
