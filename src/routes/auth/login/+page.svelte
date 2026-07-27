<script lang="ts">
	import { goto } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import {
		FieldGroup,
		Field,
		FieldLabel,
		FieldDescription,
		FieldSeparator
	} from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as m from '$lib/paraglide/messages';

	const id = $props.id();

	let email = $state('');
	let password = $state('');
	let submitting = $state(false);
	let error = $state('');
	let unverified = $state(false);
	let resending = $state(false);
	let resent = $state(false);

	function loginWithGithub() {
		authClient.signIn.social({ provider: 'github', callbackURL: '/dashboard' });
	}

	function loginWithBlossomAccount() {
		authClient.signIn.oauth2({ providerId: 'blossom-accounts', callbackURL: '/dashboard' });
	}

	async function loginWithEmail(e: SubmitEvent) {
		e.preventDefault();
		submitting = true;
		error = '';
		unverified = false;
		resent = false;
		const { error: signInError } = await authClient.signIn.email({ email, password });
		submitting = false;
		if (signInError) {
			// Matches better-auth's BASE_ERROR_CODES.EMAIL_NOT_VERIFIED message exactly.
			unverified = signInError.message === 'Email not verified';
			error = unverified
				? m.auth_login_unverified()
				: (signInError.message ?? m.auth_login_error());
			return;
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto('/dashboard');
	}

	async function resendVerification() {
		if (!email) return;
		resending = true;
		await authClient.sendVerificationEmail({ email, callbackURL: '/dashboard' });
		resending = false;
		resent = true;
	}
</script>

<title>{m.auth_login_submit()} - Arc Forge</title>

<div class="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-6">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href="/" class="flex items-center gap-2 self-center font-medium">
		<img src="/arc.png" alt="Arc Forge" class="size-8" />
		Arc Forge
	</a>
	<Card.Root>
		<Card.Header class="text-center">
			<Card.Title class="text-xl">{m.auth_login_title()}</Card.Title>
			<Card.Description>{m.auth_login_description()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<form onsubmit={loginWithEmail}>
				<FieldGroup>
					<Field>
						<Button variant="default" type="button" onclick={loginWithGithub}>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-4">
								<path
									d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.207 11.387.6.113.793-.26.793-.577v-2.017c-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.84 1.238 1.84 1.238 1.07 1.834 2.807 1.304 3.492.997.108-.775.42-1.305.762-1.605-2.665-.303-5.466-1.333-5.466-5.93 0-1.31.468-2.38 1.235-3.22-.123-.303-.535-1.523.117-3.176 0 0 1.007-.322 3.3 1.23A11.5 11.5 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.24 2.873.117 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.805 5.625-5.478 5.92.43.372.823 1.103.823 2.222v3.293c0 .32.192.694.8.576C20.565 21.795 24 17.298 24 12c0-6.63-5.37-12-12-12"
									fill="currentColor"
								/>
							</svg>
							{m.auth_login_github()}
						</Button>
						<Button variant="default" type="button" onclick={loginWithBlossomAccount}>
							<img src="/logo.svg" alt="Blossom Logo" class="h-4 w-4" />
							{m.auth_login_blossom()}
						</Button>
					</Field>
					<FieldSeparator class="*:data-[slot=field-separator-content]:bg-card">
						{m.auth_login_separator()}
					</FieldSeparator>
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
						<div class="flex items-center">
							<FieldLabel for="password-{id}">{m.auth_password()}</FieldLabel>
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href="/auth/forgot-password"
								class="ms-auto text-sm underline-offset-4 hover:underline"
							>
								{m.auth_forgot_password()}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						</div>
						<Input id="password-{id}" type="password" bind:value={password} required />
					</Field>
					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{/if}
					{#if unverified}
						{#if resent}
							<p class="text-sm text-muted-foreground">{m.auth_verify_resent()}</p>
						{:else}
							<Button
								variant="ghost"
								type="button"
								size="sm"
								disabled={resending}
								onclick={resendVerification}
							>
								{m.auth_verify_resend()}
							</Button>
						{/if}
					{/if}
					<Field>
						<Button type="submit" disabled={submitting}>{m.auth_login_submit()}</Button>
						<FieldDescription class="text-center">
							{m.auth_login_no_account()}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href="/auth/signup">{m.auth_login_signup_link()}</a>
						</FieldDescription>
					</Field>
				</FieldGroup>
			</form>
		</Card.Content>
	</Card.Root>
</div>
