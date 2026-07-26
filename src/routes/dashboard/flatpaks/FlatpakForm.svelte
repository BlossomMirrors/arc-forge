<script lang="ts">
	import { untrack } from 'svelte';
	import { Wand2, Loader2 } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as m from '$lib/paraglide/messages';
	import BundleUploadButton from '$lib/components/bundle-upload-button.svelte';
	import ConveyorLoader from '$lib/components/conveyor-loader.svelte';
	import Lightbox from '$lib/components/lightbox.svelte';

	type FlatpakFormData = {
		appid?: string;
		name?: string;
		summary?: string;
		iconUrl?: string;
		developerProfileId?: string | null;
		sourceType?: 'BUNDLE' | 'GIT';
		bundleUrl?: string | null;
		bundleFileName?: string | null;
		bundleSize?: number | null;
		gitUrl?: string | null;
		gitBranch?: string | null;
		gitManifestPath?: string | null;
	};

	type DeveloperProfile = { id: string; name: string };

	let {
		values = {},
		submitLabel = 'Save',
		isStaff = true,
		developerProfiles = [],
		processing = false
	}: {
		values?: FlatpakFormData;
		submitLabel?: string;
		isStaff?: boolean;
		developerProfiles?: DeveloperProfile[];
		processing?: boolean;
	} = $props();

	// Fixed once a submission exists (see the server actions), only choosable for a
	// brand new one.
	const isExisting = untrack(() => !!values.appid);
	let sourceKind = $state<'bundle' | 'git'>(
		untrack(() => (values.sourceType === 'GIT' ? 'git' : 'bundle'))
	);

	let bundleUrl = $state(untrack(() => values.bundleUrl ?? ''));
	let bundleFileName = $state(untrack(() => values.bundleFileName ?? ''));
	let bundleSize = $state(untrack(() => values.bundleSize ?? 0));

	type LocalizedMetadata = { name: string; summary: string; description: string };
	type BundlePreview = {
		appid: string;
		developerName: string;
		iconDataUrl: string | null;
		screenshots: string[];
		translations: Record<string, LocalizedMetadata>;
		defaultLang: string;
	};
	let previewing = $state(false);
	let preview = $state<BundlePreview | null>(null);
	let previewLang = $state('');
	let previewError = $state('');
	let previewLog = $state('');
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);

	const previewLangs = $derived(preview ? Object.keys(preview.translations).sort() : []);
	const previewText = $derived.by(() => {
		if (!preview) return undefined;
		return preview.translations[previewLang] ?? preview.translations[preview.defaultLang];
	});

	// AppStream's own spec for <description> only ever allows p/ul/ol/li, with no
	// attributes on any of them, this rebuilds the markup keeping only that exact
	// allowlist (any other tag is unwrapped to its text, never dropped silently)
	// rather than trusting a bundle's metainfo.xml enough to render it as-is.
	const ALLOWED_DESCRIPTION_TAGS = new Set(['P', 'UL', 'OL', 'LI']);

	function escapeHtml(text: string): string {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	function sanitizeDescriptionNode(node: ChildNode): string {
		if (node.nodeType === Node.TEXT_NODE) {
			return escapeHtml(node.textContent ?? '');
		}
		if (node.nodeType === Node.ELEMENT_NODE) {
			const el = node as Element;
			const inner = Array.from(el.childNodes).map(sanitizeDescriptionNode).join('');
			if (ALLOWED_DESCRIPTION_TAGS.has(el.tagName)) {
				const tag = el.tagName.toLowerCase();
				return `<${tag}>${inner}</${tag}>`;
			}
			return inner;
		}
		return '';
	}

	function sanitizeDescriptionHtml(html: string): string {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		return Array.from(doc.body.childNodes).map(sanitizeDescriptionNode).join('');
	}

	async function fetchPreview(url: string) {
		previewing = true;
		preview = null;
		previewError = '';
		previewLog = '';
		try {
			const res = await fetch('/api/preview-flatpak-metadata', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bundleUrl: url })
			});
			const data = await res.json();
			if (data.ok) {
				preview = data;
				previewLang = data.defaultLang;
			} else {
				previewError = data.error || m.form_bundle_preview_failed();
				previewLog = data.log ?? '';
			}
		} catch {
			previewError = m.form_bundle_preview_failed();
		} finally {
			previewing = false;
		}
	}

	let gitUrl = $state(untrack(() => values.gitUrl ?? ''));
	let gitBranch = $state(untrack(() => values.gitBranch ?? 'main'));
	let gitManifestPath = $state(untrack(() => values.gitManifestPath ?? ''));
	let detecting = $state(false);
	let detectError = $state('');

	async function detectManifest() {
		if (!gitUrl || !gitBranch) return;
		detecting = true;
		detectError = '';
		try {
			const res = await fetch('/api/detect-flatpak-manifest', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ gitUrl, gitBranch })
			});
			const data = await res.json();
			if (data.manifestPath) {
				gitManifestPath = data.manifestPath;
			} else if (data.error) {
				detectError = data.error;
			} else {
				detectError = m.form_git_manifest_not_found();
			}
		} catch {
			detectError = m.form_git_manifest_not_found();
		} finally {
			detecting = false;
		}
	}

	let canSubmit = $derived(sourceKind === 'bundle' ? !!bundleUrl : !!gitUrl && !!gitManifestPath);
</script>

<div class="space-y-4">
	{#if values.appid}
		<div class="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
			{#if values.iconUrl}
				<img src={values.iconUrl} alt={values.name} class="size-10 shrink-0 rounded" />
			{/if}
			<div class="min-w-0">
				<p class="text-sm font-medium">{values.name}</p>
				<code class="text-xs text-muted-foreground">{values.appid}</code>
				{#if values.summary}
					<p class="truncate text-xs text-muted-foreground">{values.summary}</p>
				{/if}
			</div>
		</div>
	{/if}

	<p class="text-sm text-muted-foreground">{m.form_appstream_hint()}</p>

	{#if !isStaff}
		<label class="space-y-1.5">
			<span class="text-sm font-medium">{m.form_developer_profile()}</span>
			<select
				name="developerProfileId"
				required
				class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
			>
				{#each developerProfiles as profile (profile.id)}
					<option value={profile.id} selected={profile.id === values.developerProfileId}>
						{profile.name}
					</option>
				{/each}
			</select>
		</label>
	{/if}

	<div class="space-y-1.5">
		<span class="block text-sm font-medium">{m.form_source()}</span>
		{#if !isExisting}
			<input type="hidden" name="sourceKind" value={sourceKind} />
			<div class="flex gap-2">
				<button
					type="button"
					onclick={() => (sourceKind = 'bundle')}
					class="flex-1 rounded-md border px-3 py-1.5 text-sm transition {sourceKind === 'bundle'
						? 'border-primary bg-primary/5 text-foreground'
						: 'border-input text-muted-foreground hover:bg-muted'}"
				>
					{m.form_source_bundle()}
				</button>
				<button
					type="button"
					onclick={() => (sourceKind = 'git')}
					class="flex-1 rounded-md border px-3 py-1.5 text-sm transition {sourceKind === 'git'
						? 'border-primary bg-primary/5 text-foreground'
						: 'border-input text-muted-foreground hover:bg-muted'}"
				>
					{m.form_source_git()}
				</button>
			</div>
		{:else}
			<input type="hidden" name="sourceKind" value={sourceKind} />
			<p class="text-sm text-muted-foreground">
				{sourceKind === 'git' ? m.form_source_git() : m.form_source_bundle()}
			</p>
		{/if}
	</div>

	{#if sourceKind === 'bundle'}
		<div class="space-y-1.5">
			<span class="block text-sm font-medium">{m.form_bundle()}</span>
			<input type="hidden" name="bundleUrl" bind:value={bundleUrl} />
			<input type="hidden" name="bundleFileName" bind:value={bundleFileName} />
			<input type="hidden" name="bundleSize" bind:value={bundleSize} />
			<BundleUploadButton
				{bundleFileName}
				{bundleSize}
				onbundle={(bundle) => {
					bundleUrl = bundle.url;
					bundleFileName = bundle.filename;
					bundleSize = bundle.size;
					fetchPreview(bundle.url);
				}}
			/>

			{#if previewing}
				<div
					class="flex items-center gap-2 rounded-lg border border-border p-3 text-sm text-muted-foreground"
				>
					<Loader2 class="size-4 animate-spin" />
					{m.form_bundle_preview_loading()}
				</div>
			{:else if preview && previewText}
				<div class="space-y-3 rounded-lg border border-border p-3">
					{#if previewLangs.length > 1}
						<div class="flex flex-wrap gap-1.5">
							{#each previewLangs as lang (lang)}
								<button
									type="button"
									onclick={() => (previewLang = lang)}
									class="rounded-full px-2.5 py-0.5 text-xs font-medium transition {lang ===
									previewLang
										? 'bg-primary/10 text-primary'
										: 'text-muted-foreground hover:bg-muted'}"
								>
									{lang}
								</button>
							{/each}
						</div>
					{/if}
					<div class="flex items-center gap-3">
						{#if preview.iconDataUrl}
							<img
								src={preview.iconDataUrl}
								alt={previewText.name}
								class="size-10 shrink-0 rounded"
							/>
						{:else}
							<div class="size-10 shrink-0 rounded bg-muted"></div>
						{/if}
						<div class="min-w-0">
							<p class="text-sm font-medium">{previewText.name}</p>
							<code class="text-xs text-muted-foreground">{preview.appid}</code>
							{#if previewText.summary}
								<p class="truncate text-xs text-muted-foreground">{previewText.summary}</p>
							{/if}
							{#if preview.developerName}
								<p class="text-xs text-muted-foreground">
									{m.form_developer_name()}: {preview.developerName}
								</p>
							{/if}
						</div>
					</div>
					{#if previewText.description}
						<!-- eslint-disable svelte/no-at-html-tags -->
						<div
							class="space-y-2 text-sm text-muted-foreground [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
						>
							{@html sanitizeDescriptionHtml(previewText.description)}
						</div>
						<!-- eslint-enable svelte/no-at-html-tags -->
					{/if}
					{#if preview.screenshots.length > 0}
						<div class="flex gap-2 overflow-x-auto">
							{#each preview.screenshots as url, i (url)}
								<button
									type="button"
									onclick={() => {
										lightboxIndex = i;
										lightboxOpen = true;
									}}
								>
									<img
										src={url}
										alt=""
										class="h-20 w-auto shrink-0 rounded border border-border transition-opacity hover:opacity-80"
									/>
								</button>
							{/each}
						</div>
						<Lightbox
							images={preview.screenshots}
							bind:open={lightboxOpen}
							bind:index={lightboxIndex}
						/>
					{/if}
				</div>
			{:else if previewError}
				<div class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
					<p class="font-medium text-destructive">{previewError}</p>
					{#if previewLog}
						<pre
							class="mt-2 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">{previewLog}</pre>
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<div class="space-y-3 rounded-lg border border-border p-4">
			<label class="mb-3 block">
				<span class="text-sm font-medium">{m.form_git_url()}</span>
				<Input
					name="gitUrl"
					bind:value={gitUrl}
					placeholder="https://github.com/org/app.git"
					class="mt-1 -ml-0.5"
				/>
			</label>
			<label class="mb-3 block">
				<span class="text-sm font-medium">{m.form_git_branch()}</span>
				<Input name="gitBranch" bind:value={gitBranch} placeholder="main" class="mt-1 -ml-0.5" />
			</label>
			<label class="mb-3 block">
				<span class="text-sm font-medium">{m.form_git_manifest_path()}</span>
				<div class="flex gap-2">
					<Input
						name="gitManifestPath"
						bind:value={gitManifestPath}
						placeholder="com.example.App.json"
						class="mt-1 -ml-0.5 flex-1"
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={!gitUrl || detecting}
						onclick={detectManifest}
						class="mt-1.5"
					>
						<Wand2 class="size-3.5" />
						{detecting ? m.form_git_detecting() : m.form_git_detect()}
					</Button>
				</div>
				{#if detectError}
					<p class="text-xs text-destructive">{detectError}</p>
				{/if}
				<p class="mt-1.5 text-xs text-muted-foreground">{m.form_git_hint()}</p>
			</label>
		</div>
	{/if}

	{#if processing}
		<div class="flex flex-col items-center gap-2 rounded-lg border border-border p-4">
			<ConveyorLoader />
			<p class="text-sm text-muted-foreground">{m.form_processing()}</p>
		</div>
	{:else}
		<div class="flex gap-2 pt-2">
			<Button type="submit" disabled={!canSubmit}>{submitLabel}</Button>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="/dashboard/flatpaks" class={buttonVariants({ variant: 'ghost' })}
				>{m.form_cancel()}</a
			>
		</div>
	{/if}
</div>
