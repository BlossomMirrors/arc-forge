<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as EmojiPicker from '$lib/components/ui/emoji-picker/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import UploadButton from '$lib/components/upload-button.svelte';
	import ListIcon from '$lib/components/list-icon.svelte';
	import { curatedIcons } from '$lib/curated-icons';
	import { encodeEmojiIcon, encodeLucideIcon, parseIconValue } from '$lib/icon-value';
	import * as m from '$lib/paraglide/messages';

	let { value = $bindable('') }: { value?: string } = $props();

	let open = $state(false);
	let tab = $state<'emoji' | 'lucide' | 'image'>('emoji');

	const initialParsed = parseIconValue(value);
	let lucideColor = $state(initialParsed?.type === 'lucide' ? initialParsed.color : '#71717a');

	function selectEmoji(emoji: string) {
		value = encodeEmojiIcon(emoji);
		open = false;
	}

	function selectLucide(name: string) {
		value = encodeLucideIcon(name, lucideColor);
		open = false;
	}

	function selectImage(url: string) {
		value = url;
		open = false;
	}

	const tabs = [
		{ id: 'emoji', label: m.lists_icon_tab_emoji } as const,
		{ id: 'lucide', label: m.lists_icon_tab_lucide } as const,
		{ id: 'image', label: m.lists_icon_tab_image } as const
	];
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<Button variant="ghost" size="icon" {...props}>
				<ListIcon icon={value} size="size-8" />
			</Button>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m.lists_icon_choose()}</Dialog.Title>
		</Dialog.Header>
		<div class="flex gap-1 border-b border-border">
			{#each tabs as t (t.id)}
				<button
					type="button"
					class="border-b-2 px-3 py-1.5 text-sm font-medium transition {tab === t.id
						? 'border-primary text-foreground'
						: 'border-transparent text-muted-foreground hover:text-foreground'}"
					onclick={() => (tab = t.id)}
				>
					{t.label()}
				</button>
			{/each}
		</div>

		{#if tab === 'emoji'}
			<EmojiPicker.Root
				showRecents
				recentsKey="list-icon"
				onSelect={(e) => selectEmoji(e.emoji)}
				class="w-full max-w-none"
			>
				<EmojiPicker.Viewport class="w-full">
					<EmojiPicker.Search />
					<EmojiPicker.List class="h-80" />
				</EmojiPicker.Viewport>
			</EmojiPicker.Root>
		{:else if tab === 'lucide'}
			<div class="space-y-3">
				<label class="flex items-center gap-2 text-sm">
					<span class="font-medium">{m.lists_icon_color_label()}</span>
					<input
						type="color"
						bind:value={lucideColor}
						class="h-8 w-12 rounded border border-input"
					/>
				</label>
				<div class="grid max-h-80 grid-cols-8 gap-1 overflow-y-auto">
					{#each curatedIcons as entry (entry.name)}
						{@const Icon = entry.icon}
						<button
							type="button"
							class="flex aspect-square items-center justify-center rounded hover:bg-muted"
							title={entry.name}
							onclick={() => selectLucide(entry.name)}
						>
							<Icon class="size-4" style="color: {lucideColor}" />
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<div class="space-y-3">
				<p class="text-sm text-muted-foreground">{m.lists_icon_upload_hint()}</p>
				<UploadButton onurl={selectImage} />
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
