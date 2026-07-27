<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as m from '$lib/paraglide/messages';

	const email = $derived(page.url.searchParams.get('email') ?? '');

	let resending = $state(false);
	let resent = $state(false);

	async function resend() {
		if (!email) return;
		resending = true;
		resent = false;
		await authClient.sendVerificationEmail({ email, callbackURL: '/dashboard' });
		resending = false;
		resent = true;
	}
</script>

<div class="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-6">
	<Card.Root>
		<Card.Header class="text-center">
			<Card.Title class="text-xl">{m.auth_verify_title()}</Card.Title>
			<Card.Description>{m.auth_verify_description({ email })}</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col items-center gap-4">
			<Button variant="default" type="button" disabled={resending || !email} onclick={resend}>
				{m.auth_verify_resend()}
			</Button>
			{#if resent}
				<p class="text-sm text-muted-foreground">{m.auth_verify_resent()}</p>
			{/if}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="/auth/login" class="text-sm underline-offset-4 hover:underline">
				{m.auth_verify_back_to_login()}
			</a>
		</Card.Content>
	</Card.Root>
</div>
