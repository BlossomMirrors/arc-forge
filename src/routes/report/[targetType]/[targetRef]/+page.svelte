<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { FieldGroup, Field, FieldLabel } from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	let reason = $state('malware_security');
	let details = $state('');
	let reporterEmail = $state('');
	let submitting = $state(false);
	let submitted = $state(false);
	let errorMessage = $state('');

	let turnstileToken = $state('');
	let turnstileContainer: HTMLDivElement | undefined = $state();
	let widgetId: string | undefined;

	onMount(() => {
		const script = document.createElement('script');
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
		script.async = true;
		script.defer = true;
		script.onload = () => {
			if (!turnstileContainer) return;
			widgetId = window.turnstile?.render(turnstileContainer, {
				sitekey: data.siteKey,
				action: 'report',
				callback: (token) => {
					turnstileToken = token;
				}
			});
		};
		document.head.appendChild(script);
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!turnstileToken) {
			errorMessage = m.report_error_verification();
			return;
		}
		submitting = true;
		errorMessage = '';
		try {
			const res = await fetch('/api/reports', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					targetType: data.targetType,
					targetRef: data.targetRef,
					reason,
					details,
					reporterEmail,
					turnstileToken
				})
			});
			if (!res.ok) {
				errorMessage = res.status === 403 ? m.report_error_verification() : m.report_error_generic();
				if (widgetId) window.turnstile?.reset(widgetId);
				turnstileToken = '';
				return;
			}
			submitted = true;
		} catch {
			errorMessage = m.report_error_generic();
		} finally {
			submitting = false;
		}
	}
</script>

<title>{m.report_heading()} - Arc Forge</title>

<div class="mx-auto flex max-w-sm flex-col justify-center gap-4 px-4 py-8">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.report_heading()}</Card.Title>
			<Card.Description>
				{m.report_target_label()}: <strong>{data.target.name}</strong>
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if submitted}
				<p class="text-sm text-muted-foreground">{m.report_submitted_hint()}</p>
			{:else}
				<form onsubmit={submit}>
					<FieldGroup>
						<Field>
							<FieldLabel for="reason">{m.report_reason_label()}</FieldLabel>
							<select
								id="reason"
								bind:value={reason}
								class="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
							>
								<option value="malware_security">{m.report_reason_malware()}</option>
								<option value="impersonation">{m.report_reason_impersonation()}</option>
								<option value="inappropriate_content">{m.report_reason_inappropriate()}</option>
								<option value="broken">{m.report_reason_broken()}</option>
								<option value="other">{m.report_reason_other()}</option>
							</select>
						</Field>
						<Field>
							<FieldLabel for="details">{m.report_details_label()}</FieldLabel>
							<Textarea
								id="details"
								bind:value={details}
								placeholder={m.report_details_placeholder()}
								rows={4}
							/>
						</Field>
						<Field>
							<FieldLabel for="email">{m.report_email_label()}</FieldLabel>
							<Input
								id="email"
								type="email"
								bind:value={reporterEmail}
								placeholder={m.report_email_placeholder()}
							/>
						</Field>
						<div bind:this={turnstileContainer}></div>
						{#if errorMessage}
							<p class="text-sm text-destructive">{errorMessage}</p>
						{/if}
						<Button type="submit" disabled={submitting}>{m.report_submit()}</Button>
					</FieldGroup>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
