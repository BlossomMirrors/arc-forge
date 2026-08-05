<script lang="ts">
	import { Upload, FileArchive } from '@lucide/svelte';
	import ConveyorLoader from './conveyor-loader.svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		bundleFileName = '',
		bundleSize = 0,
		onbundle
	}: {
		bundleFileName?: string;
		bundleSize?: number;
		onbundle: (bundle: { url: string; filename: string; size: number }) => void;
	} = $props();

	let input: HTMLInputElement;
	let uploading = $state(false);
	let dragging = $state(false);
	let progress = $state(0);
	let loadedBytes = $state(0);
	let totalBytes = $state(0);
	let error = $state('');

	// Reaching 100% only means the browser finished sending bytes - the server
	// still has to write the file out to R2, which for a large bundle can take
	// a while with no further progress events. Without this, the bar sits
	// frozen at "100% - 200.0 MB / 200.0 MB" indefinitely and reads as hung.
	let finishing = $derived(progress >= 100);

	function formatMb(bytes: number): string {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// fetch() has no upload progress event, so a large bundle upload needs
	// XMLHttpRequest instead to drive the progress bar.
	function uploadWithProgress(
		file: File
	): Promise<{ url: string; filename: string; size: number }> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('POST', '/api/upload-flatpak');
			xhr.upload.onprogress = (e) => {
				if (!e.lengthComputable) return;
				loadedBytes = e.loaded;
				totalBytes = e.total;
				progress = Math.round((e.loaded / e.total) * 100);
			};
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve(JSON.parse(xhr.responseText));
				} else {
					reject(new Error(xhr.responseText || 'Upload failed'));
				}
			};
			xhr.onerror = () => reject(new Error('Upload failed'));
			const body = new FormData();
			body.append('file', file);
			xhr.send(body);
		});
	}

	async function startUpload(file: File) {
		if (!file.name.toLowerCase().endsWith('.flatpak')) {
			error = 'Only .flatpak files are accepted';
			return;
		}
		uploading = true;
		progress = 0;
		loadedBytes = 0;
		totalBytes = file.size;
		error = '';
		try {
			const bundle = await uploadWithProgress(file);
			onbundle(bundle);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	function handleChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) startUpload(file);
	}

	function handleClick() {
		if (!uploading) input.click();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (uploading) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			input.click();
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (uploading) return;
		const file = e.dataTransfer?.files?.[0];
		if (file) startUpload(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		if (!uploading) dragging = true;
	}

	function handleDragLeave() {
		dragging = false;
	}
</script>

<input bind:this={input} type="file" accept=".flatpak" class="hidden" onchange={handleChange} />

<div
	role="button"
	tabindex="0"
	onclick={handleClick}
	onkeydown={handleKeydown}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	class="flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors {uploading
		? 'cursor-default'
		: 'cursor-pointer'} {dragging
		? 'border-primary bg-primary/5'
		: 'border-input hover:border-primary/50'}"
>
	{#if uploading}
		<ConveyorLoader />
		<div class="h-1.5 w-60 overflow-hidden rounded-full bg-muted">
			<div
				class="h-full rounded-full bg-primary transition-[width] duration-150"
				class:animate-pulse={finishing}
				style="width: {progress}%"
			></div>
		</div>
		<p class="text-xs text-muted-foreground">
			{#if finishing}
				{m.form_bundle_finishing()}
			{:else}
				{progress}% · {formatMb(loadedBytes)} / {formatMb(totalBytes)}
			{/if}
		</p>
	{:else if bundleFileName}
		<FileArchive class="size-8 text-muted-foreground" />
		<p class="text-sm font-medium">{bundleFileName}</p>
		<p class="text-xs text-muted-foreground">
			{formatMb(bundleSize)} · {m.form_bundle_replace_hint()}
		</p>
	{:else}
		<Upload class="size-8 text-muted-foreground" />
		<p class="text-sm font-medium">{m.form_bundle_dropzone()}</p>
		<p class="text-xs text-muted-foreground">{m.form_bundle_browse_hint()}</p>
	{/if}
	{#if error}
		<p class="text-xs text-destructive">{error}</p>
	{/if}
</div>
