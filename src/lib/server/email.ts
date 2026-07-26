import { env } from '$env/dynamic/private';

const FROM_NAME = 'Arc Forge';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function emailNotificationsEnabled(): boolean {
	return env.EMAIL_NOTIFICATIONS_ENABLED !== 'false';
}

// Never throws: an email provider hiccup shouldn't fail the review/submission
// action that triggered the notification, the in-app notification row is already
// the source of truth, email is just a convenience on top of it.
export async function sendEmail(params: {
	to: string;
	subject: string;
	html: string;
}): Promise<void> {
	if (!emailNotificationsEnabled()) return;
	if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
		console.warn('Email notifications enabled but RESEND_API_KEY/RESEND_FROM_EMAIL are not set');
		return;
	}

	try {
		const res = await fetch(RESEND_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: `${FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
				to: params.to,
				subject: params.subject,
				html: params.html
			})
		});
		if (!res.ok) {
			console.error(`Resend request failed (${res.status}):`, await res.text());
		}
	} catch (e) {
		console.error('Resend request failed:', e instanceof Error ? e.message : e);
	}
}

// Titles/bodies often embed developer- or reviewer-supplied free text (app names,
// review notes), escape before interpolating into HTML rather than trusting it.
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function renderNotificationEmail(params: {
	title: string;
	body?: string;
	linkUrl?: string;
}): string {
	const linkHtml = params.linkUrl
		? `<p style="margin:24px 0 0"><a href="${params.linkUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px">Open in Arc Forge</a></p>`
		: '';
	return `
		<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827">
			<p style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;margin:0 0 8px">Arc Forge</p>
			<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(params.title)}</h1>
			${params.body ? `<p style="font-size:14px;line-height:1.5;color:#374151;margin:0">${escapeHtml(params.body)}</p>` : ''}
			${linkHtml}
		</div>
	`;
}
