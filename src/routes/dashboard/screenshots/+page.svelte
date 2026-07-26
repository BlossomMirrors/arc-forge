<script lang="ts">
	import { enhance } from '$app/forms';
	import { Trash2, Copy, Check } from '@lucide/svelte';
	import ScreenshotUploadButton from '$lib/components/screenshot-upload-button.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let submitForm: HTMLFormElement;
	let uploadUrl = $state('');
	let uploadMimeType = $state('');
	let uploadFileName = $state('');
	let uploadFileSize = $state(0);
	let uploading = $state(false);
	let copiedId = $state('');

	function onUploaded(file: { url: string; mimeType: string; fileName: string; fileSize: number }) {
		uploadUrl = file.url;
		uploadMimeType = file.mimeType;
		uploadFileName = file.fileName;
		uploadFileSize = file.fileSize;
		submitForm.requestSubmit();
	}

	function statusBadge(status: string): { label: string; class: string } {
		switch (status) {
			case 'APPROVED':
				return { label: m.screenshots_status_approved(), class: 'bg-green-500/10 text-green-600' };
			case 'REJECTED':
				return {
					label: m.screenshots_status_rejected(),
					class: 'bg-destructive/10 text-destructive'
				};
			default:
				return {
					label: m.screenshots_status_pending(),
					class: 'bg-amber-500/10 text-amber-600'
				};
		}
	}

	async function copyUrl(id: string, url: string) {
		await navigator.clipboard.writeText(url);
		copiedId = id;
		setTimeout(() => {
			if (copiedId === id) copiedId = '';
		}, 1500);
	}
</script>

<svelte:head>
	<title>{m.screenshots_heading()} - Arc Forge</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h2 class="text-lg font-semibold">{m.screenshots_heading()}</h2>
		<p class="text-sm text-muted-foreground">{m.screenshots_hint()}</p>
	</div>

	<form
		bind:this={submitForm}
		method="POST"
		action="?/submit"
		use:enhance={() => {
			uploading = true;
			return async ({ update }) => {
				await update();
				uploading = false;
			};
		}}
	>
		<input type="hidden" name="url" value={uploadUrl} />
		<input type="hidden" name="mimeType" value={uploadMimeType} />
		<input type="hidden" name="fileName" value={uploadFileName} />
		<input type="hidden" name="fileSize" value={uploadFileSize} />
		<ScreenshotUploadButton onuploaded={onUploaded} />
	</form>
	{#if uploading}
		<p class="text-sm text-muted-foreground">{m.screenshots_submitting()}</p>
	{/if}

	{#if data.submissions.length === 0}
		<p class="text-sm text-muted-foreground">{m.screenshots_empty()}</p>
	{:else}
		<ul class="divide-y divide-border rounded-lg border border-border">
			{#each data.submissions as submission (submission.id)}
				{@const badge = statusBadge(submission.status)}
				<li class="flex items-center gap-3 px-4 py-3">
					<img
						src={submission.url}
						alt={submission.fileName}
						class="h-14 w-24 shrink-0 rounded border border-border object-cover"
					/>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<p class="truncate text-sm font-medium">{submission.fileName}</p>
							<span class="rounded-full px-2 py-0.5 text-xs font-medium {badge.class}">
								{badge.label}
							</span>
						</div>
						{#if submission.status === 'APPROVED'}
							<div class="mt-1 flex items-center gap-1.5">
								<input
									type="text"
									readonly
									value={submission.url}
									class="h-7 w-full max-w-md rounded-md border border-input bg-muted/30 px-2 text-xs text-muted-foreground"
									onclick={(e) => (e.target as HTMLInputElement).select()}
								/>
								<button
									type="button"
									class="shrink-0 text-muted-foreground hover:text-foreground"
									title={m.screenshots_copy_url()}
									onclick={() => copyUrl(submission.id, submission.url)}
								>
									{#if copiedId === submission.id}
										<Check class="size-3.5 text-green-600" />
									{:else}
										<Copy class="size-3.5" />
									{/if}
								</button>
							</div>
						{:else if submission.status === 'REJECTED' && submission.reviewNote}
							<p class="mt-1 text-xs text-muted-foreground italic">"{submission.reviewNote}"</p>
						{/if}
					</div>
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="id" value={submission.id} />
						<button
							type="submit"
							class="shrink-0 text-muted-foreground hover:text-destructive"
							title={m.screenshots_delete()}
						>
							<Trash2 class="size-4" />
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</div>
