import { db } from '$lib/server/db';
import { parseTargetTypeParam, parseReasonParam, resolvePublicRef } from '$lib/server/reports';
import { verifyTurnstileToken } from '$lib/server/turnstile';
import { notifyReviewers } from '$lib/server/notifications';
import type { RequestHandler } from './$types';

const MAX_DETAILS_LENGTH = 2000;
const MAX_EMAIL_LENGTH = 254;

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('Bad Request', { status: 400 });
	}
	const data = body as Record<string, unknown>;

	const targetType = parseTargetTypeParam(String(data.targetType ?? ''));
	if (!targetType) return new Response('Invalid targetType', { status: 400 });

	const targetRef = typeof data.targetRef === 'string' ? data.targetRef.trim() : '';
	if (!targetRef) return new Response('Missing targetRef', { status: 400 });

	const reason = parseReasonParam(String(data.reason ?? ''));
	if (!reason) return new Response('Invalid reason', { status: 400 });

	const details =
		typeof data.details === 'string' ? data.details.trim().slice(0, MAX_DETAILS_LENGTH) : '';
	const reporterEmail =
		typeof data.reporterEmail === 'string'
			? data.reporterEmail.trim().slice(0, MAX_EMAIL_LENGTH)
			: '';

	const verified = await verifyTurnstileToken(data.turnstileToken, 'report', getClientAddress());
	if (!verified) return new Response('Verification failed', { status: 403 });

	const target = await resolvePublicRef(targetType, targetRef);
	if (!target) return new Response('Not found', { status: 404 });

	await db.report.create({
		data: {
			targetType,
			targetId: target.id,
			reason,
			details: details || null,
			reporterEmail: reporterEmail || null
		}
	});

	await notifyReviewers({
		type: 'report_pending',
		title: `New report: ${target.name}`,
		link: `/dashboard/review/reports`
	});

	return Response.json({ ok: true });
};
