<script lang="ts">
	import { Search } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input/index.js';

	let { value = $bindable(''), placeholder = '' }: { value?: string; placeholder?: string } =
		$props();
</script>

<div class="relative">
	<Search
		class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
	/>
	<Input type="search" bind:value {placeholder} class="pl-8" />
</div>
