<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import {
		FieldGroup,
		Field,
		FieldLabel,
		FieldDescription
	} from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as m from '$lib/paraglide/messages';

	const id = $props.id();

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let submitting = $state(false);
	let error = $state('');

	async function signup(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (password !== confirmPassword) {
			error = m.auth_password_mismatch();
			return;
		}
		submitting = true;
		const { error: signUpError } = await authClient.signUp.email({ name, email, password });
		submitting = false;
		if (signUpError) {
			error = signUpError.message ?? m.auth_signup_error();
			return;
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`/auth/verify-email?email=${encodeURIComponent(email)}`);
	}
</script>

<title>{m.auth_signup_title()} - Arc Forge</title>

<div class="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-6">
	<Card.Root>
		<Card.Header class="text-center">
			<Card.Title class="text-xl">{m.auth_signup_title()}</Card.Title>
			<Card.Description>{m.auth_signup_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={signup}>
				<FieldGroup>
					<Field>
						<FieldLabel for="name-{id}">{m.auth_name()}</FieldLabel>
						<Input id="name-{id}" type="text" bind:value={name} required />
					</Field>
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
						<FieldLabel for="password-{id}">{m.auth_password()}</FieldLabel>
						<Input
							id="password-{id}"
							type="password"
							bind:value={password}
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
						<Button type="submit" disabled={submitting}>{m.auth_signup_submit()}</Button>
						<FieldDescription class="text-center">
							{m.auth_signup_have_account()}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href="/auth/login">{m.auth_signup_login_link()}</a>
						</FieldDescription>
					</Field>
				</FieldGroup>
			</form>
		</Card.Content>
	</Card.Root>
</div>
