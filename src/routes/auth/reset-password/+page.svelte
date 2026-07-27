<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { FieldGroup, Field, FieldLabel } from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as m from '$lib/paraglide/messages';

	const id = $props.id();
	const token = $derived(page.url.searchParams.get('token') ?? '');

	let newPassword = $state('');
	let confirmPassword = $state('');
	let submitting = $state(false);
	let error = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (newPassword !== confirmPassword) {
			error = m.auth_password_mismatch();
			return;
		}
		submitting = true;
		const { error: resetError } = await authClient.resetPassword({ newPassword, token });
		submitting = false;
		if (resetError) {
			error = resetError.message ?? m.auth_reset_invalid_token();
			return;
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto('/auth/login');
	}
</script>

<title>{m.auth_reset_title()} - Arc Forge</title>

<div class="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-6">
	<Card.Root>
		<Card.Header class="text-center">
			<Card.Title class="text-xl">{m.auth_reset_title()}</Card.Title>
			<Card.Description>{m.auth_reset_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if !token}
				<p class="text-center text-sm text-destructive">{m.auth_reset_invalid_token()}</p>
			{:else}
				<form onsubmit={submit}>
					<FieldGroup>
						<Field>
							<FieldLabel for="password-{id}">{m.auth_reset_new_password()}</FieldLabel>
							<Input
								id="password-{id}"
								type="password"
								bind:value={newPassword}
								required
								minlength={8}
							/>
						</Field>
						<Field>
							<FieldLabel for="confirm-password-{id}">{m.auth_confirm_password()}</FieldLabel>
							<Input
								id="confirm-password-{id}"
								type="password"
								bind:value={confirmPassword}
								required
								minlength={8}
							/>
						</Field>
						{#if error}
							<p class="text-sm text-destructive">{error}</p>
						{/if}
						<Field>
							<Button type="submit" disabled={submitting}>{m.auth_reset_submit()}</Button>
						</Field>
					</FieldGroup>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
