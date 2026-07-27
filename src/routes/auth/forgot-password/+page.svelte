<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { FieldGroup, Field, FieldLabel } from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as m from '$lib/paraglide/messages';

	const id = $props.id();

	let email = $state('');
	let submitting = $state(false);
	let sent = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		submitting = true;
		await authClient.requestPasswordReset({ email, redirectTo: '/auth/reset-password' });
		submitting = false;
		sent = true;
	}
</script>

<title>{m.auth_forgot_title()} - Arc Forge</title>

<div class="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-6">
	<Card.Root>
		<Card.Header class="text-center">
			<Card.Title class="text-xl">{m.auth_forgot_title()}</Card.Title>
			<Card.Description>{m.auth_forgot_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if sent}
				<p class="text-center text-sm text-muted-foreground">{m.auth_forgot_sent()}</p>
			{:else}
				<form onsubmit={submit}>
					<FieldGroup>
						<Field>
							<FieldLabel for="email-{id}">{m.auth_email()}</FieldLabel>
							<Input
								id="email-{id}"
								type="email"
								bind:value={email}
								placeholder="m@example.com"
								required
							/>
						</Field>
						<Field>
							<Button type="submit" disabled={submitting}>{m.auth_forgot_submit()}</Button>
						</Field>
					</FieldGroup>
				</form>
			{/if}
			<p class="mt-4 text-center text-sm">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href="/auth/login" class="underline-offset-4 hover:underline">
					{m.auth_forgot_back_to_login()}
				</a>
			</p>
		</Card.Content>
	</Card.Root>
</div>
